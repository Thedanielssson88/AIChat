import Dexie, { type Table } from 'dexie';
import { Meeting, Person, Task, AudioFile, Project, CategoryData, ProjectMember, Tag, ProcessingJob, MemberGroup, Day, Entry, EntryAudio, Chat, ChatMessage } from '../types';

export class MeetingDB extends Dexie {
  meetings!: Table<Meeting, string>;
  people!: Table<Person, string>;
  tasks!: Table<Task, string>;
  audioFiles!: Table<AudioFile, string>;
  projects!: Table<Project, string>;
  categories!: Table<CategoryData, string>;
  projectMembers!: Table<ProjectMember, string>;
  tags!: Table<Tag, string>;
  processingJobs!: Table<ProcessingJob, string>;
  days!: Table<Day, string>;
  entries!: Table<Entry, string>;
  entryAudio!: Table<EntryAudio, string>;
  chats!: Table<Chat, string>;
  chatMessages!: Table<ChatMessage, string>;

  constructor() {
    super('RecallCRM');

    this.version(4).stores({
      meetings: 'id, date, projectId, categoryId, *participantIds',
      people: 'id, name, *projectIds',
      tasks: 'id, status, assignedToId, linkedMeetingId',
      audioFiles: 'id',
      projects: 'id, name',
      categories: 'id, projectId',
      projectMembers: 'id, projectId, personId, group'
    });

    this.version(5).stores({
      tasks: 'id, status, assignedToId, linkedMeetingId, createdAt'
    });

    this.version(6).stores({
      tags: 'id, projectId',
      meetings: 'id, date, projectId, categoryId, *participantIds, *tagIds'
    });

    this.version(7).stores({
      processingJobs: 'id, meetingId, status, createdAt'
    });

    this.version(8).stores({
      days: 'id, date',
      entries: 'id, dayId, createdAt',
      entryAudio: 'id'
    });

    this.version(9).stores({
      chats: 'id, updatedAt',
      chatMessages: 'id, chatId, timestamp'
    });
  }
}

export const db = new MeetingDB();

export const seedDatabase = async () => {};

// --- CRUD-funktioner för Projekt & CRM ---
export async function addProject(project: Omit<Project, 'id'>): Promise<string> {
  const newProject = { ...project, id: crypto.randomUUID() };
  await db.projects.add(newProject);
  return newProject.id;
}
export async function getAllProjects(): Promise<Project[]> { return await db.projects.toArray(); }
export async function getProject(id: string): Promise<Project | undefined> { return await db.projects.get(id); }
export async function updateProject(id: string, changes: Partial<Project>): Promise<number> { return await db.projects.update(id, changes); }
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.projectMembers, db.categories, db.meetings, async () => {
    await db.projectMembers.where({ projectId: id }).delete();
    await db.categories.where({ projectId: id }).delete();
    await db.meetings.where({ projectId: id }).modify({ projectId: undefined, categoryId: undefined });
    await db.projects.delete(id);
  });
}

export async function addCategory(category: Omit<CategoryData, 'id'>): Promise<string> {
  const newCategory = { ...category, id: crypto.randomUUID() };
  await db.categories.add(newCategory);
  return newCategory.id;
}
export async function getCategoriesForProject(projectId: string): Promise<CategoryData[]> { return await db.categories.where({ projectId }).toArray(); }
export async function updateCategory(id: string, changes: Partial<CategoryData>): Promise<number> { return await db.categories.update(id, changes); }
export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, db.meetings, async () => {
    await db.meetings.where({ categoryId: id }).modify({ categoryId: undefined });
    await db.categories.delete(id);
  });
}

export async function addProjectMember(projectId: string, personId: string, group: MemberGroup, customRole?: string): Promise<string> {
  const newMember: ProjectMember = { id: crypto.randomUUID(), projectId, personId, group, customRole };
  await db.projectMembers.add(newMember);
  return newMember.id;
}
export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> { return await db.projectMembers.where({ projectId }).toArray(); }
export async function getProjectsForPerson(personId: string): Promise<ProjectMember[]> { return await db.projectMembers.where({ personId }).toArray(); }
export async function updateProjectMember(id: string, changes: Partial<ProjectMember>): Promise<number> { return await db.projectMembers.update(id, changes); }
export async function removeProjectMember(id: string): Promise<void> { await db.projectMembers.delete(id); }

