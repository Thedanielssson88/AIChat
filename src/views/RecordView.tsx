import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, X, Loader2 } from 'lucide-react';
import { startRecording, stopRecording } from '../services/audioRecorder';
import { getOrCreateDayForDate, addEntry, setEntryAudio } from '../services/db';
import { addToQueue } from '../services/queueService';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const RecordView = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // LIVE-TEXT (det du säger exakt just nu)
  const [liveText, setLiveText] = useState('');
  // CHUNKS (alla tidigare meningar sparade separat i en lista)
  const [textChunks, setTextChunks] = useState<string[]>([]);

  const timerRef = useRef<any>(null);
  const listenerRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSavingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const currentLiveTextRef = useRef('');
  const chunksRef = useRef<string[]>([]);

  const isLocalMode = localStorage.getItem('TRANSCRIPTION_MODE') === 'local';

  useEffect(() => {
    if (isLocalMode) {
      SpeechRecognition.requestPermissions();
    }
    return () => {
      isRecordingRef.current = false;
      stopAllNative();
    };
  }, []);

  // Auto-scrolla ner när ny text dyker upp
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveText, textChunks]);

  const stopAllNative = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (listenerRef.current) {
      listenerRef.current.remove();
      listenerRef.current = null;
    }
    if (isLocalMode) {
      // Säkert stopp: vänta max 300ms så att appen inte hänger sig
      await Promise.race([
        SpeechRecognition.stop(),
                         new Promise(resolve => setTimeout(resolve, 300))
      ]).catch(() => {});
    }
  };

  const startListeningLoop = async () => {
    if (!isRecordingRef.current || isSavingRef.current) return;

    try {
      // Spara undan det vi just hörde till historiken (arrayen)
      const textToSave = currentLiveTextRef.current.trim();
      if (textToSave) {
        chunksRef.current = [...chunksRef.current, textToSave];
        setTextChunks([...chunksRef.current]);
        setLiveText('');
        currentLiveTextRef.current = '';
      }

      await SpeechRecognition.start({
        language: 'sv-SE',
        partialResults: true,
        popup: false,
      });
    } catch (e) {
      console.log("Omstart misslyckades, försöker igen...", e);
      setTimeout(startListeningLoop, 300);
    }
  };

  // Funktion för att ändra en textbit om den blev fel
  const handleChunkEdit = (index: number, newText: string) => {
    const updatedChunks = [...chunksRef.current];
    updatedChunks[index] = newText;
    chunksRef.current = updatedChunks;
    setTextChunks(updatedChunks);
  };

  const performSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    isRecordingRef.current = false;

    await stopAllNative();

    try {
      const todayString = new Date().toISOString().split('T')[0];
      const day = await getOrCreateDayForDate(todayString);

      if (isLocalMode) {
        // Slå ihop alla redigerade chunks + det sista live-talet
        const finalChunks = [...chunksRef.current];
        if (currentLiveTextRef.current.trim()) {
          finalChunks.push(currentLiveTextRef.current.trim());
        }

        const finalText = finalChunks.join(' ').trim();

        await addEntry({
          dayId: day.id,
          createdAt: new Date().toISOString(),
                       isTranscribed: true,
                       transcription: finalText || "Ingen text fångades upp."
        });
      } else {
        // API-LÄGE
        const audioBlob = await stopRecording(); // Fånga blobben direkt
        const entryId = await addEntry({
          dayId: day.id,
          createdAt: new Date().toISOString(),
          isTranscribed: false,
          transcription: ""
        });
        // Spara blobben och hämta dess inbyggda mime-typ
        await setEntryAudio(entryId, audioBlob, audioBlob.type);
        await addToQueue(entryId, 'audio');
      }
      navigate(`/day/${day.id}`);
    } catch (err) {
      console.error(err);
      alert("Kunde inte spara.");
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      isRecordingRef.current = true;
      setDuration(0);
      setLiveText('');
      setTextChunks([]);
      chunksRef.current = [];
      currentLiveTextRef.current = '';

      if (isLocalMode) {
        listenerRef.current = await SpeechRecognition.addListener('partialResults', (data: any) => {
          if (data.matches && data.matches.length > 0) {
            const text = data.matches[0];
            setLiveText(text);
            currentLiveTextRef.current = text;
          }
        });

        await startListeningLoop();

        const monitorInterval = setInterval(async () => {
          if (!isRecordingRef.current) {
            clearInterval(monitorInterval);
            return;
          }
          const { listening } = await SpeechRecognition.isListening();
          if (!listening && isRecordingRef.current && !isSavingRef.current) {
            startListeningLoop();
          }
        }, 800);
      } else {
        await startRecording();
      }

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-6 text-white pt-12">
    <div className="mb-6 text-center flex flex-col items-center shrink-0">
    {isLocalMode && (
      <span className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 border border-indigo-500/30">
      Pixel Native Engine
      </span>
    )}
    <div className="text-6xl font-mono mb-2 tracking-tighter">
    {formatTime(duration)}
    </div>
    {isRecording && !isSaving && (
      <div className="flex items-center justify-center gap-2 text-red-400 animate-pulse">
      <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_red]"></div>
      <span className="text-[10px] font-bold uppercase tracking-widest">Inspelning aktiv</span>
      </div>
    )}
    </div>

    {/* PREVIEW-FÖNSTER (SCROLLBART & REDIGERBART) */}
    {isLocalMode && (
      <div
      ref={scrollRef}
      className="w-full max-w-sm mb-8 p-6 bg-white/5 rounded-[2rem] border border-white/10 h-80 shadow-inner overflow-y-auto flex flex-col transition-all"
      >
      <p className="text-[9px] text-gray-500 uppercase mb-4 tracking-widest sticky top-0 bg-slate-900/80 backdrop-blur-md py-1 z-10">
      Klicka i texten för att ändra
      </p>
      <div className="text-left flex-1 pb-10">
      {textChunks.map((chunk, idx) => (
        <span
        key={idx}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => handleChunkEdit(idx, e.currentTarget.textContent || "")}
        className="text-gray-400 text-lg leading-relaxed mr-1.5 focus:text-white focus:outline-none focus:bg-white/10 rounded px-1 transition-all inline-block"
        >
        {chunk}
        </span>
      ))}
      <span className="text-white text-lg leading-relaxed font-medium italic">
      {liveText ? `${liveText}` : (isRecording ? "..." : "")}
      </span>
      </div>
      </div>
    )}

    <div className="flex flex-col items-center gap-8 mt-auto mb-8 shrink-0">
    {!isRecording ? (
      <button onClick={handleStartRecording} className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-all">
      <Mic size={40} fill="currentColor" />
      </button>
    ) : (
      <button
      onClick={performSave}
      disabled={isSaving}
      className="w-24 h-24 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-all disabled:opacity-50"
      >
      {isSaving ? <Loader2 className="animate-spin text-slate-400" size={40} /> : <Square size={40} fill="currentColor" />}
      </button>
    )}

    <button onClick={() => navigate(-1)} disabled={isSaving} className="text-gray-500 text-xs font-bold flex items-center gap-2 hover:text-white py-2 px-4 transition-colors">
    <X size={16} /> AVBRYT
    </button>
    </div>
    </div>
  );
};
