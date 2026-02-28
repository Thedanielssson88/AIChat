import { GoogleGenAI } from "@google/genai";
import { initLlama } from 'llama-cpp-capacitor';
import { registerPlugin } from '@capacitor/core';

interface GeminiNanoPlugin {
  generateText(options: { systemPrompt: string, prompt: string }): Promise<{ text: string }>;
  getRealPath(options: { uri: string }): Promise<{ path: string }>;
}
const GeminiNano = registerPlugin<GeminiNanoPlugin>('GeminiNano');
import { db, getEntry, getEntryAudio, getDay, getEntriesForDay, updateEntry, updateDay } from "./db";

export const DEFAULT_DIARY_PROMPT = `Du är en expert på att skriva personliga dagboksinlägg.
Din uppgift är att skriva ett sammanhängande och reflekterande dagboksinlägg baserat på mina röstanteckningar.
Skriv i JAG-form. Fånga mina känslor, vad jag har gjort och vilka jag har träffat.`;

export const DEFAULT_QUESTIONS_PROMPT = `Du är min personliga AI-coach och dagbok. Din uppgift är att ställa 2-3 öppna, reflekterande frågor till mig i "du"-form baserat på mina anteckningar.`;

const extractJson = (text: string, startChar: '{' | '[', endChar: '}' | ']') => {
  const first = text.indexOf(startChar);
  const last = text.lastIndexOf(endChar);
  if (first === -1 || last === -1 || last < first) return null;
  return text.substring(first, last + 1);
};

const getConfig = (type: 'transcribe' | 'summary' | 'questions') => {
  const tempMap = { transcribe: 0.0, summary: 0.3, questions: 0.0 };
  const tokenMap = { transcribe: 2000, summary: 1500, questions: 500 };
  return {
    temp: Number(localStorage.getItem(`TEMP_${type.toUpperCase()}`) || tempMap[type]),
    maxTokens: Number(localStorage.getItem(`MAX_TOKENS_${type.toUpperCase()}`) || tokenMap[type])
  };
};

let llamaContext: any = null;
let isModelLoaded = false;

export const initLocalEngine = async (onProgress?: (percent: number, text: string) => void) => {
  if (isModelLoaded && llamaContext) return;
  const savedUri = localStorage.getItem('LOCAL_MODEL_PATH');
  if (!savedUri) return;
  try {
    const { path: realPath } = await GeminiNano.getRealPath({ uri: savedUri });
    llamaContext = await initLlama({ model: realPath, n_ctx: 2048, n_threads: 4, n_gpu_layers: 99 });
    isModelLoaded = true;
  } catch (err) {
    console.error("Native Llama error:", err);
  }
};

const runLocalLlama = async (sys: string, prompt: string, temp: number, max: number, onProgress?: any) => {
  if (!isModelLoaded) await initLocalEngine();
  const formatted = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${sys}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
  const result = await llamaContext.completion({ prompt: formatted, n_predict: max, temperature: temp });
  return result.text || "";
};

