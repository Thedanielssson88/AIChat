import { GoogleGenAI, Type } from "@google/genai";
import { initLlama } from 'llama-cpp-capacitor';
import { registerPlugin } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

// Definiera din nya Nano-bro
interface GeminiNanoPlugin {
  generateText(options: { systemPrompt: string, prompt: string }): Promise<{ text: string }>;
  getRealPath(options: { uri: string }): Promise<{ path: string }>; // Ny metod!
}
const GeminiNano = registerPlugin<GeminiNanoPlugin>('GeminiNano');
import { db, getEntry, getEntryAudio, getDay, getEntriesForDay, updateEntry, updateDay } from "./db";

// Standard-prompts för dagbok och frågor
export const DEFAULT_DIARY_PROMPT = `Du är en expert på att skriva personliga dagboksinlägg. 
Din uppgift är att skriva ett sammanhängande och reflekterande dagboksinlägg baserat på mina röstanteckningar. 
Skriv i JAG-form (t.ex. "Idag kände jag mig...", "Vi åkte till..."), precis som om jag själv hade satt mig ner och skrivit i min egen dagbok. 
Fånga mina känslor, vad jag har gjort och vilka jag har träffat. Avsluta gärna med en tanke inför morgondagen. 
Extrahera även namnen på de personer jag nämner, samt skapa passande taggar för platserna eller ämnena jag pratar om.`;

export const DEFAULT_QUESTIONS_PROMPT = `Du är min personliga AI-coach och dagbok. Din uppgift är att ställa 2-3 öppna, reflekterande och nyfikna frågor till mig i "du"-form. 
Fråga till exempel hur jag kände kring en specifik händelse, be mig utveckla något jag nämnde kort, eller fråga vad jag har lärt mig idag. 
Syftet är att få mig att fördjupa mina tankar och göra dagboken mer personlig och värdefull.`;

// ------------------------------------------------------------------
// LOKAL AI-MOTOR (Native via llama-cpp-capacitor)
// ------------------------------------------------------------------
let llamaContext: any = null;
let isModelLoaded = false;

export const initLocalEngine = async (onProgress?: (percent: number, text: string) => void) => {
  // Om motorn redan är igång, ladda inte om den
  if (isModelLoaded && llamaContext) return;
  
  const savedUri = localStorage.getItem('LOCAL_MODEL_PATH');
  if (!savedUri) {
    console.warn("Lokal AI: Ingen modell-sökväg angiven.");
    return;
  }

  try {
    onProgress?.(10, "Översätter filsökväg...");
    
    // ANVÄND DIN NYA JAVA-BRO FÖR ATT FIXA SÖKVÄGEN
    const { path: realPath } = await GeminiNano.getRealPath({ uri: savedUri });
    console.log("Översatt sökväg:", realPath);

    onProgress?.(20, "Laddar in modell...");
    
    // Initiera C++ motorn direkt med den RIKTIGA sökvägen
    llamaContext = await initLlama({
      model: realPath,
      n_ctx: 2048,          // Hur mycket kontext (text) den kan minnas samtidigt
      n_threads: 4,         // Använder 4 processorkärnor
      n_gpu_layers: 99      // Siffra > 0 tvingar Android att använda GPU/Vulkan för maximal hastighet
    });

    isModelLoaded = true;
    onProgress?.(100, "Modell redo!");
    console.log("Llama-3 laddades framgångsrikt via Native C++!");

  } catch (err: any) {
    console.error("Lokal AI: Kunde inte ladda modellen via Llama.cpp.", err);
    throw new Error("Kunde inte starta AI-motorn. Kontrollera att filen är en giltig GGUF.");
  }
};

const runLocalLlama = async (
  systemInstruction: string, 
  prompt: string, 
  onProgress?: (p: number, msg: string) => void
): Promise<string> => {
  
  // Säkerställ att filen är inläst i processorn innan vi ställer en fråga
  if (!isModelLoaded || !llamaContext) {
    onProgress?.(0, "Initierar Native AI-motor...");
    await initLocalEngine((percent, text) => onProgress?.(percent, text));
  }

  onProgress?.(90, "AI tänker... (Genererar text på enheten)");

  try {
    // Formatera prompten exakt så som Llama-3-modeller förväntar sig (ChatML-format)
    const formattedPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemInstruction}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;

    // Kör igång tänkandet i C++ pluginet
    const result = await llamaContext.completion({
      prompt: formattedPrompt,
      n_predict: 1000, // Max antal ord den får generera
      temperature: 0.3,
    });

    let textResult = result.text || "";
    
    // Rensa bort markdown
    return textResult.replace(/```json/g, '').replace(/```/g, '').trim();

  } catch (err: any) {
    console.error("Fel vid generering:", err);
    throw new Error("AI:n kraschade under textgenereringen.");
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

const getAIClient = () => {
  const apiKey = localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const hasApiKey = () => !!localStorage.getItem('GEMINI_API_KEY');

const getModelName = () => {
  const model = localStorage.getItem('GEMINI_MODEL') || 'flash';
  return model === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
};

// ------------------------------------------------------------------
// 1. TRANSKRIBERA (Väljer mellan API och Lokal motor)
// ------------------------------------------------------------------
const transcribeSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "Den exakta transkriberingen av vad som sades." }
  }
};

