import { useState, useRef, useEffect } from 'react';
import { Terminal, Settings, Power, Play, Pause, AlertOctagon, Send, Globe, FileCode, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { AgentStatus, AgentLog, AgentMessage } from '../types';

export const NanoView = () => {
  const navigate = useNavigate();
  const logsEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<AgentStatus>('idle');
  const [inputText, setInputText] = useState('');
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  
  const [messages, setMessages] = useState<AgentMessage[]>([
    { id: '1', role: 'agent', content: 'Redo att ta emot uppdrag. Jag är uppkopplad och har tillgång till din lokala miljö.', timestamp: Date.now() }
  ]);

  const [logs, setLogs] = useState<AgentLog[]>([
    { id: 'l1', timestamp: Date.now(), message: 'OpenClaw Agent initierad. Inväntar kommandon.', type: 'info' }
  ]);

  // Auto-scroll för chatt och terminal
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string, type: AgentLog['type'] = 'info', tool?: AgentLog['tool']) => {
    setLogs(prev => [...prev, { id: Date.now().toString(), timestamp: Date.now(), message, type, tool }]);
  };

  const handleSend = async () => {
    if (!inputText.trim() || status === 'working') return;

    const newMsg: AgentMessage = { id: Date.now().toString(), role: 'user', content: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setStatus('working');

    const serverUrl = localStorage.getItem('NANO_SERVER_URL') || 'http://127.0.0.1:8000';
    const apiKey = localStorage.getItem('NANO_API_KEY');

    addLog(`Pratar med Nano...`, 'info');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${serverUrl}/api/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ message: newMsg.content })
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error("Fel API-nyckel (Unauthorized)");
        throw new Error(`Serverfel: ${response.status}`);
      }

      const data = await response.json();

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        content: data.reply || data.response || 'Klart.',
        timestamp: Date.now()
      }]);
      setStatus('idle');
    } catch (error: any) {
      addLog(`Anslutningsfel: ${error.message}`, 'error');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        content: `❌ Nätverksfel. Jag kunde inte nå servern. (${error.message})`,
        timestamp: Date.now()
      }]);
      setStatus('idle');
    }
  };

  const handleKillSwitch = () => {
    setStatus('terminated');
    addLog('SYSTEM: Nödstopp aktiverat. Processen dödad (SIGKILL).', 'error');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: '❌ Arbete avbrutet av användare.', timestamp: Date.now() }]);
  };

  const finishTask = () => {
    setStatus('idle');
    addLog('Uppdrag slutfört.', 'success');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', content: 'Jag har slutfört uppgiften och sparat resultatet.', timestamp: Date.now() }]);
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'idle': return <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-400"></div> REDO</span>;
      case 'working': return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse"><div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></div> ARBETAR</span>;
      case 'paused': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"><Pause size={12} /> PAUSAD</span>;
      case 'awaiting_approval': return <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"><ShieldAlert size={12} /> VÄNTAR PÅ SVAR</span>;
      case 'terminated': return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"><AlertOctagon size={12} /> AVSLUTAD</span>;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      
      {/* HEADER: KONTROLLPANEL */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-3 sticky top-0 z-20 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <Terminal size={20} />
            </div>
            <div>
              <h1 className="font-extrabold text-gray-900 leading-tight">Nano Agent</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {renderStatusBadge()}
              </div>
            </div>
          </div>
          <button onClick={() => navigate('/settings')} className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition-colors">
            <Settings size={20} />
          </button>
        </div>

        {/* KILL SWITCH */}
        <button 
          onClick={handleKillSwitch}
          disabled={status === 'idle' || status === 'terminated'}
          className={clsx(
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-sm uppercase tracking-wider",
            status === 'idle' || status === 'terminated' 
              ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
              : "bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] active:scale-95 hover:bg-red-700"
          )}
        >
          <Power size={18} /> Avbryt process (Kill Switch)
        </button>
      </div>

      {/* CHATT YTA */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-48">
        {messages.map((msg) => (
          <div key={msg.id} className={clsx("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={clsx(
              "max-w-[85%] rounded-2xl p-4 shadow-sm",
              msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-white border border-gray-100 rounded-tl-sm text-gray-800"
            )}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              
              {/* Godkännande-knappar om status är awaiting_approval */}
              {status === 'awaiting_approval' && msg.role === 'agent' && msg.id === messages[messages.length - 1].id && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button onClick={finishTask} className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1"><CheckCircle2 size={14}/> TILLÅT</button>
                  <button onClick={handleKillSwitch} className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-xs font-bold flex justify-center items-center gap-1"><AlertOctagon size={14}/> NEKA</button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ACTION STREAM (TERMINAL) & INPUT - FIXERAD I BOTTEN */}
      <div className="fixed bottom-[60px] left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-30 flex flex-col transition-all duration-300">
        
        {/* ACTION STREAM TOGGLE */}
        <div 
          onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
          className="bg-slate-900 text-slate-400 text-[10px] font-mono px-4 py-1.5 flex justify-between items-center cursor-pointer border-t-2 border-indigo-500"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            LIVE ACTION STREAM {isTerminalExpanded ? '(Klicka för att minimera)' : '(Klicka för att expandera)'}
          </div>
          <span>{logs.length} loggar</span>
        </div>

        {/* TERMINAL FÖNSTER */}
        {isTerminalExpanded && (
          <div className="bg-slate-900 h-48 overflow-y-auto p-3 font-mono text-xs flex flex-col gap-1.5">
            {logs.map(log => (
              <div key={log.id} className="flex gap-2 items-start">
                <span className="text-slate-500 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                
                {log.tool === 'browser' && <Globe size={12} className="text-blue-400 mt-0.5 shrink-0" />}
                {log.tool === 'terminal' && <Terminal size={12} className="text-purple-400 mt-0.5 shrink-0" />}
                
                <span className={clsx(
                  "break-words",
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'warning' ? 'text-amber-400' :
                  log.type === 'action' ? 'text-blue-300' : 'text-slate-300'
                )}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {/* CHATT INPUT */}
        <div className="p-3 bg-gray-50 flex gap-2 items-end">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={status === 'working' ? "Agenten arbetar..." : "Ge Nano ett uppdrag (t.ex. 'Analysera loggfilerna')..."}
            disabled={status === 'working' || status === 'awaiting_approval'}
            className="flex-1 max-h-32 min-h-[44px] bg-white border border-gray-300 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:text-gray-400"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button 
            onClick={handleSend}
            disabled={!inputText.trim() || status === 'working' || status === 'awaiting_approval'}
            className="w-11 h-11 bg-indigo-600 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50 disabled:bg-gray-400 transition-colors"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
