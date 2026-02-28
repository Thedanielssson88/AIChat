import { useState, useRef, useEffect } from 'react';
import { Terminal, Settings, Send, Trash2, ChevronDown, ChevronUp, Download, X, Paperclip, FolderOpen, Plus, Check, MessageSquare, Mic, Square, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { AgentStatus, AgentMessage } from '../types';

import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { startRecording, stopRecording } from '../services/audioRecorder';
import { transcribeBlobAI } from '../services/geminiService';

type LocalAgentMessage = AgentMessage & {
  sessionId?: string;
  imageUrls?: string[];
  inputTokens?: number;
  outputTokens?: number;
};

type ChatSession = {
  id: string;
  title: string;
  timestamp: number;
};

// ── IndexedDB helpers ──
const DB_NAME = 'nanoclaw';
const DB_VERSION = 2;
const STORE_LOGS = 'logs';
const STORE_CHAT = 'chat';
const STORE_SESSIONS = 'sessions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: any) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LOGS)) db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(STORE_CHAT)) db.createObjectStore(STORE_CHAT, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(store: string, value: object): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).add(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear(store: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbPut(store: string, value: object): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const IMAGE_PATH_REGEX = /(?:```[a-z]*\n)?(\/workspace\/[\w./\-\s]+\.(?:jpg|jpeg|png|gif|webp|svg))(?:\n```)?|`(\/workspace\/[\w./\-\s]+\.(?:jpg|jpeg|png|gif|webp|svg))`/gi;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
const INLINE_IMAGE_URL_REGEX = /(?<!\()(https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|svg)(\?\S*)?)/gi;

function extractExternalImageUrls(text: string): { url: string; alt: string }[] {
  const imgs: { url: string; alt: string }[] = [];
  let match;
  MARKDOWN_IMAGE_REGEX.lastIndex = 0;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(text)) !== null) imgs.push({ alt: match[1] || 'bild', url: match[2] });
  INLINE_IMAGE_URL_REGEX.lastIndex = 0;
  while ((match = INLINE_IMAGE_URL_REGEX.exec(text)) !== null) if (!imgs.some(i => i.url === match[0])) imgs.push({ alt: 'bild', url: match[0] });
  const mdLinkImg = /\[([^\]]+)\]\((https?:\/\/[^)]+\.(jpg|jpeg|png|gif|webp|svg)[^)]*)\)/gi;
  mdLinkImg.lastIndex = 0;
  while ((match = mdLinkImg.exec(text)) !== null) if (!imgs.some(i => i.url === match[2])) imgs.push({ alt: match[1], url: match[2] });
  return imgs;
}

const FILE_PATH_REGEX = /(`([^`]+\.[a-zA-Z0-9]+)`|(\/(workspace|home|tmp|var|etc)\/[\w./\-]+\.[a-zA-Z0-9]+))/g;

function extractFilePaths(text: string): string[] {
  const paths: string[] = [];
  let match;
  FILE_PATH_REGEX.lastIndex = 0;
  while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
    const p = match[2] || match[3];
    if (p) paths.push(p);
  }
  return [...new Set(paths)];
}

function toHostPath(p: string): string {
  if (p.startsWith('/home/')) return p;
  return p.replace('/workspace/group/', '/home/deck/NanoClaw/groups/main/')
  .replace('/workspace/extra/', '/home/deck/NanoClaw/groups/main/uploads/');
}

function getMediaType(p: string): 'image' | 'video' | 'audio' | 'file' {
  const ext = p.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'image';
  if (['mp4','webm','mov','avi','mkv'].includes(ext)) return 'video';
  if (['mp3','ogg','wav','m4a','flac','aac'].includes(ext)) return 'audio';
  return 'file';
}

const ALL_PATH_REGEX = /(?:```[a-z]*\n)?((?:\/workspace\/|\/home\/deck\/)[^\s`'"<>\n]+\.(?:jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|wav|m4a|pdf|txt|md|docx|xlsx|zip|json))(?:\n```)?|`((?:\/workspace\/|\/home\/deck\/)[^\s`'"<>\n]+\.(?:jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|wav|m4a|pdf|txt|md|docx|xlsx|zip|json))`/gi;

function extractAllFilePaths(text: string): string[] {
  const paths: string[] = [];
  let match;
  ALL_PATH_REGEX.lastIndex = 0;
  while ((match = ALL_PATH_REGEX.exec(text)) !== null) {
    const p = (match[1] || match[2] || '').trim();
    if (p) paths.push(p);
  }
  return [...new Set(paths)];
}

const renderMarkdown = (text: string) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-green-300 border border-gray-700">
        {lang && <span className="text-gray-500 text-[10px] block mb-1">{lang}</span>}
        {codeLines.join('\n')}
        </pre>
      );
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length || 1;
      const content = line.replace(/^#+\s/, '');
      const cls = level === 1 ? 'font-bold text-base mt-2' : level === 2 ? 'font-bold mt-1' : 'font-semibold';
      elements.push(<p key={i} className={cls}>{inlineMarkdown(content)}</p>);
    } else if (/^[-*•]\s/.test(line)) {
      elements.push(<div key={i} className="flex gap-1.5 my-0.5"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-60" /><span>{inlineMarkdown(line.replace(/^[-*•]\s/, ''))}</span></div>);
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      elements.push(<div key={i} className="flex gap-1.5 my-0.5"><span className="shrink-0 opacity-60 text-xs">{num}.</span><span>{inlineMarkdown(line.replace(/^\d+\.\s/, ''))}</span></div>);
    } else if (line === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="my-0.5">{inlineMarkdown(line)}</p>);
    }
    i++;
  }
  return <div className="text-sm leading-relaxed">{elements}</div>;
};

