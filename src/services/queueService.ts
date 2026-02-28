import { db } from './db';
import { transcribeEntryAI, summarizeDayAI, processMeetingAI } from './geminiService';

let isProcessingQueue = false;

// Används gemensamt av Dagboksinlägg och Möten
export const addToQueue = async (id: string, type: 'audio' | 'text' = 'audio') => {
  await db.processingJobs.add({
    id: crypto.randomUUID(),
                              meetingId: id, // Används för BÅDE möten och dagboksinlägg
                              status: 'pending',
                              progress: 0,
                              message: 'I kö...',
                              type,
                              createdAt: new Date().toISOString()
  });

  processQueue();
};

export const processQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const pendingJobs = await db.processingJobs.where('status').equals('pending').toArray();
    if (pendingJobs.length === 0) {
      isProcessingQueue = false;
      return;
    }

    // Ta det äldsta jobbet först
    const job = pendingJobs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    const id = job.meetingId;

    await db.processingJobs.update(job.id, { status: 'processing', message: 'Startar process...', progress: 5 });

    try {
      // HYBRID-LOGIK: Är det ett CRM-möte eller ett Dagboksinlägg?
      const isMeeting = await db.meetings.get(id);
      const isEntry = await db.entries.get(id);

      if (isMeeting) {
        // --- KÖR CRM-MÖTE ---
        await processMeetingAI(id, async (progress, msg) => {
          await db.processingJobs.update(job.id, { progress, message: msg });
        });
      } else if (isEntry) {
        // --- KÖR DAGBOKSINLÄGG ---
        await transcribeEntryAI(id, async (progress, msg) => {
          await db.processingJobs.update(job.id, { progress, message: msg });
        });

        await db.processingJobs.update(job.id, { progress: 90, message: 'Sammanfattar dagen...' });
        await summarizeDayAI(isEntry.dayId);
      } else {
        throw new Error("Kunde inte hitta varken möte eller dagboksinlägg i databasen.");
      }

      // Klar! Ta bort jobbet ur kön.
      await db.processingJobs.delete(job.id);

    } catch (error: any) {
      console.error("Fel vid bearbetning av kö:", error);
      await db.processingJobs.update(job.id, { status: 'error', message: error.message || 'Ett fel uppstod' });

      // Återställ eventuell isProcessed-flagga
      if (await db.meetings.get(id)) {
        await db.meetings.update(id, { isProcessed: false });
      }
    }
  } catch (error) {
    console.error("Generellt kö-fel:", error);
  } finally {
    isProcessingQueue = false;
    setTimeout(processQueue, 1000);
  }
};
