import { GoogleGenAI, Type } from "@google/genai";
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
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

// Hjälpfunktion för lokal AI (Gemini Nano)
const runLocalPrompt = async (prompt: string): Promise<string> => {
  // @ts-ignore - window.ai är experimentellt för Gemini Nano
  if (!window.ai || !window.ai.assistant) {
    throw new Error("Lokal AI (Gemini Nano) är inte tillgänglig. Se till att AICore är aktiverat på din Pixel 9 Pro.");
  }
  try {
    // @ts-ignore
    const assistant = await window.ai.assistant.create();
    return await assistant.prompt(prompt);
  } catch (error: any) {
    throw new Error("Lokal AI-fel: " + error.message);
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
  const audio = await getEntryAudio(entryId);

  if (!entry || !audio) throw new Error("Inlägg eller ljudfil saknas.");

  let transcriptionText = "";

  if (mode === 'local') {
    onProgress?.(10, 'Använder lokal röstmotor...');
    const available = await SpeechRecognition.available();
    if (!available.available) throw new Error("Lokal röstigenkänning är inte tillgänglig.");

    // Notera: Standard Android-motor transkriberar främst live-tal. 
    // För att transkribera sparade filer lokalt används ofta molnet som backup 
    // om inte en specifik on-device-modul som Whisper WASM används.
    throw new Error("Lokal fil-transkribering stöds inte direkt via pluginet än. Använd API.");
  } else {
    // Molnbaserad transkribering via Gemini API
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas.");

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
    transcriptionText = responseData.text || "";
  }

  await updateEntry(entryId, { transcription: transcriptionText, isTranscribed: true });
  return { text: transcriptionText };
};

// ------------------------------------------------------------------
// 2. SAMMANFATTA (Väljer mellan API och Lokal motor)
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
  const prompt = `${customPrompt}\n\nInlägg:\n${transcriptions}\n${qaText}\n\nSvara ENDAST med ett giltigt JSON-objekt enligt formatet.`;

  let responseData;

  if (mode === 'local') {
    onProgress?.(50, 'Sammanfattar lokalt (Gemini Nano)...');
    const localResult = await runLocalPrompt(prompt);
    responseData = JSON.parse(localResult);
  } else {
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas.");

    onProgress?.(50, 'Skriver dagbokssammanfattning via API...');
    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: [{ parts: [{ text: prompt }] }],
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
// 3. GENERERA FÖRDJUPANDE FRÅGOR
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

export const generateQuestionsAI = async (dayId: string) => {
  const mode = localStorage.getItem('SUMMARY_MODE') || 'api';

  const day = await getDay(dayId);
  const entries = await getEntriesForDay(dayId);

  if (!day || entries.length === 0) throw new Error("Ingen data för denna dag.");

  const transcriptions = entries
    .filter(e => e.isTranscribed && e.transcription)
    .map(e => e.transcription)
    .join('\n\n');

  const customQuestionPrompt = localStorage.getItem('GEMINI_QUESTIONS_PROMPT') || DEFAULT_QUESTIONS_PROMPT;

  const prompt = `${customQuestionPrompt}
  
  Läs mina korta dagboksanteckningar från idag:
  
  ${transcriptions}\n\nSvara ENDAST med ett giltigt JSON-objekt med egenskapen 'questions' som är en array av strängar.`;

  let responseData;

  if (mode === 'local') {
    const localResult = await runLocalPrompt(prompt);
    responseData = JSON.parse(localResult);
  } else {
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas. Gå till inställningar.");

    const result = await ai.models.generateContent({
      model: getModelName(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", responseSchema: questionsSchema }
    });
    responseData = JSON.parse(result.text || "{}");
  }

  return responseData.questions || [];
};