const inlineMarkdown = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-black/30 px-1 rounded text-xs font-mono break-all">{part.slice(1, -1)}</code>;
    return part;
  });
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const PermissionRow = ({
  perm, onToggle, onRemove
}: {
  perm: { label: string; description: string; key: string; enabled: boolean; builtIn: boolean };
  onToggle: (key: string) => void;
  onRemove?: (key: string) => void;
}) => (
  <div className={clsx("flex items-center gap-2 border rounded-xl px-3 py-2 mb-1.5 transition-colors", perm.enabled ? "bg-gray-800 border-gray-700" : "bg-gray-900 border-gray-800 opacity-50")}>
  <div className="flex-1 min-w-0">
  <div className="text-xs text-gray-200 font-medium truncate">{perm.label}</div>
  <div className="text-[10px] text-gray-500 truncate font-mono">{perm.description}</div>
  </div>
  <button onClick={() => onToggle(perm.key)} className={clsx("relative shrink-0 w-9 h-5 rounded-full transition-colors", perm.enabled ? "bg-purple-600" : "bg-gray-700")}>
  <span className={clsx("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", perm.enabled ? "translate-x-4" : "translate-x-0.5")} />
  </button>
  {onRemove && (
    <button onClick={() => onRemove(perm.key)} className="text-red-400 hover:text-red-300 shrink-0 p-1 ml-1"><X className="w-3.5 h-3.5" /></button>
  )}
  </div>
);

