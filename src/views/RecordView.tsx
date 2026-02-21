import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, X, Loader2 } from 'lucide-react';
import { audioRecorder } from '../services/audioRecorder';
import { getOrCreateDayForDate, addEntry, setEntryAudio } from '../services/db';
import { processQueue } from '../services/queueService';
// Importera den native-bryggan för röstigenkänning
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const RecordView = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  // State för att hålla och visa texten live
  const [liveText, setLiveText] = useState('');
  const timerRef = useRef<any>(null);

  // Kollar om användaren valt lokal transkribering i inställningarna
  const isLocalMode = localStorage.getItem('TRANSCRIPTION_MODE') === 'local';

  useEffect(() => {
    // Fråga om rättigheter direkt när vyn öppnas om vi kör lokalt
    const initSpeech = async () => {
      if (isLocalMode) {
        try {
          const hasPermission = await SpeechRecognition.checkPermissions();
          if (hasPermission.speechRecognition !== 'granted') {
            await SpeechRecognition.requestPermissions();
          }
        } catch (e) {
          console.error("Kunde inte initiera SpeechRecognition", e);
        }
      }
    };
    initSpeech();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isLocalMode) {
        SpeechRecognition.removeAllListeners().catch(() => {});
      }
    };
  }, [isLocalMode]);

  const handleStartRecording = async () => {
    try {
      await audioRecorder.start();
      setIsRecording(true);
      setLiveText('');

      // Om vi kör lokalt, starta Androids native röstmotor
      if (isLocalMode) {
        try {
          const available = await SpeechRecognition.available();
          if (available.available) {
            await SpeechRecognition.start({
              language: 'sv-SE',
              partialResults: true, // Låter oss se orden medan du pratar
              popup: false,         // Stänger av Googles standard-popup
            });

            // Lyssna på nya ord live!
            SpeechRecognition.addListener('partialResults', (data: any) => {
              if (data.matches && data.matches.length > 0) {
                setLiveText(data.matches[0]);
              }
            });
          }
        } catch (speechErr) {
          console.error("Native speech start error:", speechErr);
        }
      }

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Kunde inte starta inspelning:", err);
      alert("Kunde inte starta mikrofonen.");
    }
  };

  const handleStopRecording = async () => {
    setIsSaving(true);
    if (timerRef.current) clearInterval(timerRef.current);
    
    try {
      // 1. Stäng av röstmotorn
      if (isLocalMode) {
        try {
          await SpeechRecognition.stop();
          await SpeechRecognition.removeAllListeners();
        } catch (e) {
          console.error("Speech stop error", e);
        }
      }

      // 2. Stoppa ljudinspelningen och hämta filen
      const blob = await audioRecorder.stop();
      const todayString = new Date().toISOString().split('T')[0];
      const day = await getOrCreateDayForDate(todayString);
      
      // 3. Spara inlägget till databasen
      // Om lokalt läge är aktivt sparar vi den live-transkriberade texten direkt!
      const finalTranscription = isLocalMode ? liveText.trim() : "";
      
      const entryId = await addEntry({
        dayId: day.id,
        createdAt: new Date().toISOString(),
        isTranscribed: isLocalMode && finalTranscription.length > 0, // Klar direkt om lokalt!
        transcription: finalTranscription
      });

      // 4. Spara ljudfilen för framtida referens
      await setEntryAudio(entryId, blob, blob.type);
      
      // 5. Starta kön BARA om vi använder API-läget
      if (!isLocalMode) {
        processQueue();
      }
      
      navigate(`/day/${day.id}`);
    } catch (err) {
      console.error("Fel vid sparande:", err);
      setIsSaving(false);
      alert("Kunde inte spara inlägget.");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white relative">
      <div className="mb-12 text-center">
        <div className="text-6xl font-mono mb-4 tracking-tighter">
          {formatTime(duration)}
        </div>
        {isRecording && (
          <div className="flex items-center justify-center gap-2 text-red-400 animate-pulse">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-sm font-bold uppercase tracking-widest">Spelar in...</span>
          </div>
        )}
      </div>

      {/* Visar texten live på skärmen! */}
      <div className="w-full max-w-md h-32 flex items-center justify-center mb-8 px-4 text-center">
        {isRecording && isLocalMode && (
          <p className="text-xl text-gray-300 font-medium italic leading-relaxed">
            {liveText || "Lyssnar (Native Pixel)..."}
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-8">
        {!isRecording ? (
          <button onClick={handleStartRecording} className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center shadow-2xl shadow-red-900/20 active:scale-90 transition-transform">
            <Mic size={40} fill="currentColor" />
          </button>
        ) : (
          <button onClick={handleStopRecording} disabled={isSaving} className="w-24 h-24 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={40} /> : <Square size={40} fill="currentColor" />}
          </button>
        )}

        <button onClick={() => navigate(-1)} disabled={isSaving} className="text-gray-500 font-bold flex items-center gap-2 hover:text-white transition-colors">
          <X size={20} /> AVBRYT
        </button>
      </div>
    </div>
  );
};
