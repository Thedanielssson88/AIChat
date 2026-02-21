import { GoogleGenAI, Type } from "@google/genai";
import { db, getEntry, getEntryAudio, getDay, getEntriesForDay, updateEntry, updateDay } from "./db";

export const DEFAULT_DIARY_PROMPT = `Du är en expert på att skriva personliga dagboksinlägg. 
Din uppgift är att skriva ett sammanhängande och reflekterande dagboksinlägg baserat på mina röstanteckningar. 
Skriv i JAG-form (t.ex. "Idag kände jag mig...", "Vi åkte till..."), precis som om jag själv hade satt mig ner och skrivit i min egen dagbok. 
Fånga mina känslor, vad jag har gjort och vilka jag har träffat. Avsluta gärna med en tanke inför morgondagen. 
Extrahera även namnen på de personer jag nämner, samt skapa passande taggar för platserna eller ämnena jag pratar om.`;

export const DEFAULT_QUESTIONS_PROMPT = `Du är min personliga AI-coach och dagbok. Din uppgift är att ställa 2-3 öppna, reflekterande och nyfikna frågor till mig i "du"-form. 
Fråga till exempel hur jag kände kring en specifik händelse, be mig utveckla något jag nämnde kort, eller fråga vad jag har lärt mig idag. 
Syftet är att få mig att fördjupa mina tankar och göra dagboken mer personlig och värdefull.`;

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

// Funktion för att använda lokal AI (Gemini Nano / Window AI)
const runLocalPrompt = async (prompt: string): Promise<string> => {
  // @ts-ignore - Window AI är under utveckling
  if (!window.ai || !window.ai.assistant) {
    throw new Error("Lokal AI (Gemini Nano) är inte tillgänglig på denna enhet eller webbläsare.");
  }

  try {
    // @ts-ignore
    const assistant = await window.ai.assistant.create();
    const result = await assistant.prompt(prompt);
    return result;
  } catch (error) {
    console.error("Lokal AI Error:", error);
    throw new Error("Kunde inte köra lokal AI. Kontrollera enhetsinställningar.");
  }
};

// ------------------------------------------------------------------
// 1. TRANSKRIBERA EN RÖSTANTECKNING
// ------------------------------------------------------------------
const transcribeSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING, description: "Den exakta transkriberingen av vad som sades." }
  }
};

export const transcribeEntryAI = async (entryId: string, onProgress?: (p: number, msg: string) => void) => {
  const mode = localStorage.getItem('TRANSCRIPTION_MODE') || 'api';

  if (mode === 'local') {
    throw new Error("Lokal transkribering stöds inte ännu via window.ai. Vänligen använd API-läge.");
  }

  const ai = getAIClient();
  if (!ai) throw new Error("API-nyckel saknas. Gå till inställningar.");

  const entry = await getEntry(entryId);
  const audio = await getEntryAudio(entryId);

  if (!entry || !audio) throw new Error("Inlägg eller ljudfil saknas.");

  onProgress?.(10, 'Förbereder ljudfil...');
  const base64Audio = await blobToBase64(audio.blob);

  const prompt = `Du är en expert på att transkribera svenskt tal. Lyssna på denna röstanteckning och skriv ner exakt vad som sägs. Din output ska endast vara den transkriberade texten. Lägg inte till kommentarer.`;

  onProgress?.(40, 'Transkriberar inlägg...');
  const result = await ai.models.generateContent({
    model: getModelName(),
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: audio.mimeType, data: base64Audio } }] }],
    config: { responseMimeType: "application/json", responseSchema: transcribeSchema }
  });

  onProgress?.(90, 'Sparar text...');
  const responseData = JSON.parse(result.text || "{}");

  await updateEntry(entryId, {
    transcription: responseData.text || "",
    isTranscribed: true
  });

  return responseData;
};

// ------------------------------------------------------------------
// 2. SAMMANFATTA HELA DAGEN (Med Taggning)
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

  let qaText = "";
  if (day.qa && day.qa.length > 0) {
    qaText = `\n\nJAG HAR ÄVEN SVARAT PÅ DESSA REFLEKTERANDE FRÅGOR OM DAGEN:\n` + 
             day.qa.map(q => `- Fråga: ${q.question}\n  Mitt svar: ${q.answer}`).join('\n\n');
  }

  const prompt = `${customPrompt}
  
  Här är mina röstanteckningar från idag (${day.date}):
  
  ${transcriptions}
  ${qaText}`;

  let responseData;

  if (mode === 'local') {
    onProgress?.(50, 'Kör sammanfattning lokalt på Pixel...');
    const localResult = await runLocalPrompt(prompt + "\nSvara ENDAST med ett giltigt JSON-objekt enligt formatet.");
    responseData = JSON.parse(localResult);
  } else {
    const ai = getAIClient();
    if (!ai) throw new Error("API-nyckel saknas. Gå till inställningar.");

    onProgress?.(50, 'Skriver dagbokssammanfattning...');
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
  
  ${transcriptions}`;

  let responseData;

  if (mode === 'local') {
    const localResult = await runLocalPrompt(prompt + "\nSvara ENDAST med ett giltigt JSON-objekt med egenskapen 'questions' som är en array av strängar.");
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
