import { GoogleGenAI, Type } from "@google/genai";
import { initLlama } from 'llama-cpp-capacitor';
import { registerPlugin } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

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

// Hjälpmetod för att extrahera JSON
const extractJson = (text: string, startChar: '{' | '[', endChar: '}' | ']') => {
  const first = text.indexOf(startChar);
  const last = text.lastIndexOf(endChar);
  if (first === -1 || last === -1 || last < first) return null;
  return text.substring(first, last + 1);
};

const getConfig = (type: 'transcribe' | 'summary' | 'questions') => {
  const tempMap = {
    transcribe: Number(localStorage.getItem('TEMP_TRANSCRIBE') || 0.0),
    summary: Number(localStorage.getItem('TEMP_SUMMARY') || 0.3),
    questions: Number(localStorage.getItem('TEMP_QUESTIONS') || 0.0),
  };
  const tokenMap = {
    transcribe: 2000, 
    summary: Number(localStorage.getItem('MAX_TOKENS_SUMMARY') || 1500),
    questions: Number(localStorage.getItem('MAX_TOKENS_QUESTIONS') || 500),
  };
  return { temp: tempMap[type], maxTokens: tokenMap[type] };
};

// ------------------------------------------------------------------
// AI MOTORER
// ------------------------------------------------------------------
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        temperature: temp,
        max_tokens: max
      })
    });

    if (!response.ok) {
       throw new Error(`Server svarade med status: ${response.status}`);
    }

    const data = await response.json();
    
    // Säkerställ att data.choices och data.choices[0] existerar innan vi läser dem!
    if (data && data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content || "";
    } else {
        console.error("Ogiltigt server-svar:", data);
        throw new Error("Servern skickade ett okänt format.");
    }
  } catch (err: any) {
     throw new Error(`Kunde inte nå AI-servern (${baseUrl}): ${err.message}`);
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// NY FUNKTION: Konverterar ljud till 16kHz Mono WAV för Whisper.cpp
const convertTo16kHzMonoWav = async (audioBlob: Blob): Promise<Blob> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const channelData = audioBuffer.getChannelData(0); // Tvinga mono (1 kanal)
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
    view.setInt16(pos, sample, true);
    pos += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

const getAIClient = () => {
  const apiKey = localStorage.getItem('GEMINI_API_KEY');
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
};
export const hasApiKey = () => !!localStorage.getItem('GEMINI_API_KEY');
const getModelName = () => (localStorage.getItem('GEMINI_MODEL') === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash');

const runLMStudioWhisper = async (audioBlob: Blob, onProgress?: (p: number, msg: string) => void): Promise<string> => {
  onProgress?.(20, "Konverterar ljud...");
  
  // 1. Konvertera till WAV (Krävs för whisper.cpp)
  const wavBlob = await convertTo16kHzMonoWav(audioBlob);

  // 2. Hämta URL exakt som den står i appen
  const rawUrl = localStorage.getItem('WHISPER_SERVER_URL') || '';
  const SERVER_URL = rawUrl.trim();
  const language = localStorage.getItem('TRANSCRIPTION_LANG') || 'sv';

  if (!SERVER_URL) throw new Error("Ingen URL angiven för Whisper i inställningar.");

  // 3. Bygg FormData för whisper.cpp
  const formData = new FormData();
  formData.append("file", wavBlob, "recording.wav");
  
  if (language && language !== "") {
    formData.append("language", language);
    // Skicka med prompt för att styra språket
    const prompt = language === 'sv' ? "Hej, här är en svensk dagbok." : "Hello, this is an English diary.";
    formData.append("prompt", prompt);
  }

  try {
    onProgress?.(50, `Ansluter till ${SERVER_URL}...`);
    
    const response = await fetch(SERVER_URL, {
      method: "POST",
      body: formData // Webbläsaren sköter Content-Type automatiskt
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serverfel ${response.status}: ${errorText}`);
    }

    onProgress?.(90, "Tolkar svar...");
    const data = await response.json();
    
    // whisper.cpp server returnerar oftast text i fältet "text"
    return data.text || "";

  } catch (err: any) {
    // Här skickar vi vidare det RIKTIGA felet så du ser det i dagboken
    throw new Error(`${err.message}`);
  }
};

// ------------------------------------------------------------------
// 1. TRANSKRIBERA (Väljer mellan Whisper, Lokal och API)
// ------------------------------------------------------------------
export const transcribeEntryAI = async (entryId: string, onProgress?: (p: number, msg: string) => void) => {
  const mode = localStorage.getItem('TRANSCRIPTION_MODE') || 'api';
  const entry = await getEntry(entryId);

  if (!entry) throw new Error("Inlägg saknas i databasen.");

  // Om inlägget redan har transkriberats live
  if (entry.isTranscribed && entry.transcription) {
    onProgress?.(100, 'Klar (Lokal)');
    return { text: entry.transcription };
  }

  onProgress?.(5, "Hämtar ljudfil...");
  const audio = await getEntryAudio(entryId);
  if (!audio) throw new Error("Kunde inte hitta ljudfilen.");

  // --- HÄR ÄR LOGIKEN FÖR WHISPER ---
  if (mode === 'lmstudio') {
    try {
      const transcriptionText = await runLMStudioWhisper(audio.blob, onProgress);
      await updateEntry(entryId, { transcription: transcriptionText, isTranscribed: true });
      return { text: transcriptionText };
    } catch (error: any) {
      // Sparar felmeddelandet som text i inlägget
      const errorMsg = `[WHISPER FEL: ${error.message}]`;
      await updateEntry(entryId, { transcription: errorMsg, isTranscribed: true });
      return { text: errorMsg };
    }
  }

  // --- OM DEN STÅR PÅ NATIVE C++ ---
  if (mode === 'local') {
    await updateEntry(entryId, { transcription: "Inget tal registrerades av den lokala röstmotorn.", isTranscribed: true });
    return { text: "" };
  }

  // --- FALLBACK: Molnbaserad transkribering via Gemini API ---
  onProgress?.(20, "Förbereder fil för molnet...");
  const ai = getAIClient();
  if (!ai) throw new Error("API-nyckel saknas för transkribering.");

  const base64Audio = await blobToBase64(audio.blob);
  onProgress?.(50, "Skickar till Gemini API...");

  const result = await ai.models.generateContent({
    model: getModelName(),
    contents: [{ parts: [{ text: "Transkribera talet exakt." }, { inlineData: { mimeType: audio.mimeType, data: base64Audio } }] }]
  });
  
  onProgress?.(90, "Sparar resultat...");
  const text = result.text || "";
  await updateEntry(entryId, { transcription: text, isTranscribed: true });
  return { text };
};

// ------------------------------------------------------------------
// 2. SAMMANFATTA DAGEN
// ------------------------------------------------------------------
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

  // Försök hitta JSON inuti svaret
  const jsonStr = extractJson(raw, '{', '}');
  if (!jsonStr) throw new Error("JSON saknas i svaret från servern.");
  
  const responseData = JSON.parse(jsonStr);

  await updateDay(dayId, {
    summary: responseData.summary || responseData.summering || "",
    mood: responseData.mood || responseData.humör || "",
    learnings: responseData.learnings || responseData.inlärningar || [],
    summarizedAt: new Date().toISOString()
  });
  return responseData;
};

// ------------------------------------------------------------------
// 3. GENERERA FRÅGOR & SVAR 
// ------------------------------------------------------------------
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

  // 1. Försök hitta JSON-array [...]
  const jsonArrStr = extractJson(raw, '[', ']');
  if (jsonArrStr) {
    try {
      const arr = JSON.parse(jsonArrStr);
      if (Array.isArray(arr)) return arr;
    } catch (e) { /* Gå vidare till fallback */ }
  }

  // 2. FALLBACK: Om AI:n skickade en numrerad lista (1. Fråga, 2. Fråga)
  const lines = raw.split('\n')
    .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(line => line.length > 5 && line.includes('?')); 

  if (lines.length > 0) {
    return lines.slice(0, 3);
  }

  throw new Error("Kunde inte tolka frågorna. AI:n skickade varken JSON eller en tydlig lista.");
};

export const processMeetingAI = async (_meetingId: string, _onProgress?: any) => {
  throw new Error("Mötes-AI är ersatt av dagboks-AI.");
};

export const reprocessMeetingFromText = async (_meetingId: string, _onProgress?: any) => {
  throw new Error("Mötes-AI är ersatt av dagboks-AI.");
};