export const transcribeEntryAI = async (entryId: string, onProgress?: (p: number, msg: string) => void) => {
  const mode = localStorage.getItem('TRANSCRIPTION_MODE') || 'api';
  const entry = await getEntry(entryId);

  if (!entry) throw new Error("Inlägg saknas.");

  // NYTT: Om inlägget redan har transkriberats live (Lokalt mode), hoppa över API-steget!
  if (entry.isTranscribed && entry.transcription) {
    onProgress?.(100, 'Klar (Lokal)');
    return { text: entry.transcription };
  }

  // Om den var inställd på lokal, men ingen text kom in (t.ex. knäpptyst eller fel på micken)
  if (mode === 'local') {
    await updateEntry(entryId, { transcription: "Inget tal registrerades av den lokala röstmotorn.", isTranscribed: true });
    return { text: "" };
  }

  // Molnbaserad transkribering via Gemini API
  const ai = getAIClient();
  const audio = await getEntryAudio(entryId);
  if (!ai) throw new Error("API-nyckel saknas.");
  if (!audio) throw new Error("Ljud saknas.");

  onProgress?.(20, 'Förbereder ljudfil...');
  const base64Audio = await blobToBase64(audio.blob);
  const prompt = `Du är en expert på att transkribera svenskt tal. Lyssna på denna röstanteckning och skriv ner exakt vad som sägs. Din output ska endast vara den transkriberade texten. Lägg inte till kommentarer.`;

  onProgress?.(40, 'Transkriberar via API...');
  const result = await ai.models.generateContent({
    model: getModelName(),
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: audio.mimeType, data: base64Audio } }] }],
    config: { responseMimeType: "application/json", responseSchema: transcribeSchema }
  });
  const responseData = JSON.parse(result.text || "{}");
  const transcriptionText = responseData.text || "";

  await updateEntry(entryId, { transcription: transcriptionText, isTranscribed: true });
  return { text: transcriptionText };
};

// ------------------------------------------------------------------
// 2. SAMMANFATTA DAGEN (Uppdaterad för Llama-3 WebLLM)
// ------------------------------------------------------------------
const summarizeSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "En varm, empatisk och reflekterande dagbokssammanfattning." },
    mood: { type: Type.STRING, description: "En enda emoji som bäst sammanfattar dagens känsla." },
    learnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "1-3 korta lärdomar eller insikter från dagen." },
    peopleMentioned: { type: Type.ARRAY, items: { type: Type.STRING }, description: "En lista med förnamn på personer som nämnts i inläggen (t.ex. 'Alicia', 'Daniel')." },
    tagsMentioned: { type: Type.ARRAY, items: { type: Type.STRING }, description: "En lista med 1-4 korta generella ämnen/platser som nämnts (t.ex. 'Badhuset', 'Lekparken', 'Jobb')." }
  }
};

