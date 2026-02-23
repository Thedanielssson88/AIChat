import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Key, Cpu, Server } from 'lucide-react';
import { clsx } from 'clsx';

export const SettingsView = () => {
  const navigate = useNavigate();

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('flash');
  const [transcriptionMode, setTranscriptionMode] = useState('api');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('sv');
  const [summaryMode, setSummaryMode] = useState('api');
  const [llmUrl, setLlmUrl] = useState('');
  const [whisperUrl, setWhisperUrl] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('GEMINI_API_KEY') || '');
    setModel(localStorage.getItem('GEMINI_MODEL') || 'flash');
    setTranscriptionMode(localStorage.getItem('TRANSCRIPTION_MODE') || 'api');
    setTranscriptionLanguage(localStorage.getItem('TRANSCRIPTION_LANG') || 'sv');
    setSummaryMode(localStorage.getItem('SUMMARY_MODE') || 'api');
    setLlmUrl(localStorage.getItem('LLM_SERVER_URL') || '');
    setWhisperUrl(localStorage.getItem('WHISPER_SERVER_URL') || '');
  }, []);

  const handleSave = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    localStorage.setItem('GEMINI_MODEL', model);
    localStorage.setItem('TRANSCRIPTION_MODE', transcriptionMode);
    localStorage.setItem('TRANSCRIPTION_LANG', transcriptionLanguage);
    localStorage.setItem('SUMMARY_MODE', summaryMode);
    localStorage.setItem('LLM_SERVER_URL', llmUrl);
    localStorage.setItem('WHISPER_SERVER_URL', whisperUrl);
    alert('Inställningar sparade!');
    navigate(-1);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
    <div className="px-6 pt-12 pb-4 bg-white shadow-sm flex items-center justify-between z-10 sticky top-0">
    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 transition-colors"><ArrowLeft size={24} /></button>
    <h1 className="text-xl font-extrabold text-gray-900">App-inställningar</h1>
    <div className="w-8" />
    </div>

    <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">

    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Key size={16} /> Moln-AI (Gemini API)</h3>
    <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API-nyckel" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
    <div className="flex bg-gray-100 p-1 rounded-xl">
    <button onClick={() => setModel('flash')} className={clsx("flex-1 py-2 text-xs font-bold rounded-lg transition-all", model === 'flash' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>1.5 Flash (Snabb)</button>
    <button onClick={() => setModel('pro')} className={clsx("flex-1 py-2 text-xs font-bold rounded-lg transition-all", model === 'pro' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>1.5 Pro (Smart)</button>
    </div>
    </div>

    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Cpu size={16} /> Motor & Tilldelning</h3>

    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
    <span className="text-sm font-medium text-gray-700">Transkribering</span>
    <div className="flex flex-wrap bg-gray-200 rounded-lg p-1 gap-1">
    <button onClick={() => setTranscriptionMode('api')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", transcriptionMode === 'api' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>API</button>
    <button onClick={() => setTranscriptionMode('local')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", transcriptionMode === 'local' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LOKAL LIVE</button>
    <button onClick={() => setTranscriptionMode('lmstudio')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", transcriptionMode === 'lmstudio' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>WHISPER</button>
    </div>

    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 mt-2">
    <span className="text-sm font-medium text-gray-700">Språk (Whisper/API)</span>
    <select value={transcriptionLanguage} onChange={(e) => setTranscriptionLanguage(e.target.value)} className="bg-gray-50 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2">
    <option value="sv">Svenska</option>
    <option value="en">Engelska</option>
    <option value="">Auto-detect</option>
    </select>
    </div>
    </div>

    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
    <span className="text-sm font-medium text-gray-700">Chatt-motor</span>
    <div className="flex flex-wrap bg-gray-200 rounded-lg p-1 gap-1">
    <button onClick={() => setSummaryMode('api')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", summaryMode === 'api' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>API</button>
    <button onClick={() => setSummaryMode('lmstudio')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", summaryMode === 'lmstudio' ? "bg-white shadow-sm text-indigo-600" : "text-gray-500")}>LM STUDIO</button>
    </div>
    </div>
    </div>

    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Server size={16} /> Server-URL:er</h3>
    <input type="text" value={whisperUrl} onChange={e => setWhisperUrl(e.target.value)} placeholder="Whisper URL (t.ex. http://ip:8888/v1/audio/transcriptions)" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
    <input type="text" value={llmUrl} onChange={e => setLlmUrl(e.target.value)} placeholder="LM Studio URL (t.ex. http://ip:1234/v1)" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
    </div>

    </div>

    <div className="fixed bottom-24 left-0 right-0 px-6 z-40">
    <button onClick={handleSave} className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
    <Save size={20} /> Spara alla inställningar
    </button>
    </div>
    </div>
  );
};