export async function deleteMeeting(meetingId: string): Promise<void> {
  await db.transaction('rw', db.meetings, db.audioFiles, db.tasks, async () => {
    await db.meetings.delete(meetingId);
    await db.audioFiles.delete(meetingId);
    await db.tasks.where('linkedMeetingId').equals(meetingId).delete();
  });
}

// --- CRUD för AI-dagbok ---
export async function addDay(day: Omit<Day, 'id'>): Promise<string> {
  const newDay: Day = { ...day, id: crypto.randomUUID() };
  await db.days.add(newDay);
  return newDay.id;
}
export async function getDayByDate(date: string): Promise<Day | undefined> { return await db.days.where('date').equals(date).first(); }
export async function getOrCreateDayForDate(date: string): Promise<Day> {
  const existing = await getDayByDate(date);
  if (existing) return existing;
  const id = await addDay({ date });
  const created = await db.days.get(id);
  if (!created) throw new Error('Failed to create day');
  return created;
}
export async function getAllDays(): Promise<Day[]> { return await db.days.orderBy('date').reverse().toArray(); }
export async function getDay(id: string): Promise<Day | undefined> { return await db.days.get(id); }
export async function updateDay(id: string, changes: Partial<Day>): Promise<number> { return await db.days.update(id, changes); }
export async function deleteDay(dayId: string): Promise<void> {
  await db.transaction('rw', db.days, db.entries, db.entryAudio, async () => {
    const entryIds = await db.entries.where('dayId').equals(dayId).primaryKeys();
    for (const eid of entryIds) await db.entryAudio.delete(eid);
    await db.entries.where('dayId').equals(dayId).delete();
    await db.days.delete(dayId);
  });
}

export async function addEntry(entry: Omit<Entry, 'id'>): Promise<string> {
  const newEntry: Entry = { ...entry, id: crypto.randomUUID() };
  await db.entries.add(newEntry);
  return newEntry.id;
}
export async function getEntriesForDay(dayId: string): Promise<Entry[]> { return await db.entries.where('dayId').equals(dayId).sortBy('createdAt'); }
export async function getEntry(id: string): Promise<Entry | undefined> { return await db.entries.get(id); }
export async function updateEntry(id: string, changes: Partial<Entry>): Promise<number> { return await db.entries.update(id, changes); }
export async function setEntryAudio(entryId: string, blob: Blob, mimeType: string): Promise<void> { await db.entryAudio.put({ id: entryId, blob, mimeType }); }
export async function getEntryAudio(entryId: string): Promise<EntryAudio | undefined> { return await db.entryAudio.get(entryId); }
export async function deleteEntry(entryId: string): Promise<void> {
  await db.transaction('rw', db.entries, db.entryAudio, async () => {
    await db.entryAudio.delete(entryId);
    await db.entries.delete(entryId);
  });
}

// --- CRUD för AI-chatt ---
export async function createChat(title: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.chats.add({ id, title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return id;
}
export async function getChats(): Promise<Chat[]> { return await db.chats.orderBy('updatedAt').reverse().toArray(); }
export async function deleteChat(id: string): Promise<void> {
  await db.transaction('rw', db.chats, db.chatMessages, async () => {
    await db.chatMessages.where('chatId').equals(id).delete();
    await db.chats.delete(id);
  });
}
export async function addChatMessage(chatId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await db.chatMessages.add({ id: crypto.randomUUID(), chatId, role, content, timestamp: new Date().toISOString() });
  await db.chats.update(chatId, { updatedAt: new Date().toISOString() });
}
export async function getChatMessages(chatId: string): Promise<ChatMessage[]> { return await db.chatMessages.where('chatId').equals(chatId).sortBy('timestamp'); }
