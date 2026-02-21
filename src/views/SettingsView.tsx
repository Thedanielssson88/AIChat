import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Key, RotateCcw, PenTool, MessageSquare, Cpu, FolderOpen } from 'lucide-react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { DEFAULT_DIARY_PROMPT, DEFAULT_QUESTIONS_PROMPT } from '../services/geminiService';
import { clsx } from 'clsx';

export const SettingsView = () => {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('flash');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customQuestionsPrompt, setCustomQuestionsPrompt] = useState('');
  
  // Inställningar för motor-läge
  const [transcriptionMode, setTranscriptionMode] = useState('api'); // 'api' | 'local'
  const [summaryMode, setSummaryMode] = useState('api'); // 'api' | 'local'
  const [localModelPath, setLocalModelPath] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('GEMINI_API_KEY') || '');
    setModel(localStorage.getItem('GEMINI_MODEL') || 'flash');
    setCustomPrompt(localStorage.getItem('GEMINI_PROMPT') || DEFAULT_DIARY_PROMPT);
    setCustomQuestionsPrompt(localStorage.getItem('GEMINI_QUESTIONS_PROMPT') || DEFAULT_QUESTIONS_PROMPT);
    
    // Hämta motor-inställningar
    setTranscriptionMode(localStorage.getItem('TRANSCRIPTION_MODE') || 'api');
    setSummaryMode(localStorage.getItem('SUMMARY_MODE') || 'api');
    setLocalModelPath(localStorage.getItem('LOCAL_MODEL_PATH') || '');
  }, []);

  const handleSave = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
    localStorage.setItem('GEMINI_MODEL', model);
    localStorage.setItem('GEMINI_PROMPT', customPrompt.trim());
    localStorage.setItem('GEMINI_QUESTIONS_PROMPT', customQuestionsPrompt.trim());
    
    // Spara motor-inställningar
    localStorage.setItem('TRANSCRIPTION_MODE', transcriptionMode);
    localStorage.setItem('SUMMARY_MODE', summaryMode);
    localStorage.setItem('LOCAL_MODEL_PATH', localModelPath.trim());
    
    alert('Dina inställningar har sparats!');
    navigate(-1);
  };

  const handleResetPrompt = () => {
    if (window.confirm('Återställ sammanfattnings-instruktionerna?')) setCustomPrompt(DEFAULT_DIARY_PROMPT);
  };

  const handleResetQuestionsPrompt = () => {
    if (window.confirm('Återställ fråge-instruktionerna?')) setCustomQuestionsPrompt(DEFAULT_QUESTIONS_PROMPT);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32 relative">
      <div className="bg-white p-6 pb-6 shadow-sm sticky top-0 z-10 text-gray-900">
        <button onClick={() => navigate(-1)} className="p-2 bg-gray-100 rounded-full text-gray-600 mb-4">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-extrabold leading-tight">Inställningar</h1>
      </div>

      <div className="p-4 space-y-6">
        {/* API-INSTÄLLNINGAR */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Key size={16} /> Moln-AI (Gemini API)
          </h3>
          <input 
            type="password" 
            value={apiKey} 
            onChange={e => setApiKey(e.target.value)} 
            placeholder="API-nyckel"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400"
          />
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">AI-Modell</label>
            <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-200">
              <button 
                onClick={() => setModel('flash')} 
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${model === 'flash' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Snabb (Flash)
              </button>
              <button 
                onClick={() => setModel('pro')} 
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${model === 'pro' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Smart (Pro)
              </button>
            </div>
          </div>
        </div>

        {/* LOKALA INSTÄLLNINGAR */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Cpu size={16} /> Lokal Bearbetning (Pixel 9 Pro)
          </h3>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-sm font-medium text-gray-700">Transkribering</span>
            <div className="flex bg-gray-200 rounded-lg p-1 w-32">
              <button onClick={() => setTranscriptionMode('api')} className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", transcriptionMode === 'api' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>API</button>
              <button onClick={() => setTranscriptionMode('local')} className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", transcriptionMode === 'local' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LOKAL</button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-sm font-medium text-gray-700">Sammanfattning</span>
            <div className="flex bg-gray-200 rounded-lg p-1 w-32">
              <button onClick={() => setSummaryMode('api')} className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", summaryMode === 'api' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>API</button>
              <button onClick={() => setSummaryMode('local')} className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", summaryMode === 'local' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LOKAL</button>
            </div>
          </div>
          { (transcriptionMode === 'local' || summaryMode === 'local') && (
            <p className="mt-2 text-[10px] text-indigo-500 font-medium italic">
              * Lokal AI kräver en kompatibel .gguf-modell (t.ex. Llama-3) eller Gemini Nano-stöd.
            </p>
          )}

          {/* NYTT: Sektion för vald lokal modell */}
          {summaryMode === 'local' && (
             <div className="pt-4 mt-4 border-t border-gray-100">
               <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
                 <FolderOpen size={14} /> Sökväg till Lokal GGUF-modell
               </label>
               <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">
                 Ladda ner en .gguf-modell (t.ex. från AI-Sweden-Models) till din telefon och ange sökvägen här. 
                 Mappen måste vara tillgänglig för appen.
               </p>
               <div className="flex flex-col gap-3">
                 <button 
                   onClick={async () => {
                     try {
                       const result = await FilePicker.pickFiles({
                         types: ['*/*'], 
                       });
                       const file = result.files[0];
                       if (file && file.path) {
                         setLocalModelPath(file.path);
                         alert(`Modell vald:\n${file.name}`);
                       } else {
                         alert("Kunde inte hämta sökvägen till filen. Försök flytta den till din vanliga Download-mapp.");
                       }
                     } catch (error) {
                       console.log("Användaren avbröt eller ett fel uppstod:", error);
                     }
                   }}
                   className="bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-sm hover:bg-indigo-700 w-full text-sm font-bold flex items-center justify-center gap-2"
                 >
                   <FolderOpen size={18} /> Bläddra och välj modellfil...
                 </button>
                 
                 {localModelPath && (
                   <div className="text-[10px] text-gray-500 break-all bg-gray-50 p-3 rounded-xl border border-gray-200 font-mono">
                     <strong>Vald fil:</strong><br/>
                     {localModelPath}
                   </div>
                 )}
               </div>
               {!localModelPath && (
                 <p className="text-[10px] text-amber-500 mt-1 font-medium">
                   Du måste ange en modell för att kunna använda lokal sammanfattning.
                 </p>
               )}
             </div>
          )}
        </div>

        {/* PROMPTS */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2"><PenTool size={16} /> Dagboks-instruktioner</h3>
            <button onClick={handleResetPrompt} className="text-gray-400 hover:text-indigo-500"><RotateCcw size={12} /></button>
          </div>
          <p className="text-xs text-gray-500 font-medium">Bestäm hur AI:n ska bete sig när den sammanfattar din dag.</p>
          <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} className="w-full h-32 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none leading-relaxed" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2"><MessageSquare size={16} /> Fråge-instruktioner</h3>
            <button onClick={handleResetQuestionsPrompt} className="text-gray-400 hover:text-indigo-500"><RotateCcw size={12} /></button>
          </div>
          <p className="text-xs text-gray-500 font-medium">Bestäm hur AI:n ska ställa fördjupande frågor till dig.</p>
          <textarea value={customQuestionsPrompt} onChange={e => setCustomQuestionsPrompt(e.target.value)} className="w-full h-32 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none leading-relaxed" />
        </div>
      </div>

      <div className="fixed bottom-24 left-0 right-0 px-6 z-40">
        <button onClick={handleSave} className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.98] transition-all">
          <Save size={20} /> Spara inställningar
        </button>
      </div>
    </div>
  );
};
