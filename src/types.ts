export enum MemberGroup {
  STEERING = 'Styrgrupp',
  CORE_TEAM = 'Projektgrupp',
  REFERENCE = 'Referensgrupp',
  STAKEHOLDER = 'Intressent',
  OTHER = 'Övrig'
}

export interface Person {
  id: string;
  name: string;
  role: string;
  region?: string;
  department?: string;
  email?: string;
  avatarColor?: string;
  projectIds: string[];
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'done';
  assignedToId?: string;
  linkedMeetingId?: string;
  createdAt: string;
  projectId?: string;
  originTimestamp?: number;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  projectId?: string;
  categoryId?: string;
  subCategoryName?: string;
  participantIds: string[];
  absentParticipantIds?: string[];
  tagIds?: string[];
  isProcessed: boolean;
  transcription?: { start: number; end: number; text: string; speaker?: string }[];
  protocol?: {
    summary: string;
    detailedProtocol?: string;
    decisions?: string[];
  };
  quickNotes?: { timestamp: number; text: string }[];
}

export interface Tag {
  id: string;
  name: string;
  projectId: string;
}

export interface AudioFile {
  id: string;
  blob: Blob;
  mimeType: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface CategoryData {
  id: string;
  name: string;
  projectId: string;
  subCategories: string[];
}

export interface ProjectMember {
  id: string;
  projectId: string;
  personId: string;
  group: MemberGroup;
  customRole?: string;
}

// --- NYA TYPER FÖR KÖ-SYSTEMET ---
export type JobStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface ProcessingJob {
  id: string;
  meetingId: string;
  type: 'audio' | 'text';
  status: JobStatus;
  progress: number;
  message?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// --- AI-DAGBOK: Dag och Inlägg ---

/** En dag i dagboken. Ett datum med sammanfattning, humör och inlägg. */
export interface Day {
  id: string;
  /** Datum i format YYYY-MM-DD */
  date: string;
  /** AI-genererad sammanfattning av hela dagen */
  summary?: string;
  /** Användarens/dagens humör (t.ex. "😊 Bra", "😐 Neutral", "😤 Stressig") */
  mood?: string;
  /** Korta lärdomar eller reflektioner från dagen */
  learnings?: string[];
  /** När dagens sammanfattning senast genererades (ISO-sträng) */
  summarizedAt?: string;
  /** Personer som AI:n hittat i dagens inlägg */
  personIds?: string[];
  /** Taggar/ämnen som AI:n hittat (platser, aktiviteter) */
  tagIds?: string[];
  qa?: { question: string; answer: string }[];
  questions?: string[];
}

/** Ett röstinlägg (en inspelning) som tillhör en specifik dag. */
export interface Entry {
  id: string;
  /** Vilken dag inlägget tillhör */
  dayId: string;
  /** När inlägget spelades in (ISO-sträng, används som klockslag i UI) */
  createdAt: string;
  /** Transkriberad text från ljudet */
  transcription?: string;
  /** Om transkriberingen är klar (AI har processat ljudet) */
  isTranscribed: boolean;
}

/** Ljudfil kopplad till ett dagboksinlägg (samma mönster som AudioFile för möten). */
export interface EntryAudio {
  id: string;
  blob: Blob;
  mimeType: string;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
