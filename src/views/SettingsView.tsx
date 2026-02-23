import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Key, RotateCcw, PenTool, MessageSquare, Cpu, FolderOpen, Server, Sliders } from 'lucide-react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { registerPlugin } from '@capacitor/core';
import { DEFAULT_DIARY_PROMPT, DEFAULT_QUESTIONS_PROMPT } from '../services/geminiService';
import { clsx } from 'clsx';

const GeminiNano = registerPlugin<any>('GeminiNano');

export const SettingsView = () => {
  const navigate = useNavigate();
  
  // Moln AI
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('flash');
  
  // Användar-prompts (Generella)
  const [customPrompt, setCustomPrompt] = useState('');
  const [customQuestionsPrompt, setCustomQuestionsPrompt] = useState('');
  
  // Motorer
  const [transcriptionMode, setTranscriptionMode] = useState('api'); // 'api' | 'local' | 'lmstudio'
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('sv');
  const [summaryMode, setSummaryMode] = useState('api'); // 'api' | 'local' | 'nano' | 'lmstudio'
  const [localModelPath, setLocalModelPath] = useState('');
  
  // Nya server-URL:er
  const [llmUrl, setLlmUrl] = useState('http://192.168.1.xxx:1234/v1');
  const [whisperUrl, setWhisperUrl] = useState('http://192.168.1.xxx:8080/v1');
  
  // --- NYA INSTÄLLNINGAR FÖR PARAMETRAR ---
  const [tempTranscribe, setTempTranscribe] = useState(0.0);
  const [tempSummary, setTempSummary] = useState(0.3);
  const [tempQuestions, setTempQuestions] = useState(0.7);
  const [maxTokensSummary, setMaxTokensSummary] = useState(1500);
  const [maxTokensQuestions, setMaxTokensQuestions] = useState(500);

  // --- NYA INSTÄLLNINGAR FÖR LM STUDIO SYSTEM PROMPTS ---
  const [sysTranscribe, setSysTranscribe] = useState('Transkribera talet exakt som det sägs på svenska.');
  const [sysSummary, setSysSummary] = useState('Du är en backend-server. Du får ALDRIG skriva vanlig text eller markdown. Du får ENDAST svara med rå, giltig JSON-kod.');
  const [sysQuestions, setSysQuestions] = useState('Du är en backend-server. Du får ALDRIG skriva vanlig text eller markdown. Du får ENDAST svara med rå, giltig JSON-kod.');

  useEffect(() => {
    setApiKey(localStorage.getItem('GEMINI_API_KEY') || '');
    setModel(localStorage.getItem('GEMINI_MODEL') || 'flash');
    setCustomPrompt(localStorage.getItem('GEMINI_PROMPT') || DEFAULT_DIARY_PROMPT);
    setCustomQuestionsPrompt(localStorage.getItem('GEMINI_QUESTIONS_PROMPT') || DEFAULT_QUESTIONS_PROMPT);
    
    setTranscriptionMode(localStorage.getItem('TRANSCRIPTION_MODE') || 'api');
    setTranscriptionLanguage(localStorage.getItem('TRANSCRIPTION_LANG') || 'sv');
    setSummaryMode(localStorage.getItem('SUMMARY_MODE') || 'api');
    setLocalModelPath(localStorage.getItem('LOCAL_MODEL_PATH') || '');
    
    // Hämta nya URL:er
    setLlmUrl(localStorage.getItem('LLM_SERVER_URL') || 'http://192.168.1.xxx:1234/v1');
    setWhisperUrl(localStorage.getItem('WHISPER_SERVER_URL') || 'http://192.168.1.xxx:8080/v1');

    // Hämta parametrar
    setTempTranscribe(Number(localStorage.getItem('TEMP_TRANSCRIBE') || 0.0));
    setTempSummary(Number(localStorage.getItem('TEMP_SUMMARY') || 0.3));
    setTempQuestions(Number(localStorage.getItem('TEMP_QUESTIONS') || 0.7));
    setMaxTokensSummary(Number(localStorage.getItem('MAX_TOKENS_SUMMARY') || 1500));
    setMaxTokensQuestions(Number(localStorage.getItem('MAX_TOKENS_QUESTIONS') || 500));

    // Hämta LM Studio System prompts
    setSysTranscribe(localStorage.getItem('LM_SYS_TRANSCRIBE') || 'Transkribera talet exakt som det sägs på svenska.');
    setSysSummary(localStorage.getItem('LM_SYS_SUMMARY') || 'Du är en backend-server. Du får ALDRIG skriva vanlig text eller markdown. Du får ENDAST svara med rå, giltig JSON-kod.');
    setSysQuestions(localStorage.getItem('LM_SYS_QUESTIONS') || 'Du är en backend-server. Du får ALDRIG skriva vanlig text eller markdown. Du får ENDAST svara med rå, giltig JSON-kod.');
  }, []);

  const handleSave = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
    localStorage.setItem('GEMINI_MODEL', model);
    localStorage.setItem('GEMINI_PROMPT', customPrompt.trim());
    localStorage.setItem('GEMINI_QUESTIONS_PROMPT', customQuestionsPrompt.trim());
    
    localStorage.setItem('TRANSCRIPTION_MODE', transcriptionMode);
    localStorage.setItem('TRANSCRIPTION_LANG', transcriptionLanguage);
    localStorage.setItem('SUMMARY_MODE', summaryMode);
    localStorage.setItem('LOCAL_MODEL_PATH', localModelPath.trim());
    
    // Spara nya URL:er
    localStorage.setItem('LLM_SERVER_URL', llmUrl.trim());
    localStorage.setItem('WHISPER_SERVER_URL', whisperUrl.trim());

    // Spara parametrar
    localStorage.setItem('TEMP_TRANSCRIBE', tempTranscribe.toString());
    localStorage.setItem('TEMP_SUMMARY', tempSummary.toString());
    localStorage.setItem('TEMP_QUESTIONS', tempQuestions.toString());
    localStorage.setItem('MAX_TOKENS_SUMMARY', maxTokensSummary.toString());
    localStorage.setItem('MAX_TOKENS_QUESTIONS', maxTokensQuestions.toString());

    // Spara LM Studio System prompts
    localStorage.setItem('LM_SYS_TRANSCRIBE', sysTranscribe.trim());
    localStorage.setItem('LM_SYS_SUMMARY', sysSummary.trim());
    localStorage.setItem('LM_SYS_QUESTIONS', sysQuestions.trim());
    
    alert('Dina inställningar har sparats!');
    navigate(-1);
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
        
        {/* BEARBETNING & MOTOR */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Cpu size={16} /> Motor & Tilldelning
          </h3>
          
          <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-sm font-medium text-gray-700">Transkribering</span>
            <div className="flex bg-gray-200 rounded-lg p-1 gap-1">
              <button onClick={() => setTranscriptionMode('api')} className={clsx("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", transcriptionMode === 'api' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>API</button>
              <button onClick={() => setTranscriptionMode('local')} className={clsx("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", transcriptionMode === 'local' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LOKAL LIVE</button>
              <button onClick={() => setTranscriptionMode('lmstudio')} className={clsx("flex-1 text-[10px] font-bold py-2 rounded-md transition-all", transcriptionMode === 'lmstudio' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LM STUDIO</button>
            </div>
          </div>

          {/* SPRÅKVAL FÖR TRANSKRIBERING */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-sm font-medium text-gray-700">Språk (Whisper/AI)</span>
            <select 
              value={transcriptionLanguage}
              onChange={(e) => setTranscriptionLanguage(e.target.value)}
              className="bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2"
            >
              <option value="sv">Svenska</option>
              <option value="en">Engelska</option>
              <option value="">Auto-detect</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="text-sm font-medium text-gray-700">Sammanfattning & Frågor</span>
            <div className="flex flex-wrap bg-gray-200 rounded-lg p-1 gap-1">
              <button onClick={() => setSummaryMode('api')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", summaryMode === 'api' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>API</button>
              <button onClick={() => setSummaryMode('local')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", summaryMode === 'local' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LLAMA</button>
              <button onClick={() => setSummaryMode('nano')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", summaryMode === 'nano' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>NANO</button>
              <button onClick={() => setSummaryMode('lmstudio')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", summaryMode === 'lmstudio' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LM STUDIO</button>
            </div>
          </div>
        </div>

        {/* LOKALA AI SERVRAR (SYNS BARA OM VALT) */}
        {(summaryMode === 'lmstudio' || transcriptionMode === 'lmstudio') && (
          <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <Server size={16} /> Lokala Servrar (LM Studio / Whisper)
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-indigo-800 uppercase">URL till Text-AI (LM Studio)</label>
                <input 
                  type="text" 
                  value={llmUrl} 
                  onChange={e => setLlmUrl(e.target.value)} 
                  placeholder="http://192.168.1.xxx:1234/v1" 
                  className="w-full bg-white border border-indigo-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none" 
                />
                <p className="text-[9px] text-indigo-400 mt-1">Används för Sammanfattning och Frågor.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-indigo-800 uppercase">URL till Ljud-AI (Whisper)</label>
                <input 
                  type="text" 
                  value={whisperUrl} 
                  onChange={e => setWhisperUrl(e.target.value)} 
                  placeholder="http://192.168.1.xxx:8080/v1" 
                  className="w-full bg-white border border-indigo-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none" 
                />
                <p className="text-[9px] text-indigo-400 mt-1">Används för Transkribering.</p>
              </div>
            </div>

            <p className="text-[10px] text-indigo-700 font-medium">Nedan är System Instructions. Dessa skickas osynligt till motorn för att styra format och uppförande.</p>

            {transcriptionMode === 'lmstudio' && (
              <div>
                <label className="text-xs font-bold text-indigo-900 mb-1 block">System Instruction: Transkribering</label>
                <textarea value={sysTranscribe} onChange={e => setSysTranscribe(e.target.value)} className="w-full text-xs p-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white" rows={2} />
              </div>
            )}
            
            {summaryMode === 'lmstudio' && (
              <>
                <div>
                  <label className="text-xs font-bold text-indigo-900 mb-1 block">System Instruction: Sammanfattning</label>
                  <textarea value={sysSummary} onChange={e => setSysSummary(e.target.value)} className="w-full text-xs p-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white" rows={3} />
                </div>
                <div>
                  <label className="text-xs font-bold text-indigo-900 mb-1 block">System Instruction: Frågor & Svar</label>
                  <textarea value={sysQuestions} onChange={e => setSysQuestions(e.target.value)} className="w-full text-xs p-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-400 bg-white" rows={3} />
                </div>
              </>
            )}
          </div>
        )}

        {/* MODELLPARAMETRAR (SYNS ALLTID, PÅVERKAR ALLA MOTORER UTOM NANO) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Sliders size={16} /> Genererings-Parametrar
          </h3>
          
          <div className="space-y-6">
            <div>
              <label className="text-xs font-bold text-gray-700 flex justify-between mb-2">
                Temp: Transkribering <span className="text-indigo-600">{tempTranscribe}</span>
              </label>
              <input type="range" min="0" max="1" step="0.1" value={tempTranscribe} onChange={(e) => setTempTranscribe(Number(e.target.value))} className="w-full accent-indigo-600" />
              <p className="text-[9px] text-gray-400 mt-1">Lägre = Mer exakt. Högre = Mer kreativ. Rekommenderas: 0.0</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 flex justify-between mb-2">
                Temp: Sammanfattning <span className="text-indigo-600">{tempSummary}</span>
              </label>
              <input type="range" min="0" max="2" step="0.1" value={tempSummary} onChange={(e) => setTempSummary(Number(e.target.value))} className="w-full accent-indigo-600" />
              
              <label className="text-xs font-bold text-gray-700 flex justify-between mt-4 mb-2">
                Max ord (Tokens): Sammanfattning <span className="text-indigo-600">{maxTokensSummary}</span>
              </label>
              <input type="range" min="500" max="4000" step="100" value={maxTokensSummary} onChange={(e) => setMaxTokensSummary(Number(e.target.value))} className="w-full accent-indigo-600" />
            </div>

            <div className="pt-4 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 flex justify-between mb-2">
                Temp: Frågor <span className="text-indigo-600">{tempQuestions}</span>
              </label>
              <input type="range" min="0" max="2" step="0.1" value={tempQuestions} onChange={(e) => setTempQuestions(Number(e.target.value))} className="w-full accent-indigo-600" />
              
              <label className="text-xs font-bold text-gray-700 flex justify-between mt-4 mb-2">
                Max ord (Tokens): Frågor <span className="text-indigo-600">{maxTokensQuestions}</span>
              </label>
              <input type="range" min="100" max="2000" step="50" value={maxTokensQuestions} onChange={(e) => setMaxTokensQuestions(Number(e.target.value))} className="w-full accent-indigo-600" />
            </div>
          </div>
        </div>

        {/* ANVÄNDAR-PROMPTS */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2"><PenTool size={16} /> Dagboks-instruktioner</h3>
            <button onClick={() => setCustomPrompt(DEFAULT_DIARY_PROMPT)} className="text-gray-400 hover:text-indigo-500"><RotateCcw size={12} /></button>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">Bestämmer vad AI:n ska fokusera på när den sammanfattar (skickas som "User Prompt").</p>
          <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} className="w-full h-32 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900 focus:ring-2 focus:ring-indigo-400" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2"><MessageSquare size={16} /> Fråge-instruktioner</h3>
            <button onClick={() => setCustomQuestionsPrompt(DEFAULT_QUESTIONS_PROMPT)} className="text-gray-400 hover:text-indigo-500"><RotateCcw size={12} /></button>
          </div>
          <textarea value={customQuestionsPrompt} onChange={e => setCustomQuestionsPrompt(e.target.value)} className="w-full h-32 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900 focus:ring-2 focus:ring-indigo-400" />
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