export const summarizeDayAI = async (dayId: string, onProgress?: (p: number, msg: string) => void) => {
  const mode = localStorage.getItem('SUMMARY_MODE') || 'api';
  const day = await getDay(dayId);
  const entries = await getEntriesForDay(dayId);

  if (!day || entries.length === 0) throw new Error("Ingen data för denna dag.");

  onProgress?.(20, 'Läser dagens inlägg...');

  const transcriptions = entries
    .filter(e => e.isTranscribed && e.transcription)
    .map(e => `[${new Date(e.createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}] ${e.transcription}`)
    .join('\n\n');

  const customPrompt = localStorage.getItem('GEMINI_PROMPT') || DEFAULT_DIARY_PROMPT;
  const qaText = day.qa?.map(q => `- Fråga: ${q.question}\n  Svar: ${q.answer}`).join('\n\n') || "";
  
  const userData = `Inlägg:\n${transcriptions}\n\nFrågor och svar:\n${qaText}`;

  let responseData;

  if (mode === 'nano') {
    onProgress?.(20, 'Anropar Native Gemini Nano...');
    try {
      // Detta anropar koden i din GeminiNanoPlugin.java
      const result = await GeminiNano.generateText({
        systemPrompt: customPrompt,
        prompt: userData
      });
      
      // Din Java-kod skickar just nu tillbaka en mockad JSON
      responseData = JSON.parse(result.text); 
    } catch (err: any) {
      throw new Error("Nano-plugin misslyckades: " + err.message);
    }

  } else if (mode === 'local') {
    const systemPrompt = `${customPrompt}\n\nVIKTIGT: Du MÅSTE svara med ett giltigt JSON-objekt exakt enligt detta schema:
    {
      "summary": "Din sammanfattning här",
      "mood": "En passande emoji",
      "learnings": ["Lärdom 1", "Lärdom 2"],
      "peopleMentioned": ["Namn 1"],
      "tagsMentioned": ["Tagg 1"]
    }`;

    const localResult = await runLocalLlama(systemPrompt, userData, onProgress);
    
    const jsonMatch = localResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Den lokala modellen returnerade inte giltig JSON.");
    
    responseData = JSON.parse(jsonMatch[0]);

  } else {
    onProgress?.(50, 'Sammanfattar via Gemini API...');
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas.");
    const fullPrompt = `${customPrompt}\n\n${userData}\n\nSvara i JSON-format.`;
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: [{ parts: [{ text: fullPrompt }] }],
      config: { responseMimeType: "application/json", responseSchema: summarizeSchema }
    });
    responseData = JSON.parse(result.text || "{}");
  }

  onProgress?.(80, 'Sparar taggar och personer...');

  const allPeople = await db.people.toArray();
  const allTags = await db.tags.toArray();
  const personIdsToSave: string[] = [];
  const tagIdsToSave: string[] = [];

  if (responseData.peopleMentioned) {
    for (const name of responseData.peopleMentioned) {
      let person = allPeople.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!person) {
        person = { id: crypto.randomUUID(), name, role: 'Vän/Familj', projectIds: [] };
        await db.people.add(person);
      }
      personIdsToSave.push(person.id);
    }
  }

  if (responseData.tagsMentioned) {
    for (const tagName of responseData.tagsMentioned) {
      let tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
      if (!tag) {
        tag = { id: crypto.randomUUID(), name: tagName, projectId: 'dagbok' };
        await db.tags.add(tag);
      }
      tagIdsToSave.push(tag.id);
    }
  }

  onProgress?.(90, 'Sparar dagboken...');

  await updateDay(dayId, {
    summary: responseData.summary || "",
    mood: responseData.mood || "",
    learnings: responseData.learnings || [],
    personIds: personIdsToSave,
    tagIds: tagIdsToSave,
    summarizedAt: new Date().toISOString()
  });

  return responseData;
};

// Stubs för gamla mötesvyer
export const processMeetingAI = async (_meetingId: string, _onProgress?: (p: number, msg: string) => void) => {
  throw new Error("Mötes-AI är ersatt av dagboks-AI. Använd dagvy istället.");
};
export const reprocessMeetingFromText = async (_meetingId: string, _onProgress?: (p: number, msg: string) => void) => {
  throw new Error("Mötes-AI är ersatt av dagboks-AI. Använd dagvy istället.");
};

// ------------------------------------------------------------------
// 3. GENERERA FRÅGOR & SVAR (Uppdaterad för Llama-3 WebLLM)
// ------------------------------------------------------------------
const questionsSchema = {
  type: Type.OBJECT,
  properties: {
    questions: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING }, 
      description: "2-3 öppna och reflekterande frågor baserat på dagens inlägg." 
    }
  }
};

export const generateQuestionsAI = async (dayId: string, onProgress?: (p: number, msg: string) => void) => {
  const mode = localStorage.getItem('SUMMARY_MODE') || 'api';
  const day = await getDay(dayId);
  const entries = await getEntriesForDay(dayId);

  if (!day || entries.length === 0) throw new Error("Ingen data för denna dag.");

  const transcriptions = entries
    .filter(e => e.isTranscribed && e.transcription)
    .map(e => e.transcription)
    .join('\n\n');

  const customQuestionsPrompt = localStorage.getItem('GEMINI_QUESTIONS_PROMPT') || DEFAULT_QUESTIONS_PROMPT;

  let questions: string[] = [];

  if (mode === 'local') {
    const systemPrompt = `${customQuestionsPrompt}\n\nVIKTIGT: Du MÅSTE svara med en JSON-lista med 2-3 strängar. Exempel:
    ["Varför kändes det så?", "Vad kunde du ha gjort annorlunda?"]`;

    const localResult = await runLocalLlama(systemPrompt, transcriptions, onProgress);
    
    const jsonMatch = localResult.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Den lokala modellen returnerade inte en giltig JSON-lista.");
    
    questions = JSON.parse(jsonMatch[0]);

  } else {
    onProgress?.(50, 'Genererar frågor via Gemini API...');
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas.");
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: [{ parts: [{ text: `${customQuestionsPrompt}\n\nInlägg:\n${transcriptions}` }] }],
      config: { responseMimeType: "application/json", responseSchema: questionsSchema }
    });
    const responseData = JSON.parse(result.text || "{}");
    questions = responseData.questions || [];
  }

  return questions;
};