export const NanoView = () => {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const liveStreamEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [showSessionsMenu, setShowSessionsMenu] = useState(false);
  const hasSentInThisSessionRef = useRef(false);

  const [status, setStatus] = useState<AgentStatus>('idle');
  const [nanoMode, setNanoMode] = useState<'lite' | 'med' | 'full'>(() => (localStorage.getItem('NANO_MODE') as 'lite' | 'med' | 'full') || 'full');
  const [inputText, setInputText] = useState('');
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [liveStreamData, setLiveStreamData] = useState<string[]>([]);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showAccessSettings, setShowAccessSettings] = useState(false);
  const [extraMounts, setExtraMounts] = useState<{ path: string; enabled: boolean }[]>([]);
  const [newMountPath, setNewMountPath] = useState('');
  const [mountSaving, setMountSaving] = useState(false);

  // --- BILD/MEDIA CACHE LÅS ---
  const mediaCache = useRef<Record<string, string>>({});
  const [mediaCacheState, setMediaCacheState] = useState<Record<string, string>>({});

  // --- RÖST-STATES ---
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const isLocalMode = localStorage.getItem('TRANSCRIPTION_MODE') === 'local';

  const inputTextRef = useRef(inputText);
  useEffect(() => { inputTextRef.current = inputText; }, [inputText]);
  const originalInputTextRef = useRef('');
  const silenceTimerRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const speechListenerRef = useRef<any>(null);

  type Permission = { label: string; description: string; key: string; enabled: boolean; builtIn: boolean };
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; path: string; mimetype: string; localUrl?: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<LocalAgentMessage[]>([
    { id: '1', role: 'agent', content: 'System redo. Bara börja skriva!', timestamp: Date.now() }
  ]);

  const getServerUrl = () => localStorage.getItem('NANO_SERVER_URL') || 'http://192.168.50.185:8000';
  const getHeaders = (): Record<string, string> => {
    const apiKey = localStorage.getItem('NANO_API_KEY');
    return apiKey ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } : { 'Content-Type': 'application/json' };
  };

  useEffect(() => {
    async function loadData() {
      const allSessions = await dbGetAll<ChatSession>(STORE_SESSIONS);
      const allMsgs = await dbGetAll<LocalAgentMessage>(STORE_CHAT);

      let loadedSessions = [...allSessions];

      const legacyMsgs = allMsgs.filter(m => !m.sessionId);
      if (legacyMsgs.length > 1) {
        const legacySession = { id: 'legacy', title: 'Tidigare konversation', timestamp: legacyMsgs[1].timestamp || Date.now() };
        const exists = loadedSessions.find(s => s.id === 'legacy');
        if (!exists) { await dbPut(STORE_SESSIONS, legacySession); loadedSessions.push(legacySession); }
      }

      loadedSessions.sort((a, b) => b.timestamp - a.timestamp);
      setSessions(loadedSessions);

      if (loadedSessions.length > 0) loadSession(loadedSessions[0].id, allMsgs);
      else startNewSession();

      const logs = await dbGetAll<{ id: number; line: string }>(STORE_LOGS);
      if (logs.length > 0) setLiveStreamData(logs.map(r => r.line));
    }
    loadData();

    if (isLocalMode) SpeechRecognition.requestPermissions().catch(err => console.error("Kunde inte få mikrofonbehörighet:", err));

    const savedMounts = localStorage.getItem('NANO_MOUNTS');
    if (savedMounts) {
      try {
        const mounts = JSON.parse(savedMounts);
        setExtraMounts(mounts);
        const enabledPaths = mounts.filter((m: { enabled: boolean }) => m.enabled).map((m: { path: string }) => m.path);
        fetch(`${getServerUrl()}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extraMounts: enabledPaths }) }).catch(() => {});
      } catch {}
    }
  }, []);

  const loadSession = async (sid: string, preloadedMsgs?: LocalAgentMessage[]) => {
    setCurrentSessionId(sid);
    hasSentInThisSessionRef.current = false;
    const msgs = preloadedMsgs || await dbGetAll<LocalAgentMessage>(STORE_CHAT);
    const sessionMsgs = msgs.filter(m => m.sessionId === sid || (sid === 'legacy' && !m.sessionId));
    if (sessionMsgs.length === 0) setMessages([{ id: '1', role: 'agent', content: 'System redo. Bara börja skriva!', timestamp: Date.now(), sessionId: sid }]);
    else setMessages(sessionMsgs.sort((a, b) => a.timestamp - b.timestamp));
    setShowSessionsMenu(false);
  };

  const startNewSession = () => {
    setCurrentSessionId('');
    hasSentInThisSessionRef.current = false;
    setMessages([{ id: '1', role: 'agent', content: 'Ny konversation startad. Bara börja skriva!', timestamp: Date.now() }]);
    setShowSessionsMenu(false);
    setShowClearMenu(false);
  };

  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      tx.objectStore(STORE_SESSIONS).delete(sid);
      tx.oncomplete = () => resolve();
    });
    const allMsgs = await dbGetAll<LocalAgentMessage>(STORE_CHAT);
    const msgsToDelete = allMsgs.filter(m => m.sessionId === sid || (sid === 'legacy' && !m.sessionId));
    if (msgsToDelete.length > 0) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_CHAT, 'readwrite');
        msgsToDelete.forEach(m => tx.objectStore(STORE_CHAT).delete(m.id));
        tx.oncomplete = () => resolve();
      });
    }
    const newSessions = sessions.filter(s => s.id !== sid);
    setSessions(newSessions);
    if (currentSessionId === sid) {
      if (newSessions.length > 0) loadSession(newSessions[0].id);
      else startNewSession();
    }
  };

  const openAccessSettings = async () => {
    setShowAccessSettings(true);
    setPermissionsLoading(false); // Vi behöver inte ladda alls, det sker direkt!

    // 1. Bygg listan med inbyggda mappar (som alltid finns)
    const builtInPerms: Permission[] = [
      { label: 'Din grupps mapp', description: '/workspace/group/ (läs/skriv)', key: 'folder:/workspace/group/', enabled: true, builtIn: true }
    ];

    // 2. Bygg listan med inbyggda verktyg (som NanoClaw alltid har)
    const toolPerms: Permission[] = [
      { label: 'Webben', description: 'Verktyg: Webben', key: 'tool:Webben', enabled: true, builtIn: true },
      { label: 'Filer', description: 'Verktyg: Filer', key: 'tool:Filer', enabled: true, builtIn: true },
      { label: 'Bash terminal', description: 'Verktyg: Bash', key: 'tool:Bash', enabled: true, builtIn: true },
      { label: 'Schemaläggning', description: 'Verktyg: Schemaläggning', key: 'tool:Schemaläggning', enabled: true, builtIn: true },
      { label: 'WhatsApp', description: 'Verktyg: WhatsApp', key: 'tool:WhatsApp', enabled: true, builtIn: true },
      { label: 'Agenter', description: 'Verktyg: Agenter', key: 'tool:Agenter', enabled: true, builtIn: true }
    ];

    // 3. Hämta dina egna extra-mappar (som appen redan sparat i sitt minne)
    const mountPerms: Permission[] = extraMounts.map(m => ({
      label: m.path.split('/').filter(Boolean).pop() || m.path,
                                                           description: m.path + ' → /workspace/extra/' + (m.path.split('/').filter(Boolean).pop() || ''),
                                                           key: 'mount:' + m.path,
                                                           enabled: m.enabled,
                                                           builtIn: false
    }));

    // 4. Skicka in alla behörigheter i listan direkt
    setPermissions([...builtInPerms, ...toolPerms, ...mountPerms]);
  };

  const togglePermission = (key: string) => {
    const perm = permissions.find(p => p.key === key);
    if (!perm) return;
    const willEnable = !perm.enabled;
    setPermissions(prev => prev.map(p => p.key === key ? { ...p, enabled: willEnable } : p));
    if (key.startsWith('mount:')) toggleMount(key.replace('mount:', ''));
    else sendSystemMessage(willEnable ? `[System] Behörigheten "${perm.label}" har aktiverats igen. Bekräfta kort.` : `[System] Behörigheten "${perm.label}" har inaktiverats. Du ska inte längre använda den. Bekräfta kort.`);
  };

  const saveExtraMounts = async (mounts: { path: string; enabled: boolean }[]) => {
    setMountSaving(true);
    try {
      localStorage.setItem('NANO_MOUNTS', JSON.stringify(mounts));
      const enabledPaths = mounts.filter(m => m.enabled).map(m => m.path);
      await fetch(`${getServerUrl()}/api/config`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ extraMounts: enabledPaths }) });
      setExtraMounts(mounts);
    } catch (err) {}
    setMountSaving(false);
  };

  const sendSystemMessage = async (content: string) => {
    try {
      addLogLine(`> SYSTEM (Dolt uppdrag): ${content}`);

      const selectedModel = localStorage.getItem('NANO_MODEL') || 'claude';
      const geminiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const geminiModelId = localStorage.getItem('NANO_GEMINI_MODEL_ID') || 'gemini-2.0-flash';
      const nanoModeVal = (localStorage.getItem('NANO_MODE') as 'lite' | 'med' | 'full') || 'full';

      const payload: any = {
        message: content,
        model: selectedModel,
        geminiApiKey: geminiKey,
        geminiModelId: geminiModelId,
        mode: nanoModeVal,
        sessionId: currentSessionId
      };

      const response = await fetch(`${getServerUrl()}/api/chat`, {
        method: 'POST',
        headers: getHeaders(),
                                   body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Serverfel: ${response.status}`);

      const earlyContainerId = response.headers.get('X-Container-Id');
      if (earlyContainerId) connectSSE(earlyContainerId);

      const data = await response.json();
      if (!earlyContainerId && data.containerId) connectSSE(data.containerId);

      const finalContent = data.reply || data.result || data.response || '';
      if (finalContent) {
        addLogLine(`< ${finalContent.substring(0, 120)}...`);
        addMessage({
          id: Date.now().toString(),
                   role: 'agent',
                   content: finalContent,
                   timestamp: Date.now(),
                   sessionId: currentSessionId
        });
      }
    } catch (err: any) {
      console.error("Fel vid systemmeddelande:", err);
      addLogLine(`[FEL i Systemmeddelande] ${err.message}`);
    }
  };

  const addMount = () => {
    const p = newMountPath.trim();
    if (!p || extraMounts.some(m => m.path === p)) return;
    const name = p.split('/').filter(Boolean).pop();
    saveExtraMounts([...extraMounts, { path: p, enabled: true }]);
    setNewMountPath('');
    setShowAccessSettings(false);
    sendSystemMessage(`[System] Du har nu fått läs/skriv-behörighet till mappen "${name}" (${p}), monterad som /workspace/extra/${name}. Bekräfta kort.`);
  };

  const removeMount = (path: string) => {
    const name = path.split('/').filter(Boolean).pop();
    saveExtraMounts(extraMounts.filter(m => m.path !== path));
    sendSystemMessage(`[System] Behörigheten till mappen "${name}" (${path}) har tagits bort permanent. Du har inte längre tillgång till den. Bekräfta kort.`);
  };

  const toggleMount = (path: string) => {
    const name = path.split('/').filter(Boolean).pop();
    const mount = extraMounts.find(m => m.path === path);
    const willEnable = mount ? !mount.enabled : true;
    saveExtraMounts(extraMounts.map(m => m.path === path ? { ...m, enabled: !m.enabled } : m));
    sendSystemMessage(willEnable ? `[System] Du har nu fått läs/skriv-behörighet till mappen "${name}" (${path}), monterad som /workspace/extra/${name}. Bekräfta kort.` : `[System] Behörigheten till mappen "${name}" (${path}) har inaktiverats. Du har inte längre tillgång till den tills den aktiveras igen. Bekräfta kort.`);
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, inputText]);
  useEffect(() => { if (isTerminalExpanded) liveStreamEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [liveStreamData, isTerminalExpanded]);

  const addLogLine = (line: string) => {
    setLiveStreamData(prev => [...prev, line].slice(-500));
    dbAdd(STORE_LOGS, { line, ts: Date.now() });
  };

  const addMessage = (msg: LocalAgentMessage) => {
    setMessages(prev => [...prev, msg]);
    dbPut(STORE_CHAT, msg);
  };

  const clearLogs = async () => { await dbClear(STORE_LOGS); setLiveStreamData([]); setShowClearMenu(false); };
  const clearAll = async () => { await dbClear(STORE_LOGS); await dbClear(STORE_CHAT); await dbClear(STORE_SESSIONS); setLiveStreamData([]); setSessions([]); startNewSession(); setShowClearMenu(false); };

  // 🔥 SÄKER HÄMTNING AV MEDIA MED LÅS 🔥
  const fetchMediaAsBlob = async (serverUrl: string, path: string) => {
    if (mediaCache.current[path]) return; // Om den redan laddas eller är klar, avbryt

    mediaCache.current[path] = 'loading'; // Sätt låset direkt

    try {
      const res = await fetch(serverUrl, { headers: getHeaders() });
      if (!res.ok) {
        mediaCache.current[path] = 'error';
        setMediaCacheState(prev => ({ ...prev, [path]: 'error' }));
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      mediaCache.current[path] = objectUrl;
      setMediaCacheState(prev => ({ ...prev, [path]: objectUrl }));
    } catch {
      mediaCache.current[path] = 'error';
      setMediaCacheState(prev => ({ ...prev, [path]: 'error' }));
    }
  };

  const downloadFile = (containerPath: string) => {
    const hostPath = toHostPath(containerPath);
    const url = `${getServerUrl()}/api/files?path=${encodeURIComponent(hostPath)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = containerPath.split('/').pop() || 'file';
    a.click();
  };

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLogLinesRef = useRef<Set<string>>(new Set());

  const isAndroid = /Android/i.test(navigator.userAgent);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    lastLogLinesRef.current = new Set();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${getServerUrl()}/api/logs/poll`, { headers: getHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const lines: string[] = data.lines || [];
        lines.forEach(line => {
          if (!lastLogLinesRef.current.has(line)) {
            lastLogLinesRef.current.add(line);
            addLogLine(line);
          }
        });
      } catch {}
    }, 500);
  };

  const connectSSE = (containerId: string) => {
    if (isAndroid) return; // Android använder polling istället
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    const evtSource = new EventSource(`${getServerUrl()}/api/containers/${containerId}/logs`);
    sseRef.current = evtSource;
    evtSource.onmessage = (event) => { if (event.data) addLogLine(event.data); };
    evtSource.onerror = () => evtSource.close();
  };

  const connectLogStream = () => {
    if (isAndroid) {
      startPolling();
      return;
    }
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    const evtSource = new EventSource(`${getServerUrl()}/api/logs/stream`);
    sseRef.current = evtSource;
    evtSource.onmessage = (event) => { if (event.data) addLogLine(event.data); };
    evtSource.onerror = () => evtSource.close();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const uploaded: { name: string; path: string; mimetype: string; localUrl?: string }[] = [];
    for (const file of Array.from(files)) {
      try {
        const localUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${getServerUrl()}/api/upload`, { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ name: data.filename, path: data.path, mimetype: data.mimetype, localUrl });
        }
      } catch (err) {}
    }
    setAttachedFiles(prev => [...prev, ...uploaded]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

    const toggleRecording = async () => {
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        setIsRecording(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        if (isLocalMode) {
          await SpeechRecognition.stop();
        } else {
          const audioBlob = await stopRecording();
          setIsTranscribing(true);
          try {
            const text = await transcribeBlobAI(audioBlob);
            setInputText(prev => (prev + (prev ? " " : "") + text).trim());
          } catch(e) {
            alert("Kunde inte transkribera ljudet.");
          }
          setIsTranscribing(false);
        }
      } else {
        setIsRecording(true);
        isRecordingRef.current = true;
        originalInputTextRef.current = inputText;
        const autoSend = localStorage.getItem('AUTO_SEND_AUDIO') === 'true';

        if (isLocalMode) {
          if (speechListenerRef.current) speechListenerRef.current.remove();

          speechListenerRef.current = await SpeechRecognition.addListener('partialResults', (data: any) => {
            if (!isRecordingRef.current) return;
            if (data.matches && data.matches.length > 0) {
              const currentTranscript = data.matches[0];
              setInputText(originalInputTextRef.current + (originalInputTextRef.current ? " " : "") + currentTranscript);

              if (autoSend) {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                  if (!isRecordingRef.current) return;
                  isRecordingRef.current = false;
                  setIsRecording(false);
                  SpeechRecognition.stop();
                  handleSend(inputTextRef.current);
                }, 1500);
              }
            }
          });
          await SpeechRecognition.start({ language: 'sv-SE', partialResults: true, popup: false });
        } else {
          await startRecording();
        }
      }
    };

    const handleSend = async (eOrText?: React.MouseEvent | React.KeyboardEvent | string) => {
      let finalInput = inputText;
      if (typeof eOrText === 'string') finalInput = eOrText;
      finalInput = finalInput.trim();

      if (!finalInput && attachedFiles.length === 0) return;
      if (status === 'working') return;

      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        setIsRecording(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (isLocalMode) await SpeechRecognition.stop();
        else await stopRecording();
      }

      const previousMessages = messages.filter(m => m.id !== '1' && m.role !== 'system');
      let activeSessionId = currentSessionId;

      if (!activeSessionId) {
        activeSessionId = Date.now().toString();
        setCurrentSessionId(activeSessionId);
        const title = finalInput.length > 25 ? finalInput.substring(0, 25) + '...' : (finalInput || 'Ny konversation');
        const newSession: ChatSession = { id: activeSessionId, title, timestamp: Date.now() };
        dbPut(STORE_SESSIONS, newSession);
        setSessions(prev => [newSession, ...prev]);
      }

      let messageText = finalInput;
      if (attachedFiles.length > 0) {
        const filePart = attachedFiles.map(f => {
          const containerPath = f.path.replace('/home/deck/NanoClaw/groups/main/', '/workspace/group/');
          return `[Bifogad fil: ${f.name} → ${containerPath}]`;
        }).join('\n');
        messageText = finalInput ? `${finalInput}\n\n${filePart}` : filePart;
      }

      let apiPayloadText = messageText;
      const selectedModel = localStorage.getItem('NANO_MODEL') || 'claude';

      // Skicka bara historik vid flikbyte (gäller både Claude och Gemini)
      if (activeSessionId && !hasSentInThisSessionRef.current && previousMessages.length > 0 && nanoMode !== 'lite') {
        const recentMessages = previousMessages.slice(-4);
        const contextString = recentMessages.map(m => {
          let content = m.content;
          if (m.role === 'agent' && content.length > 400) {
            content = content.substring(0, 200) + '\n... [avkortat] ...\n' + content.substring(content.length - 100);
          }
          return `${m.role === 'user' ? 'Användare' : 'Du'}: ${content}`;
        }).join('\n\n');
        apiPayloadText = `[System: Användaren har precis bytt till en äldre chatt-flik i gränssnittet. Släpp det du höll på med senast och återgå till detta ämne. Här är de 4 senaste meddelandena för kontext:]\n\n${contextString}\n\n[System: Här kommer användarens nya meddelande som du ska svara på nu:]\n${messageText}`;
      }

      hasSentInThisSessionRef.current = true;
      const imageUrls = attachedFiles.filter(f => f.localUrl).map(f => f.localUrl!);

      addMessage({
        id: Date.now().toString(), role: 'user', content: messageText, timestamp: Date.now(), sessionId: activeSessionId, ...(imageUrls.length > 0 ? { imageUrls } : {})
      });

      setInputText('');
      setAttachedFiles([]);
      setStatus('working');
      addLogLine(`> ${finalInput || 'Skickade filer'}`);
      connectLogStream();

      try {
        const geminiKey = localStorage.getItem('GEMINI_API_KEY') || '';
        const geminiModelId = localStorage.getItem('NANO_GEMINI_MODEL_ID') || 'gemini-2.0-flash';

        const requestBody: any = {
          message: apiPayloadText,
          model: selectedModel,
          geminiApiKey: geminiKey,
          geminiModelId: geminiModelId,
          mode: nanoMode,
          sessionId: activeSessionId
        };

        const response = await fetch(`${getServerUrl()}/api/chat`, {
          method: 'POST',
          headers: getHeaders(),
                                     body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`Serverfel: ${response.status}`);
        const earlyContainerId = response.headers.get('X-Container-Id');
        if (earlyContainerId) connectSSE(earlyContainerId);

        const data = await response.json();
        const finalContent = data.reply || data.result || data.response || 'Inget svar.';
        if (!earlyContainerId && data.containerId) connectSSE(data.containerId);

        addLogLine(`< ${finalContent.substring(0, 120)}...`);
        addMessage({
          id: Date.now().toString(),
                   role: 'agent',
                   content: finalContent,
                   timestamp: Date.now(),
                   sessionId: activeSessionId,
                   inputTokens: data.inputTokens,
                   outputTokens: data.outputTokens,
        });
      } catch (error: any) {
        addLogLine(`[FEL] ${error.message}`);
        addMessage({ id: Date.now().toString(), role: 'agent', content: `❌ Fel: ${error.message}`, timestamp: Date.now(), sessionId: activeSessionId });
      }
      stopPolling();
      setStatus('idle');
    };

    const handleLongPressStart = (msgId: string, e: React.TouchEvent | React.MouseEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
      longPressTimer.current = setTimeout(() => setCtxMenu({ msgId, x, y }), 500);
    };
    const handleLongPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const copyMessage = (msgId: string) => { const msg = messages.find(m => m.id === msgId); if (msg) navigator.clipboard.writeText(msg.content); setCtxMenu(null); };
    const deleteMessage = async (msgId: string) => { setMessages(prev => prev.filter(m => m.id !== msgId)); const db = await openDB(); const tx = db.transaction(STORE_CHAT, 'readwrite'); tx.objectStore(STORE_CHAT).delete(msgId); setCtxMenu(null); };

    const renderMessage = (msg: LocalAgentMessage) => {
      const filePaths = msg.role === 'agent' ? extractFilePaths(msg.content) : [];
      const allServerPaths = msg.role === 'agent' ? extractAllFilePaths(msg.content) : [];
      const externalImages = msg.role === 'agent' ? extractExternalImageUrls(msg.content) : [];
      const isUser = msg.role === 'user';
      const toMediaUrl = (p: string) => `${getServerUrl()}/api/files?path=${encodeURIComponent(toHostPath(p))}`;

      return (
        <div key={msg.id} className={clsx("flex flex-col gap-0.5", isUser ? 'items-end' : 'items-start')} onTouchStart={e => handleLongPressStart(msg.id, e)} onTouchEnd={handleLongPressEnd} onTouchMove={handleLongPressEnd} onMouseDown={e => handleLongPressStart(msg.id, e)} onMouseUp={handleLongPressEnd} onMouseLeave={handleLongPressEnd}>
        <div className={clsx("max-w-[80%] rounded-2xl p-4 shadow-sm select-none", isUser ? 'bg-purple-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700')}>
        {msg.imageUrls && msg.imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
          {msg.imageUrls.map((url, i) => ( <img key={i} src={url} alt="Bifogad bild" onClick={() => setLightboxUrl(url)} className="max-h-48 max-w-full rounded-xl object-contain bg-black/20 cursor-pointer active:opacity-80" /> ))}
          </div>
        )}
        {externalImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
          {externalImages.map((img, i) => ( <img key={i} src={img.url} alt={img.alt} onClick={() => setLightboxUrl(img.url)} className="max-h-64 max-w-full rounded-xl object-contain bg-black/20 cursor-pointer active:opacity-80" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> ))}
          </div>
        )}
        {allServerPaths.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
          {allServerPaths.map((p, i) => {
            const serverUrl = toMediaUrl(p);
            const type = getMediaType(p);
            const name = p.split('/').pop() || p;
            const cachedUrl = mediaCacheState[p];

            if (!cachedUrl) fetchMediaAsBlob(serverUrl, p);

            return (
              <div key={i} className="flex flex-col gap-1">
              {type === 'image' && (
                cachedUrl && cachedUrl !== 'loading' && cachedUrl !== 'error'
              ? <img src={cachedUrl} alt={name} onClick={() => setLightboxUrl(cachedUrl)} className="max-h-64 max-w-full rounded-xl object-contain bg-black/20 cursor-pointer active:opacity-80" />
              : cachedUrl === 'error'
              ? <div className="text-[11px] text-red-400 px-3 py-2 bg-red-900/20 rounded-xl">Kunde inte ladda {name}</div>
              : <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2 text-xs text-gray-400">
              <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin shrink-0" /> Laddar {name}...
              </div>
              )}
              {type === 'video' && (
                cachedUrl && cachedUrl !== 'loading' && cachedUrl !== 'error'
              ? <video src={cachedUrl} controls className="max-h-64 max-w-full rounded-xl bg-black" />
              : cachedUrl === 'error'
              ? <div className="text-[11px] text-red-400 px-3 py-2 bg-red-900/20 rounded-xl">Kunde inte ladda {name}</div>
              : <div className="text-xs text-gray-400 px-3 py-2 bg-black/20 rounded-xl">Laddar video...</div>
              )}
              {type === 'audio' && (
                cachedUrl && cachedUrl !== 'loading' && cachedUrl !== 'error'
                ? <div className="bg-black/30 rounded-xl p-3"><p className="text-[11px] text-gray-400 mb-1 truncate">{name}</p><audio src={cachedUrl} controls className="w-full" /></div>
                : cachedUrl === 'error'
                ? <div className="text-[11px] text-red-400 px-3 py-2 bg-red-900/20 rounded-xl">Kunde inte ladda ljud</div>
                : <div className="text-xs text-gray-400 px-3 py-2 bg-black/20 rounded-xl">Laddar ljud...</div>
              )}
              <button onClick={() => downloadFile(p)} className="flex items-center gap-2 bg-purple-700/40 hover:bg-purple-600/60 border border-purple-500/40 rounded-lg px-3 py-2 text-xs text-purple-200 transition-colors mt-1">
              <Download className="w-3 h-3 shrink-0" /> <span className="font-mono truncate">{name}</span>
              </button>
              </div>
            );
          })}
          </div>
        )}
        {isUser ? <div className="text-sm whitespace-pre-wrap leading-relaxed break-words">{msg.content}</div> : <div className="break-words overflow-hidden">{renderMarkdown(msg.content)}</div>}
        {filePaths.filter(fp => !allServerPaths.includes(fp)).length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
          {filePaths.filter(fp => !allServerPaths.includes(fp)).map((fp, i) => (
            <button key={i} onClick={() => downloadFile(fp)} className="flex items-center gap-2 bg-purple-700/40 hover:bg-purple-600/60 border border-purple-500/40 rounded-lg px-3 py-2 text-xs text-purple-200 transition-colors">
            <Download className="w-3 h-3 shrink-0" /> <span className="font-mono truncate">{fp.split('/').pop()}</span> <span className="text-purple-400 truncate text-[10px]">{fp}</span>
            </button>
          ))}
          </div>
        )}
        </div>
        <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
        {!isUser && (msg.inputTokens || msg.outputTokens) && (
          <span className="text-[10px] text-gray-600">
          {msg.inputTokens ? `↑${msg.inputTokens}` : ''}{msg.inputTokens && msg.outputTokens ? ' ' : ''}{msg.outputTokens ? `↓${msg.outputTokens}` : ''} tok
          </span>
        )}
        </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* HEADER */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 pt-12 pb-4 flex justify-between items-center shadow-md flex-shrink-0">
      <div className="flex items-center gap-3">
      <div className="bg-purple-500/20 p-2 rounded-lg">
      <Terminal className="w-6 h-6 text-purple-400" />
      </div>
      <div>
      <h1 className="text-xl font-bold text-white">NanoClaw</h1>
      <div className="flex items-center gap-2 text-xs">
      <span className={clsx("w-2 h-2 rounded-full", status === 'idle' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse')} />
      <span className="text-gray-400">{status === 'idle' ? 'Redo' : 'Arbetar...'}</span>
      {status === 'working' && (
        <button onClick={async () => {
          try {
            await fetch(`${getServerUrl()}/api/kill`, { method: 'POST', headers: getHeaders() });
          } catch {}
          stopPolling();
          setStatus('idle');
          addMessage({ id: Date.now().toString(), role: 'agent', content: '🛑 Agenten stoppades. Du kan skriva ett nytt meddelande när du vill.', timestamp: Date.now() });
          addLogLine('[STOPP] Docker-containrar stoppade.');
        }} className="ml-1 px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded-md text-[10px] font-bold transition-colors active:scale-95">
        Stoppa
        </button>
      )}
      </div>
      </div>
      </div>

      <div className="flex gap-2 relative">
      <div className="relative">
      <button onClick={() => { setShowSessionsMenu(v => !v); setShowClearMenu(false); }} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors" title="Konversationer">
      <MessageSquare className="w-5 h-5" />
      </button>
      {showSessionsMenu && (
        <div className="absolute right-0 top-10 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 w-64 overflow-hidden flex flex-col max-h-[60vh]">
        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-700">
        <span className="text-xs font-bold text-gray-400 uppercase">Chattar</span>
        <button onClick={() => setShowSessionsMenu(false)}><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <button onClick={startNewSession} className="flex items-center gap-2 m-2 p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors justify-center text-sm font-bold shadow-sm">
        <Plus className="w-4 h-4" /> Ny konversation
        </button>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {sessions.map(s => (
          <div key={s.id} onClick={() => loadSession(s.id)} className={clsx("flex items-center justify-between p-2 rounded-lg cursor-pointer group transition-colors", currentSessionId === s.id ? "bg-gray-700 text-white" : "hover:bg-gray-700/50 text-gray-400")}>
          <div className="truncate text-sm pr-2">{s.title}</div>
          <button onClick={(e) => deleteSession(s.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {sessions.length === 0 && <div className="text-center text-xs text-gray-500 py-4">Inga gamla chattar</div>}
        </div>
        </div>
      )}
      </div>

      <div className="relative">
      <button onClick={() => { setShowClearMenu(v => !v); setShowSessionsMenu(false); }} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors" title="Rensa">
      <Trash2 className="w-5 h-5" />
      </button>
      {showClearMenu && (
        <div className="absolute right-0 top-10 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 w-52 overflow-hidden">
        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-700">
        <span className="text-xs font-bold text-gray-400 uppercase">Rensa</span>
        <button onClick={() => setShowClearMenu(false)}><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <button onClick={startNewSession} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-700 text-gray-200 transition-colors">Rensa skärm (Ny chatt)</button>
        <button onClick={clearLogs} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-700 text-gray-200 transition-colors border-t border-gray-700">Rensa Live Action Stream</button>
        <button onClick={clearAll} className="w-full text-left px-4 py-3 text-sm hover:bg-red-900/40 text-red-400 transition-colors border-t border-gray-700">Radera precis allt</button>
        </div>
      )}
      </div>
      <button onClick={openAccessSettings} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors" title="Åtkomst"><FolderOpen className="w-5 h-5" /></button>
      <button onClick={() => {
        const next = nanoMode === 'lite' ? 'med' : nanoMode === 'med' ? 'full' : 'lite';
        setNanoMode(next);
        localStorage.setItem('NANO_MODE', next);
      }} className={clsx("px-2 py-1 rounded-lg text-[11px] font-bold transition-colors border",
        nanoMode === 'lite' ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-400" :
        nanoMode === 'med'  ? "bg-blue-500/20 border-blue-500/40 text-blue-400" :
        "bg-purple-500/20 border-purple-500/40 text-purple-400"
      )} title={
        nanoMode === 'lite' ? "Lite: bara meddelandet" :
        nanoMode === 'med'  ? "Med: historik, ingen systempromt" :
        "Full: systempromt + historik"
      }>
      {nanoMode === 'lite' ? '⚡ Lite' : nanoMode === 'med' ? '⚙️ Med' : '🧠 Full'}
      </button>
      <button onClick={() => navigate('/settings')} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 transition-colors" title="Inställningar"><Settings className="w-5 h-5" /></button>
      </div>
      </header>

      {/* LIVE ACTION STREAM */}
      <div className="border-b border-gray-700 flex-shrink-0 bg-black">
      <div onClick={() => setIsTerminalExpanded(!isTerminalExpanded)} className="flex items-center justify-between p-2 px-4 cursor-pointer hover:bg-gray-900 transition-colors">
      <div className="flex items-center gap-2 text-sm text-green-400 font-mono font-bold">
      <Terminal className="w-4 h-4" /> Live Action Stream
      {liveStreamData.length > 0 && <span className="text-gray-600 text-[10px] font-normal">{liveStreamData.length} rader</span>}
      </div>
      {isTerminalExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
      {isTerminalExpanded && (
        <div className="h-48 overflow-y-auto bg-black p-4 font-mono text-xs text-green-500 border-t border-gray-800">
        {liveStreamData.length === 0 ? <div className="text-gray-600">Ingen aktivitet ännu...</div> : liveStreamData.map((line, i) => <div key={i} className="break-words mb-1 opacity-80 hover:opacity-100">{line}</div>)}
        <div ref={liveStreamEndRef} />
        </div>
      )}
      </div>

      {/* CHATT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map(renderMessage)}
      {status === 'working' && (
        <div className="flex justify-start">
        <div className="bg-gray-800 text-gray-100 rounded-2xl rounded-bl-none border border-gray-700 p-4 flex items-center gap-3">
        <div className="flex gap-1">
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span className="text-sm text-gray-400">Agenten tänker...</span>
        </div>
        </div>
      )}
      <div ref={messagesEndRef} className="h-10 shrink-0" />
      </div>

      {/* INPUT */}
      <div className="bg-gray-800 border-t border-gray-700 p-4 pb-24 flex-shrink-0">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">

      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
        {attachedFiles.map((f, i) => (
          <div key={i} className="relative">
          {f.localUrl ? (
            <div className="relative group">
            <img src={f.localUrl} alt={f.name} className="h-16 w-16 object-cover rounded-xl border border-purple-500/40" />
            <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-gray-900 border border-gray-600 rounded-full p-0.5 text-gray-400 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-purple-900/40 border border-purple-500/40 rounded-lg px-3 py-1.5 text-xs text-purple-200">
            <Paperclip className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[160px]">{f.name}</span>
            <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="text-purple-400 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          )}
          </div>
        ))}
        </div>
      )}

      <div className="flex items-end gap-3">
      <input ref={fileInputRef} type="file" multiple accept="image/*,*/*" className="hidden" onChange={handleFileSelect} />

      <div className="flex flex-col gap-2 shrink-0">
      <button onClick={() => fileInputRef.current?.click()} disabled={status === 'working' || isUploading} className="p-3.5 rounded-2xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 transition-colors flex items-center justify-center shadow-sm" title="Bifoga fil eller bild">
      {isUploading ? <span className="w-5 h-5 block border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> : <Paperclip className="w-5 h-5" />}
      </button>

      <button onClick={toggleRecording} className={clsx("p-3.5 rounded-2xl transition-all shadow-sm flex items-center justify-center", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-gray-700 text-gray-300 hover:bg-gray-600")} title="Tala in uppdrag">
      {isTranscribing ? <Loader2 size={20} className="animate-spin" /> : (isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />)}
      </button>
      </div>

      <div className="flex-1 bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-purple-500/50 transition-all relative">
      <textarea
      value={inputText}
      onChange={(e) => setInputText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
      placeholder={isRecording && isLocalMode ? "Lyssnar..." : "Skriv ett uppdrag..."}
      disabled={status === 'working'}
      className="w-full bg-transparent text-white p-4 max-h-32 focus:outline-none resize-none disabled:opacity-50"
      rows={1}
      />
      </div>

      <button onClick={handleSend} disabled={!inputText.trim() && attachedFiles.length === 0 || status === 'working' || isTranscribing} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed p-4 rounded-2xl text-white transition-all shadow-lg active:scale-95">
      <Send className="w-6 h-6" />
      </button>
      </div>
      </div>
      </div>

      {(showClearMenu || showSessionsMenu) && ( <div className="fixed inset-0 z-40" onClick={() => { setShowClearMenu(false); setShowSessionsMenu(false); }} /> )}

      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
        <img src={lightboxUrl} alt="Fullskärm" className="max-w-full max-h-full object-contain rounded-lg" />
        <button className="absolute top-12 right-4 p-2 text-white bg-black/50 rounded-full"><X className="w-6 h-6" /></button>
        </div>
      )}

      {ctxMenu && (
        <>
        <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
        <div className="fixed z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden w-44" style={{ left: Math.min(ctxMenu.x, window.innerWidth - 180), top: Math.min(ctxMenu.y, window.innerHeight - 120) }}>
        <button onClick={() => copyMessage(ctxMenu.msgId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors"><span>📋</span> Kopiera</button>
        <button onClick={() => deleteMessage(ctxMenu.msgId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-900/30 transition-colors border-t border-gray-700"><span>🗑️</span> Ta bort</button>
        </div>
        </>
      )}

      {showAccessSettings && (
        <div className="fixed inset-0 z-50 flex flex-col">
        <div className="absolute inset-0 bg-black/60" onClick={() => setShowAccessSettings(false)} />
        <div className="relative bg-gray-900 border-b border-gray-700 w-full shadow-2xl z-10 flex flex-col" style={{ maxHeight: '100dvh' }}>
        <div className="flex items-center justify-between px-4 pt-12 pb-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
        <div className="bg-purple-500/20 p-1.5 rounded-lg"><FolderOpen className="w-4 h-4 text-purple-400" /></div>
        <div><h2 className="text-white font-bold text-sm">Behörigheter</h2><p className="text-[11px] text-gray-400">{permissionsLoading ? 'Frågar agenten...' : `${permissions.filter(p => p.enabled).length} aktiva`}</p></div>
        </div>
        <button onClick={() => setShowAccessSettings(false)} className="p-2 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2" style={{ maxHeight: '55dvh' }}>
        {permissionsLoading && <div className="flex items-center justify-center py-10 gap-3 text-gray-500 text-sm"><span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> Hämtar behörigheter...</div>}
        {!permissionsLoading && permissions.length === 0 && <div className="text-center py-8 text-gray-500 text-xs">Inga behörigheter hittades.</div>}
        {!permissionsLoading && permissions.some(p => p.key.startsWith('folder:')) && (<div><p className="text-[10px] uppercase font-bold text-gray-500 px-1 mb-1">Mappar</p>{permissions.filter(p => p.key.startsWith('folder:')).map(perm => (<PermissionRow key={perm.key} perm={perm} onToggle={togglePermission} />))}</div>)}
        {!permissionsLoading && permissions.some(p => p.key.startsWith('mount:')) && (<div><p className="text-[10px] uppercase font-bold text-gray-500 px-1 mb-1 mt-2">Extra mappar</p>{permissions.filter(p => p.key.startsWith('mount:')).map(perm => (<PermissionRow key={perm.key} perm={perm} onToggle={togglePermission} onRemove={p => { removeMount(p.replace('mount:', '')); setPermissions(prev => prev.filter(x => x.key !== p)); }} />))}</div>)}
        {!permissionsLoading && permissions.some(p => p.key.startsWith('tool:')) && (<div><p className="text-[10px] uppercase font-bold text-gray-500 px-1 mb-1 mt-2">Verktyg</p>{permissions.filter(p => p.key.startsWith('tool:')).map(perm => (<PermissionRow key={perm.key} perm={perm} onToggle={togglePermission} />))}</div>)}
        </div>
        <div className="p-3 border-t border-gray-700">
        <p className="text-[11px] text-gray-500 mb-2">Lägg till mapp, t.ex. <span className="font-mono text-gray-400">/home/deck/Documents</span></p>
        <div className="flex gap-2">
        <input type="text" value={newMountPath} onChange={e => setNewMountPath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMount(); }} placeholder="/home/deck/..." className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
        <button onClick={addMount} disabled={!newMountPath.trim() || mountSaving} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 p-2.5 rounded-xl text-white transition-colors">
        {mountSaving ? <Check className="w-5 h-5 animate-pulse" /> : <Plus className="w-5 h-5" />}
        </button>
        </div>
        </div>
        </div>
        </div>
      )}
      </div>
    );
};