const runLMStudio = async (system: string, prompt: string, temp: number, max: number, onProgress?: any) => {
  onProgress?.(20, "Ansluter till AI...");
  const baseUrl = localStorage.getItem('LLM_SERVER_URL') || 'http://10.0.2.2:1234/v1';
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature: temp, max_tokens: max })
    });
    if (!response.ok) throw new Error(`Server svarade med status: ${response.status}`);
    const data = await response.json();
    if (data?.choices?.[0]?.message) return data.choices[0].message.content || "";
    throw new Error("Servern skickade ett okänt format.");
  } catch (err: any) { throw new Error(`Kunde inte nå AI-servern (${baseUrl}): ${err.message}`); }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const convertTo16kHzMonoWav = async (audioBlob: Blob): Promise<Blob> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);
  const length = channelData.length * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let pos = 0;
  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
  const writeString = (s: string) => { for (let i = 0; i < s.length; i++) { view.setUint8(pos, s.charCodeAt(i)); pos++; } };
  writeString('RIFF'); setUint32(length - 8);
  writeString('WAVE'); writeString('fmt ');
  setUint32(16); setUint16(1); setUint16(1);
  setUint32(16000); setUint32(16000 * 2); setUint16(2); setUint16(16);
  writeString('data'); setUint32(length - pos - 4);
  for (let i = 0; i < channelData.length; i++) {
    let sample = Math.max(-1, Math.min(1, channelData[i]));
    sample = sample < 0 ? sample * 32768 : sample * 32767;
    view.setInt16(pos, sample, true); pos += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

const getAIClient = () => { const apiKey = localStorage.getItem('GEMINI_API_KEY'); return apiKey ? new GoogleGenAI({ apiKey }) : null; };
export const hasApiKey = () => !!localStorage.getItem('GEMINI_API_KEY');
const getModelName = () => (localStorage.getItem('GEMINI_MODEL') === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash');

const runLMStudioWhisper = async (audioBlob: Blob, onProgress?: (p: number, msg: string) => void): Promise<string> => {
  onProgress?.(20, "Konverterar ljud...");
  const wavBlob = await convertTo16kHzMonoWav(audioBlob);
  const SERVER_URL = (localStorage.getItem('WHISPER_SERVER_URL') || '').trim();
  const language = localStorage.getItem('TRANSCRIPTION_LANG') || 'sv';
  if (!SERVER_URL) throw new Error("Ingen URL angiven för Whisper i inställningar.");

  const formData = new FormData();
  formData.append("file", wavBlob, "recording.wav");
  if (language) {
    formData.append("language", language);
    formData.append("prompt", language === 'sv' ? "Hej, här är en svensk dagbok/möte." : "Hello, this is an English recording.");
  }
  try {
    onProgress?.(50, `Ansluter till ${SERVER_URL}...`);
    const response = await fetch(SERVER_URL, { method: "POST", body: formData });
    if (!response.ok) throw new Error(`Serverfel ${response.status}: ${await response.text()}`);
    onProgress?.(90, "Tolkar svar...");
    const data = await response.json();
    return data.text || "";
  } catch (err: any) { throw new Error(`${err.message}`); }
};

// ==========================================
// MÖTES-FUNKTIONER (CRM)
// ==========================================
export const processMeetingAI = async (meetingId: string, onProgress?: (p: number, msg: string) => void) => {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) throw new Error("Mötet saknas i databasen.");

  let transcriptionText = "";

  // 1. Transkribering
  if (!meeting.transcription || meeting.transcription.length === 0) {
    onProgress?.(5, "Hämtar ljudfil...");
    const audio = await db.audioFiles.get(meetingId);
    if (!audio) throw new Error("Kunde inte hitta ljudfilen.");

    const mode = localStorage.getItem('TRANSCRIPTION_MODE') || 'api';

    if (mode === 'lmstudio') {
      transcriptionText = await runLMStudioWhisper(audio.blob, onProgress);
    } else if (mode === 'local') {
      transcriptionText = "Inget tal registrerades av den lokala röstmotorn.";
    } else {
      onProgress?.(20, "Förbereder fil för molnet...");
      const ai = getAIClient();
      if (!ai) throw new Error("API-nyckel saknas för transkribering.");
      const base64Audio = await blobToBase64(audio.blob);
      onProgress?.(50, "Skickar till Gemini API...");
      const result = await ai.models.generateContent({
        model: getModelName(),
                                                     contents: [{ parts: [{ text: "Transkribera talet exakt." }, { inlineData: { mimeType: audio.mimeType, data: base64Audio } }] }]
      });
      transcriptionText = result.text || "";
    }

    const transcription = [{ start: 0, end: 0, text: transcriptionText, speaker: "Inspelning" }];
    await db.meetings.update(meetingId, { transcription });
    meeting.transcription = transcription;
  } else {
    transcriptionText = meeting.transcription.map((t: any) => t.text).join('\n');
  }

  // 2. Sammanfattning & Uppgifter
  onProgress?.(70, "Skapar mötesanteckningar...");
  const summaryMode = localStorage.getItem('SUMMARY_MODE') || 'api';
  const param = getConfig('summary');
  const customPrompt = localStorage.getItem('GEMINI_PROMPT') || "Sammanfatta mötet och extrahera beslut och uppgifter.";

  const fullPrompt = `${customPrompt}\n\nTranskript:\n${transcriptionText}\n\nSvara med ett JSON-objekt: {"summary": "...", "decisions": ["..."], "tasks": ["..."]}`;

  let raw = "";
  if (summaryMode === 'lmstudio') {
    const sysSum = localStorage.getItem('LM_SYS_SUMMARY') || 'Svara endast med JSON.';
    raw = await runLMStudio(sysSum, fullPrompt, param.temp, param.maxTokens, onProgress);
  } else if (summaryMode === 'local') {
    raw = await runLocalLlama("Svara med JSON", fullPrompt, param.temp, param.maxTokens, onProgress);
  } else {
    const ai = getAIClient();
    const res = await ai!.models.generateContent({
      model: getModelName(),
                                                 contents: [{ parts: [{ text: fullPrompt }] }]
    });
    raw = res.text || "{}";
  }

  const jsonStr = extractJson(raw, '{', '}');
  let summaryData: any = { summary: "", decisions: [], tasks: [] };
  if (jsonStr) {
    try { summaryData = JSON.parse(jsonStr); } catch(e) {}
  }

  await db.meetings.update(meetingId, {
    isProcessed: true,
    protocol: {
      summary: summaryData.summary || summaryData.summering || "",
      decisions: summaryData.decisions || summaryData.beslut || [],
      actionPoints: summaryData.tasks || summaryData.uppgifter || []
    }
  });

  // 3. Skapa uppgifter i databasen automatiskt
  const tasksToCreate = summaryData.tasks || summaryData.uppgifter || [];
  for (const t of tasksToCreate) {
    await db.tasks.add({
      id: crypto.randomUUID(),
                       title: typeof t === 'string' ? t : t.title || "Uppgift",
                       status: 'pending',
                       linkedMeetingId: meetingId,
                       createdAt: new Date().toISOString()
    });
  }
  onProgress?.(100, "Mötet analyserat!");
};

export const reprocessMeetingFromText = async (meetingId: string, onProgress?: any) => {
  await processMeetingAI(meetingId, onProgress);
};

// ==========================================
// DAGBOKS-FUNKTIONER
// ==========================================
export const transcribeEntryAI = async (entryId: string, onProgress?: (p: number, msg: string) => void) => {
  const mode = localStorage.getItem('TRANSCRIPTION_MODE') || 'api';
  const entry = await getEntry(entryId);
  if (!entry) throw new Error("Inlägg saknas i databasen.");
  if (entry.isTranscribed && entry.transcription) { onProgress?.(100, 'Klar'); return { text: entry.transcription }; }

  onProgress?.(5, "Hämtar ljudfil...");
  const audio = await getEntryAudio(entryId);
  if (!audio) throw new Error("Kunde inte hitta ljudfilen.");

  if (mode === 'lmstudio') {
    try {
      const transcriptionText = await runLMStudioWhisper(audio.blob, onProgress);
      await updateEntry(entryId, { transcription: transcriptionText, isTranscribed: true });
      return { text: transcriptionText };
    } catch (error: any) {
      await updateEntry(entryId, { transcription: `[FEL: ${error.message}]`, isTranscribed: true });
      return { text: `[FEL: ${error.message}]` };
    }
  }
  if (mode === 'local') {
    await updateEntry(entryId, { transcription: "Inget tal registrerades av den lokala röstmotorn.", isTranscribed: true });
    return { text: "" };
  }

  onProgress?.(20, "Förbereder fil för molnet...");
  const ai = getAIClient();
  if (!ai) throw new Error("API-nyckel saknas.");
  const base64Audio = await blobToBase64(audio.blob);
  onProgress?.(50, "Skickar till Gemini API...");
  const result = await ai.models.generateContent({
    model: getModelName(),
                                                 contents: [{ parts: [{ text: "Transkribera talet exakt." }, { inlineData: { mimeType: audio.mimeType, data: base64Audio } }] }]
  });

  const text = result.text || "";
  await updateEntry(entryId, { transcription: text, isTranscribed: true });
  return { text };
};

export const summarizeDayAI = async (dayId: string, onProgress?: any) => {
  const mode = localStorage.getItem('SUMMARY_MODE') || 'api';
  const param = getConfig('summary');
  const day = await getDay(dayId);
  const entries = await getEntriesForDay(dayId);
  if (!day || entries.length === 0) throw new Error("Ingen data.");

  const transcriptions = entries.filter(e => e.isTranscribed && e.transcription).map(e => e.transcription).join('\n\n');
  const customPrompt = localStorage.getItem('GEMINI_PROMPT') || DEFAULT_DIARY_PROMPT;

  let raw = "";
  if (mode === 'lmstudio') {
    const sysSum = localStorage.getItem('LM_SYS_SUMMARY') || 'Svara med JSON.';
    raw = await runLMStudio(sysSum, `${customPrompt}\n\nAnteckningar:\n${transcriptions}`, param.temp, param.maxTokens, onProgress);
  } else if (mode === 'local') {
    raw = await runLocalLlama(customPrompt, transcriptions, param.temp, param.maxTokens, onProgress);
  } else {
    const ai = getAIClient();
    const res = await ai!.models.generateContent({
      model: getModelName(),
                                                 contents: [{ parts: [{ text: `${customPrompt}\n\n${transcriptions}` }] }],
                                                 config: { responseMimeType: "application/json" }
    });
    raw = res.text || "{}";
  }

  const jsonStr = extractJson(raw, '{', '}');
  if (!jsonStr) throw new Error("JSON saknas i svaret.");
  const responseData = JSON.parse(jsonStr);

  await updateDay(dayId, {
    summary: responseData.summary || responseData.summering || "",
    mood: responseData.mood || responseData.humör || "",
    learnings: responseData.learnings || responseData.inlärningar || [],
    summarizedAt: new Date().toISOString()
  });
  return responseData;
};

export const generateQuestionsAI = async (dayId: string, onProgress?: any) => {
  const mode = localStorage.getItem('SUMMARY_MODE') || 'api';
  const param = getConfig('questions');
  const entries = await getEntriesForDay(dayId);
  const transcriptions = entries.filter(e => e.isTranscribed).map(e => e.transcription).join('\n\n');
  const customPrompt = localStorage.getItem('GEMINI_QUESTIONS_PROMPT') || DEFAULT_QUESTIONS_PROMPT;

  let raw = "";
  if (mode === 'lmstudio') {
    const sys = localStorage.getItem('LM_SYS_QUESTIONS') || 'Svara med en JSON-lista.';
    raw = await runLMStudio(sys, `${customPrompt}\n\nAnteckningar:\n${transcriptions}`, param.temp, param.maxTokens, onProgress);
  } else if (mode === 'local') {
    raw = await runLocalLlama(customPrompt, transcriptions, param.temp, param.maxTokens, onProgress);
  } else {
    const ai = getAIClient();
    const res = await ai!.models.generateContent({
      model: getModelName(),
                                                 contents: [{ parts: [{ text: `${customPrompt}\n\n${transcriptions}` }] }]
    });
    raw = res.text || "[]";
  }

  const jsonArrStr = extractJson(raw, '[', ']');
  if (jsonArrStr) {
    try { const arr = JSON.parse(jsonArrStr); if (Array.isArray(arr)) return arr; } catch (e) { }
  }

  const lines = raw.split('\n').map(line => line.replace(/^\d+[\.\)]\s*/, '').trim()).filter(line => line.length > 5 && line.includes('?'));
  if (lines.length > 0) return lines.slice(0, 3);
  throw new Error("Kunde inte tolka frågorna.");
};

