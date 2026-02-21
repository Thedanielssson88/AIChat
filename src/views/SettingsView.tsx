import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Key, RotateCcw, PenTool, MessageSquare } from 'lucide-react';
import { DEFAULT_DIARY_PROMPT, DEFAULT_QUESTIONS_PROMPT } from '../services/geminiService'; // Se till att båda är importerade
import clsx from 'clsx';

export const SettingsView = () => {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('flash');
  const [transcriptionMode, setTranscriptionMode] = useState('api'); // 'api' | 'local'
  const [summaryMode, setSummaryMode] = useState('api'); // 'api' | 'local'
  
  // States för prompts
  const [customPrompt, setCustomPrompt] = useState('');
  const [customQuestionsPrompt, setCustomQuestionsPrompt] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('GEMINI_API_KEY') || '');
    setModel(localStorage.getItem('GEMINI_MODEL') || 'flash');
    setTranscriptionMode(localStorage.getItem('TRANSCRIPTION_MODE') || 'api');
    setSummaryMode(localStorage.getItem('SUMMARY_MODE') || 'api');
    setCustomPrompt(localStorage.getItem('GEMINI_PROMPT') || DEFAULT_DIARY_PROMPT);
    setCustomQuestionsPrompt(localStorage.getItem('GEMINI_QUESTIONS_PROMPT') || DEFAULT_QUESTIONS_PROMPT);
  }, []);

  const handleSave = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
    localStorage.setItem('GEMINI_MODEL', model);
    localStorage.setItem('TRANSCRIPTION_MODE', transcriptionMode);
    localStorage.setItem('SUMMARY_MODE', summaryMode);
    localStorage.setItem('GEMINI_PROMPT', customPrompt.trim());
    localStorage.setItem('GEMINI_QUESTIONS_PROMPT', customQuestionsPrompt.trim());
    alert('Dina inställningar har sparats!');
    navigate(-1);
  };

  const handleResetPrompt = () => {
    if (window.confirm('Är du säker på att du vill återställa sammanfattnings-instruktionerna till standard?')) {
      setCustomPrompt(DEFAULT_DIARY_PROMPT);
    }
  };

  const handleResetQuestionsPrompt = () => {
    if (window.confirm('Är du säker på att du vill återställa fråge-instruktionerna till standard?')) {
      setCustomQuestionsPrompt(DEFAULT_QUESTIONS_PROMPT);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32 relative">
      <div className="bg-white p-6 pb-6 shadow-sm sticky top-0 z-10">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => navigate(-1)} className="p-2 bg-gray-100 rounded-full text-gray-600">
            <ArrowLeft size={20} />
          </button>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">Inställningar</h1>
      </div>

      <div className="p-4 space-y-6">
        
        {/* API OCH MODELL */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Key size={16} /> AI-Motor
          </h3>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Gemini API-nyckel</label>
            <input 
              type="password" 
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              placeholder="AIzaSy..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

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

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Bearbetnings-läge</label>
            <div className="space-y-4">
              {/* Transkribering */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-sm font-medium text-gray-700">Transkribering</span>
                <div className="flex bg-gray-200 rounded-lg p-1 w-32">
                  <button 
                    onClick={() => setTranscriptionMode('api')}
                    className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", transcriptionMode === 'api' ? "bg-white shadow-sm" : "text-gray-500")}
                  >API</button>
                  <button 
                    onClick={() => setTranscriptionMode('local')}
                    className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", transcriptionMode === 'local' ? "bg-white shadow-sm" : "text-gray-500")}
                  >LOKAL</button>
                </div>
              </div>

              {/* Sammanfattning */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-sm font-medium text-gray-700">Sammanfattning</span>
                <div className="flex bg-gray-200 rounded-lg p-1 w-32">
                  <button 
                    onClick={() => setSummaryMode('api')}
                    className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", summaryMode === 'api' ? "bg-white shadow-sm" : "text-gray-500")}
                  >API</button>
                  <button 
                    onClick={() => setSummaryMode('local')}
                    className={clsx("flex-1 text-[10px] font-bold py-1 rounded-md transition-all", summaryMode === 'local' ? "bg-white shadow-sm" : "text-gray-500")}
                  >LOKAL</button>
                </div>
              </div>
            </div>
            { (transcriptionMode === 'local' || summaryMode === 'local') && (
              <p className="mt-2 text-[10px] text-indigo-500 font-medium italic">
                * Lokal bearbetning kräver en enhet med stöd för Gemini Nano (t.ex. Pixel 9 Pro).
              </p>
            )}
          </div>
        </div>

        {/* AI INSTRUKTIONER (SAMMANFATTNING) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <PenTool size={16} /> Dagboks-instruktioner
            </h3>
            <button onClick={handleResetPrompt} className="text-xs font-bold text-gray-400 hover:text-indigo-500 flex items-center gap-1 transition-colors">
              <RotateCcw size={12} /> Återställ
            </button>
          </div>
          <p className="text-xs text-gray-500 font-medium">Bestäm hur AI:n ska bete sig när den sammanfattar din dag.</p>
          <textarea 
            value={customPrompt} 
            onChange={e => setCustomPrompt(e.target.value)} 
            className="w-full h-40 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none leading-relaxed"
          />
        </div>

        {/* AI INSTRUKTIONER (FRÅGOR & SVAR) */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <MessageSquare size={16} /> Fråge-instruktioner
            </h3>
            <button onClick={handleResetQuestionsPrompt} className="text-xs font-bold text-gray-400 hover:text-indigo-500 flex items-center gap-1 transition-colors">
              <RotateCcw size={12} /> Återställ
            </button>
          </div>
          <p className="text-xs text-gray-500 font-medium">Bestäm hur AI:n ska ställa fördjupande frågor till dig.</p>
          <textarea 
            value={customQuestionsPrompt} 
            onChange={e => setCustomQuestionsPrompt(e.target.value)} 
            className="w-full h-32 bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none leading-relaxed"
          />
        </div>

      </div>

      {/* SPARA-KNAPP */}
      <div className="fixed bottom-24 left-0 right-0 px-6 z-40">
        <button 
          onClick={handleSave}
          className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.98] transition-all"
        >
          <Save size={20} /> Spara inställningar
        </button>
      </div>

    </div>
  );
};
