import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Key, Cpu, Server, ShieldAlert, ToggleLeft, ToggleRight, Folder, Plus, Trash2, Mic, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';

export const SettingsView = () => {
  const navigate = useNavigate();

  // Befintliga inställningar
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('flash');
  const [transcriptionMode, setTranscriptionMode] = useState('api');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('sv');
  const [summaryMode, setSummaryMode] = useState('api');
  const [llmUrl, setLlmUrl] = useState('');
  const [whisperUrl, setWhisperUrl] = useState('');

  // -- NYHET: TTS Inställningar --
  const [ttsMode, setTtsMode] = useState('local'); // 'api' eller 'local'
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [ttsVoice, setTtsVoice] = useState('onyx');

  // Nano Agent-inställningar
  const [nanoServerUrl, setNanoServerUrl] = useState('');
  const [nanoApiKey, setNanoApiKey] = useState('');
  const [nanoHumanInLoop, setNanoHumanInLoop] = useState(true);
  const [nanoAllowFiles, setNanoAllowFiles] = useState(false);
  const [nanoMaxBudget, setNanoMaxBudget] = useState('5.00');
  const [nanoModel, setNanoModel] = useState('claude');

  // Mapp-inställningar
  const [nanoExtraMounts, setNanoExtraMounts] = useState<{path: string; enabled: boolean}[]>([]);
  const [newMount, setNewMount] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('GEMINI_API_KEY') || '');
    setModel(localStorage.getItem('GEMINI_MODEL') || 'flash');
    setTranscriptionMode(localStorage.getItem('TRANSCRIPTION_MODE') || 'api');
    setTranscriptionLanguage(localStorage.getItem('TRANSCRIPTION_LANG') || 'sv');
    setSummaryMode(localStorage.getItem('SUMMARY_MODE') || 'api');
    setLlmUrl(localStorage.getItem('LLM_SERVER_URL') || '');
    setWhisperUrl(localStorage.getItem('WHISPER_SERVER_URL') || '');

    // TTS
    setTtsMode(localStorage.getItem('TTS_MODE') || 'local');
    setOpenAIApiKey(localStorage.getItem('OPENAI_API_KEY') || '');
    setTtsVoice(localStorage.getItem('TTS_VOICE') || 'onyx');

    // Nano
    setNanoServerUrl(localStorage.getItem('NANO_SERVER_URL') || '');
    setNanoApiKey(localStorage.getItem('NANO_API_KEY') || '');
    setNanoHumanInLoop(localStorage.getItem('NANO_HUMAN_IN_LOOP') !== 'false');
    setNanoAllowFiles(localStorage.getItem('NANO_ALLOW_FILES') === 'true');
    setNanoMaxBudget(localStorage.getItem('NANO_MAX_BUDGET') || '5.00');
    setNanoModel(localStorage.getItem('NANO_MODEL') || 'claude');

    const savedMounts = localStorage.getItem('NANO_MOUNTS');
    if (savedMounts) {
      try { setNanoExtraMounts(JSON.parse(savedMounts)); } catch (e) {}
    }
  }, []);

  const handleSave = async () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    localStorage.setItem('GEMINI_MODEL', model);
    localStorage.setItem('TRANSCRIPTION_MODE', transcriptionMode);
    localStorage.setItem('TRANSCRIPTION_LANG', transcriptionLanguage);
    localStorage.setItem('SUMMARY_MODE', summaryMode);
    localStorage.setItem('LLM_SERVER_URL', llmUrl);
    localStorage.setItem('WHISPER_SERVER_URL', whisperUrl);

    // Spara TTS
    localStorage.setItem('TTS_MODE', ttsMode);
    localStorage.setItem('OPENAI_API_KEY', openAIApiKey);
    localStorage.setItem('TTS_VOICE', ttsVoice);

    localStorage.setItem('NANO_SERVER_URL', nanoServerUrl);
    localStorage.setItem('NANO_API_KEY', nanoApiKey);
    localStorage.setItem('NANO_HUMAN_IN_LOOP', nanoHumanInLoop.toString());
    localStorage.setItem('NANO_ALLOW_FILES', nanoAllowFiles.toString());
    localStorage.setItem('NANO_MAX_BUDGET', nanoMaxBudget);
    localStorage.setItem('NANO_MODEL', nanoModel);
    localStorage.setItem('NANO_MOUNTS', JSON.stringify(nanoExtraMounts));

    const url = nanoServerUrl || localStorage.getItem('NANO_SERVER_URL');
    if (url) {
      try {
        const enabledPaths = nanoExtraMounts.filter(m => m.enabled).map(m => m.path);
        await fetch(`${url}/api/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extraMounts: enabledPaths })
        });
      } catch (err) {}
    }

    alert('Inställningar sparade!');
    navigate(-1);
  };

  const handleAddMount = () => {
    if (newMount && !nanoExtraMounts.some(m => m.path === newMount)) {
      setNanoExtraMounts([...nanoExtraMounts, { path: newMount, enabled: true }]);
      setNewMount('');
    }
  };

  const handleRemoveMount = (index: number) => {
    setNanoExtraMounts(nanoExtraMounts.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
    <div className="px-6 pt-12 pb-4 bg-white shadow-sm flex items-center justify-between z-10 sticky top-0">
    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 transition-colors"><ArrowLeft size={24} /></button>
    <h1 className="text-xl font-extrabold text-gray-900">App-inställningar</h1>
    <div className="w-8" />
    </div>

    <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">

    {/* Ljud & Transkribering Omgjord */}
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Mic size={16} /> Ljud & Språk</h3>

    {/* -- INMATNING (Speech to text) -- */}
    <div className="flex flex-col gap-2 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
    <span className="text-sm font-bold text-indigo-900 flex items-center gap-2"><Mic size={16} /> Transkribering (Lyssna)</span>

    <div className="flex flex-wrap bg-white rounded-lg p-1 gap-1 border border-indigo-100 mt-2">
    <button onClick={() => setTranscriptionMode('api')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", transcriptionMode === 'api' ? "bg-indigo-600 shadow-sm text-white" : "text-gray-500 hover:bg-gray-50")}>API</button>
    <button onClick={() => setTranscriptionMode('local')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", transcriptionMode === 'local' ? "bg-indigo-600 shadow-sm text-white" : "text-gray-500 hover:bg-gray-50")}>LOKAL LIVE</button>
    <button onClick={() => setTranscriptionMode('lmstudio')} className={clsx("flex-1 text-[10px] font-bold py-2 px-1 rounded-md transition-all min-w-[65px]", transcriptionMode === 'lmstudio' ? "bg-indigo-600 shadow-sm text-white" : "text-gray-500 hover:bg-gray-50")}>WHISPER</button>
    </div>

    <div className="flex items-center justify-between mt-3 bg-white p-2 rounded-lg border border-indigo-50">
    <div>
    <span className="text-xs font-bold text-gray-800 block">Löpande samtal</span>
    <span className="text-[10px] text-gray-500">Skicka vid paus & lyssna igen</span>
    </div>
    <button onClick={() => {
      const current = localStorage.getItem('AUTO_SEND_AUDIO') === 'true';
      localStorage.setItem('AUTO_SEND_AUDIO', (!current).toString());
    }} className="text-indigo-600">
    {localStorage.getItem('AUTO_SEND_AUDIO') === 'true' ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-gray-400" />}
    </button>
    </div>

    <div className="flex items-center justify-between mt-2">
    <span className="text-xs font-bold text-gray-700">Språk</span>
    <select value={transcriptionLanguage} onChange={(e) => setTranscriptionLanguage(e.target.value)} className="bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2">
    <option value="sv">Svenska</option>
    <option value="en">Engelska</option>
    <option value="">Auto-detect</option>
    </select>
    </div>
    </div>

    {/* -- UTMATNING (Text to speech) -- */}
    <div className="flex flex-col gap-2 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
    <span className="text-sm font-bold text-emerald-900 flex items-center gap-2"><Volume2 size={16} /> Uppläsning (Prata)</span>

    <div className="flex bg-white rounded-lg p-1 gap-1 border border-emerald-100 mt-2">
    <button onClick={() => setTtsMode('local')} className={clsx("flex-1 text-[11px] font-bold py-2 px-1 rounded-md transition-all", ttsMode === 'local' ? "bg-emerald-600 shadow-sm text-white" : "text-gray-500 hover:bg-gray-50")}>LOKAL LIVE (Android/iOS)</button>
    <button onClick={() => setTtsMode('api')} className={clsx("flex-1 text-[11px] font-bold py-2 px-1 rounded-md transition-all", ttsMode === 'api' ? "bg-emerald-600 shadow-sm text-white" : "text-gray-500 hover:bg-gray-50")}>API (OpenAI)</button>
    </div>

    {ttsMode === 'api' && (
      <div className="space-y-3 mt-3 p-3 bg-white rounded-lg border border-emerald-50 animate-in fade-in slide-in-from-top-2">
      <div>
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">OpenAI API-nyckel</label>
      <input
      type="password"
      value={openAIApiKey}
      onChange={e => setOpenAIApiKey(e.target.value)}
      placeholder="sk-..."
      className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-emerald-400"
      />
      </div>
      <div>
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Röst</label>
      <select
      value={ttsVoice}
      onChange={e => setTtsVoice(e.target.value)}
      className="w-full bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg focus:ring-2 focus:ring-emerald-400 p-2.5"
      >
      <option value="alloy">Alloy</option>
      <option value="echo">Echo</option>
      <option value="fable">Fable</option>
      <option value="onyx">Onyx (Rekommenderas)</option>
      <option value="nova">Nova</option>
      <option value="shimmer">Shimmer</option>
      </select>
      </div>
      </div>
    )}

    {ttsMode === 'local' && (
      <div className="mt-3 p-3 bg-white rounded-lg border border-emerald-50 animate-in fade-in text-xs text-gray-500">
      Använder telefonens inbyggda röst. Perfekt för offline-användning och extremt snabbt! Följer språket du valt ovan.
      </div>
    )}
    </div>

    </div>

    {/* RESTEN AV INSTÄLLNINGARNA */}
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Key size={16} /> Moln-AI (Gemini API)</h3>
    <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API-nyckel" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
    <div className="flex bg-gray-100 p-1 rounded-xl">
    <button onClick={() => setModel('flash')} className={clsx("flex-1 py-2 text-xs font-bold rounded-lg transition-all", model === 'flash' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>1.5 Flash (Snabb)</button>
    <button onClick={() => setModel('pro')} className={clsx("flex-1 py-2 text-xs font-bold rounded-lg transition-all", model === 'pro' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>1.5 Pro (Smart)</button>
    </div>
    </div>

    {/* NANO AGENT */}
    <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-6 relative overflow-hidden">
    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100 rounded-full blur-3xl -mr-16 -mt-16 opacity-50"></div>

    <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2 relative z-10">
    <ShieldAlert size={16} /> Autonom Agent (NanoClaw)
    </h3>

    <div className="space-y-4 relative z-10">

    <div className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-indigo-100">
    <span className="text-xs font-bold text-gray-800 ml-1">Välj Agent-Motor</span>
    <div className="flex bg-indigo-50 p-1 rounded-lg">
    <button onClick={() => setNanoModel('claude')} className={clsx("flex-1 py-2 px-1 text-xs font-bold rounded-md transition-all", nanoModel === 'claude' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>Claude 3.5</button>
    <button onClick={() => setNanoModel('gemini')} className={clsx("flex-1 py-2 px-1 text-xs font-bold rounded-md transition-all", nanoModel === 'gemini' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>Gemini</button>
    <button onClick={() => setNanoModel('lmstudio')} className={clsx("flex-1 py-2 px-1 text-xs font-bold rounded-md transition-all", nanoModel === 'lmstudio' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}>LM Studio</button>
    </div>
    </div>

    {nanoModel === 'lmstudio' && (
      <div className="space-y-2 p-3 bg-white rounded-xl border border-indigo-100">
      <label className="text-xs font-bold text-gray-500 uppercase">LM Studio URL</label>
      <input
      type="text"
      defaultValue={localStorage.getItem('LM_STUDIO_URL') || 'http://localhost:1234'}
        onBlur={(e) => localStorage.setItem('LM_STUDIO_URL', e.target.value)}
        placeholder="http://localhost:1234"
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-400"
        />
        <label className="text-xs font-bold text-gray-500 uppercase mt-2 block">Modell-ID</label>
        <input
        type="text"
        defaultValue={localStorage.getItem('LM_STUDIO_MODEL') || ''}
        onBlur={(e) => localStorage.setItem('LM_STUDIO_MODEL', e.target.value)}
        placeholder="t.ex. llama-3-8b-instruct"
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-400"
        />
        </div>
    )}

    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-indigo-50">
    <div>
    <span className="text-sm font-bold text-gray-800 block">Godkännande (Human in the loop)</span>
    <span className="text-xs text-gray-500">Kräv ok innan destruktiva actions</span>
    </div>
    <button onClick={() => setNanoHumanInLoop(!nanoHumanInLoop)} className="text-indigo-600">
    {nanoHumanInLoop ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="text-gray-400" />}
    </button>
    </div>

    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-indigo-50">
    <div>
    <span className="text-sm font-bold text-gray-800 block">Filsystemsåtkomst</span>
    <span className="text-xs text-gray-500">Låt Nano läsa/skriva lokala filer</span>
    </div>
    <button onClick={() => setNanoAllowFiles(!nanoAllowFiles)} className="text-indigo-600">
    {nanoAllowFiles ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="text-gray-400" />}
    </button>
    </div>

    <div>
    <label className="text-xs font-bold text-gray-600 ml-1 mb-1 block">Max Budget / Session ($)</label>
    <input type="number" step="0.10" value={nanoMaxBudget} onChange={e => setNanoMaxBudget(e.target.value)} placeholder="5.00" className="w-full bg-white border border-indigo-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
    </div>
    <div className="space-y-2 pt-4 border-t border-gray-100">
    <label className="text-xs font-bold text-gray-500 uppercase">Gemini Modell</label>
    <select
    value={localStorage.getItem('NANO_GEMINI_MODEL_ID') || 'gemini-2.0-flash'}
    onChange={(e) => {
      const val = e.target.value;
      localStorage.setItem('NANO_GEMINI_MODEL_ID', val);
      setNanoModel('gemini');
    }}
    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400"
    >
    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Snabbast)</option>
    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Smartast)</option>
    <option value="custom">-- Eget Modell-ID --</option>
    </select>

    {(localStorage.getItem('NANO_GEMINI_MODEL_ID') === 'custom' ||
      !['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].includes(localStorage.getItem('NANO_GEMINI_MODEL_ID') || '')) && (
        <div className="mt-2 animate-in fade-in slide-in-from-top-1">
        <input
        type="text"
        placeholder="Ange Modell-ID"
        defaultValue={localStorage.getItem('NANO_GEMINI_MODEL_ID') === 'custom' ? '' : localStorage.getItem('NANO_GEMINI_MODEL_ID') || ''}
        onBlur={(e) => localStorage.setItem('NANO_GEMINI_MODEL_ID', e.target.value)}
        className="w-full bg-white border border-indigo-200 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-400"
        />
        </div>
      )}
      </div>
      <div>
      <label className="text-xs font-bold text-gray-600 ml-1 mb-1 block">Anthropic API Key (Claude)</label>
      <input type="password" value={nanoApiKey} onChange={e => setNanoApiKey(e.target.value)} placeholder="Din hemliga nyckel" className="w-full bg-white border border-indigo-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
      </div>

      <div>
      <label className="text-xs font-bold text-gray-600 ml-1 mb-1 block">OpenClaw Server URL</label>
      <input type="text" value={nanoServerUrl} onChange={e => setNanoServerUrl(e.target.value)} placeholder="http://192.168.50.185:8000" className="w-full bg-white border border-indigo-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
      </div>

      <div className="mt-6 pt-6 border-t border-indigo-100/60">
      <label className="text-xs font-bold text-indigo-800 ml-1 mb-3 flex items-center gap-2">
      <Folder size={16} /> Externa Mappar (Docker Volumes)
      </label>

      <div className="flex flex-col gap-2 mb-3">
      {nanoExtraMounts.map((mount, idx) => (
        <div key={idx} className="flex justify-between items-center bg-white border border-indigo-100 p-2 pl-3 rounded-xl text-xs font-mono text-gray-700 shadow-sm">
        <span className="truncate max-w-[200px] sm:max-w-xs">{mount.path}</span>
        <button
        onClick={() => handleRemoveMount(idx)}
        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
        >
        <Trash2 size={16} />
        </button>
        </div>
      ))}
      </div>

      <div className="flex gap-2">
      <input
      type="text"
      value={newMount}
      onChange={e => setNewMount(e.target.value)}
      placeholder="/home/deck/Documents"
      className="flex-1 bg-white border border-indigo-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400"
      />
      <button
      onClick={handleAddMount}
      className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl p-3 px-4 flex items-center justify-center transition-colors shadow-sm"
      >
      <Plus size={20} />
      </button>
      </div>
      </div>

      </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Server size={16} /> Lokala Server-URL:er</h3>
      <input type="text" value={whisperUrl} onChange={e => setWhisperUrl(e.target.value)} placeholder="Whisper URL" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
      <input type="text" value={llmUrl} onChange={e => setLlmUrl(e.target.value)} placeholder="LM Studio URL" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-400" />
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
