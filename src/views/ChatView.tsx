import { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Loader2, Trash2, History, Plus, Save, X } from 'lucide-react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { startRecording, stopRecording } from '../services/audioRecorder';
import { transcribeBlobAI, sendChatMessageAI } from '../services/geminiService';
import { createChat, getChats, getChatMessages, addChatMessage, deleteChat } from '../services/db';
import { Chat } from '../types';
import { clsx } from 'clsx';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatView = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ny logik för Historik & Sparande
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedChats, setSavedChats] = useState<Chat[]>([]);

  const isLocalMode = localStorage.getItem('TRANSCRIPTION_MODE') === 'local';

  useEffect(() => {
    if (isLocalMode) SpeechRecognition.requestPermissions();
  }, []);

  // Ladda in historik automatiskt när popupen öppnas
  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory]);

  // Auto-scroll till botten
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, liveText, inputText]);

  const loadHistory = async () => {
    const chats = await getChats();
    setSavedChats(chats);
  };

  const handleLoadChat = async (chatId: string) => {
    const msgs = await getChatMessages(chatId);
    setMessages(msgs.map(m => ({ role: m.role, content: m.content })));
    setActiveChatId(chatId);
    setShowHistory(false);
  };

  const handleSaveCurrentChat = async () => {
    if (messages.length === 0) return;
    // Skapar en snygg titel från det första meddelandet
    const title = messages[0].content.substring(0, 30) + (messages[0].content.length > 30 ? '...' : '');
    const newChatId = await createChat(title);
    
    // Spara de meddelanden vi redan har hunnit skriva i minnet
    for (const msg of messages) {
      await addChatMessage(newChatId, msg.role, msg.content);
    }
    
    setActiveChatId(newChatId);
    await loadHistory();
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteChat(chatId);
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
    }
    await loadHistory();
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      if (isLocalMode) {
        await SpeechRecognition.stop();
        setInputText(prev => (prev + " " + liveText).trim());
        setLiveText('');
      } else {
        const audioBlob = await stopRecording();
        setIsTranscribing(true);
        try {
          const text = await transcribeBlobAI(audioBlob);
          setInputText(prev => (prev + " " + text).trim());
        } catch(e) {
          alert("Kunde inte transkribera ljudet.");
        }
        setIsTranscribing(false);
      }
    } else {
      setIsRecording(true);
      if (isLocalMode) {
        setLiveText('');
        SpeechRecognition.addListener('partialResults', (data: any) => {
          if (data.matches && data.matches.length > 0) setLiveText(data.matches[0]);
        });
        await SpeechRecognition.start({ language: 'sv-SE', partialResults: true, popup: false });
      } else {
        await startRecording();
      }
    }
  };

  const handleSend = async () => {
    const finalInput = (inputText + " " + liveText).trim();
    if (!finalInput) return;

    if (isRecording && isLocalMode) {
        await SpeechRecognition.stop();
        setIsRecording(false);
        setLiveText('');
    }

    const newMessages: Message[] = [...messages, { role: 'user', content: finalInput }];
    setMessages(newMessages);
    setInputText('');
    setIsThinking(true);

    // Automatiskt spara i bakgrunden om vi pratar i en sparad chatt
    if (activeChatId) await addChatMessage(activeChatId, 'user', finalInput);

    try {
      const reply = await sendChatMessageAI(newMessages);
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
      
      // Spara AI:ns svar i bakgrunden
      if (activeChatId) await addChatMessage(activeChatId, 'assistant', reply);
      
    } catch (err: any) {
      const errorMsg = `[Fel: ${err.message}]`;
      setMessages([...newMessages, { role: 'assistant', content: errorMsg }]);
      if (activeChatId) await addChatMessage(activeChatId, 'assistant', errorMsg);
    }
    setIsThinking(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 pt-12 pb-24">
      
      {/* HEADER MED NYA KNAPPARNA */}
      <div className="px-6 py-4 bg-white shadow-sm z-10 sticky top-0 flex justify-between items-center">
        <h1 className="text-2xl font-extrabold text-gray-900">AI Chatt</h1>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
             <button onClick={handleNewChat} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50" title="Rensa aktuell chatt">
               <Trash2 size={20} />
             </button>
          )}
          <button onClick={() => setShowHistory(true)} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors rounded-full hover:bg-indigo-50" title="Chatthistorik">
            <History size={20} />
          </button>
        </div>
      </div>

      {/* CHATT-FÖNSTER */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10 text-sm font-medium">
            Ställ en fråga eller prata med din AI-assistent!
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={clsx("max-w-[85%] p-3.5 text-sm font-medium leading-relaxed", msg.role === 'user' ? "bg-indigo-600 text-white ml-auto rounded-2xl rounded-br-none shadow-md" : "bg-white border border-gray-200 text-gray-800 mr-auto rounded-2xl rounded-bl-none shadow-sm")}>
            {msg.content}
          </div>
        ))}
        {isThinking && (
          <div className="bg-white border border-gray-200 text-gray-500 mr-auto p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2 text-sm font-medium">
            <Loader2 size={16} className="animate-spin text-indigo-500" /> Tänker...
          </div>
        )}
      </div>

      {/* INMATNING */}
      <div className="p-4 bg-white border-t border-gray-100 flex items-end gap-2 fixed bottom-16 left-0 right-0 z-20">
        <button onClick={toggleRecording} className={clsx("p-3.5 rounded-full flex-shrink-0 transition-all shadow-sm", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
          {isTranscribing ? <Loader2 size={20} className="animate-spin" /> : (isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />)}
        </button>
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-3xl flex items-center focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent transition-all overflow-hidden relative min-h-[50px] shadow-inner">
           {liveText && <div className="absolute inset-0 px-4 py-3.5 text-sm text-gray-400 pointer-events-none italic truncate">{inputText} {liveText}</div>}
           <textarea
             value={inputText}
             onChange={(e) => setInputText(e.target.value)}
             placeholder={liveText ? "" : "Skriv eller prata..."}
             className="w-full max-h-32 bg-transparent text-sm font-medium px-4 py-3.5 focus:outline-none resize-none"
             rows={1}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault();
                 handleSend();
               }
             }}
           />
        </div>
        <button onClick={handleSend} disabled={(!inputText.trim() && !liveText.trim()) || isThinking || isTranscribing} className="p-3.5 bg-indigo-600 text-white rounded-full flex-shrink-0 disabled:opacity-50 disabled:bg-gray-300 transition-all shadow-md active:scale-95">
          <Send size={20} className="ml-0.5" />
        </button>
      </div>

      {/* POPUP FÖR HISTORIK */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
                <History size={20} className="text-indigo-500" /> Historik
              </h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 p-1 bg-white rounded-full shadow-sm border border-gray-200">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <button onClick={handleNewChat} className="flex items-center justify-center gap-2 p-3 bg-indigo-50 text-indigo-700 font-bold rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors">
                <Plus size={18} /> Starta ny chatt
              </button>
              
              {!activeChatId && messages.length > 0 && (
                <button onClick={handleSaveCurrentChat} className="flex items-center justify-center gap-2 p-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-colors">
                  <Save size={18} /> Spara nuvarande chatt
                </button>
              )}
              
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 mb-2">Tidigare chattar</h3>
                {savedChats.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 mt-6 italic">Inga sparade chattar ännu.</p>
                ) : (
                  savedChats.map(chat => (
                    <div 
                      key={chat.id} 
                      onClick={() => handleLoadChat(chat.id)}
                      className={clsx("p-3 rounded-xl border cursor-pointer flex justify-between items-center transition-all", activeChatId === chat.id ? "bg-indigo-600 border-indigo-600 text-white shadow-md" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-indigo-200")}
                    >
                      <div className="overflow-hidden pr-3">
                        <p className="text-sm font-bold truncate">{chat.title}</p>
                        <p className={clsx("text-[10px]", activeChatId === chat.id ? "text-indigo-200" : "text-gray-400")}>
                          {new Date(chat.updatedAt).toLocaleDateString()} kl {new Date(chat.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                      <button onClick={(e) => handleDeleteChat(chat.id, e)} className={clsx("p-2 rounded-lg transition-colors flex-shrink-0", activeChatId === chat.id ? "hover:bg-indigo-700 text-indigo-300 hover:text-white" : "hover:bg-red-50 text-gray-300 hover:text-red-500")}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