// ==========================================
// CHATT-FUNKTIONER FÖR NANO
// ==========================================
export const transcribeBlobAI = async (blob: Blob, onProgress?: (p: number, msg: string) => void): Promise<string> => {
  const mode = localStorage.getItem('TRANSCRIPTION_MODE') || 'api';
  if (mode === 'lmstudio') return await runLMStudioWhisper(blob, onProgress);
  if (mode === 'api') {
    onProgress?.(20, "Förbereder ljud för molnet...");
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas för transkribering.");
    const base64Audio = await blobToBase64(blob);
    onProgress?.(50, "Skickar till Gemini API...");
    const result = await ai.models.generateContent({
      model: getModelName(),
                                                   contents: [{ parts: [{ text: "Transkribera talet exakt." }, { inlineData: { mimeType: blob.type, data: base64Audio } }] }]
    });
    return result.text || "";
  }
  return "Kunde inte transkribera. Stöds inte i detta läge.";
};

export const sendChatMessageAI = async (messages: { role: 'user' | 'assistant', content: string }[], onProgress?: any) => {
  const mode = localStorage.getItem('SUMMARY_MODE') || 'api';
  const temp = Number(localStorage.getItem('CHAT_TEMP') || 0.7);
  const maxTokens = Number(localStorage.getItem('CHAT_MAX_TOKENS') || 1500);
  const systemInstruction = localStorage.getItem('CHAT_SYSTEM_PROMPT') || "Du är en hjälpsam AI-assistent.";

  const timeoutSeconds = Number(localStorage.getItem('AI_TIMEOUT_SECONDS') || 60);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  if (mode === 'lmstudio') {
    const baseUrl = localStorage.getItem('LLM_SERVER_URL') || 'http://100.64.204.100:1234/v1';
    const formattedMessages = [{ role: 'system', content: systemInstruction }, ...messages];
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ messages: formattedMessages, temperature: temp, max_tokens: maxTokens })
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Serverfel (${response.status}): ${await response.text()}`);
      const data = await response.json();
      if (data.error) throw new Error(`LM Studio vägrade: ${data.error.message || JSON.stringify(data.error)}`);
      if (!data.choices || data.choices.length === 0) throw new Error("Ogiltigt svar från LM Studio.");
      return data.choices[0].message.content || "";
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error(`Timeout (${timeoutSeconds}s)`);
      throw err;
    }
  } else {
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas.");
    const chatPrompt = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\nAssistant:';
    try {
      const result = await ai.models.generateContent({
        model: getModelName(), config: { temperature: temp, maxOutputTokens: maxTokens },
                                                     contents: [{ parts: [{ text: `${systemInstruction}\n\n${chatPrompt}` }] }]
      });
      clearTimeout(timeoutId);
      if (!result || !result.candidates || result.candidates.length === 0) throw new Error("Inget svar från AI (möjligen blockerat av säkerhetsfilter).");
      return result.text || "";
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error(`Timeout (${timeoutSeconds}s)`);
      throw new Error(`Gemini fel: ${err.message}`);
    }
  }
};
