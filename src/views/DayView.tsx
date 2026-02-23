import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addEntry, updateEntry, deleteEntry } from '../services/db';
import { summarizeDayAI, generateQuestionsAI } from '../services/geminiService';
import { ArrowLeft, Mic, Sparkles, Loader2, RefreshCw, Edit2, PenLine, X, Trash2, Clock, MessageSquare, HelpCircle, Check } from 'lucide-react';
import { clsx } from 'clsx';

export const DayView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const day = useLiveQuery(() => db.days.get(id!), [id]);
  const entries = useLiveQuery(() => db.entries.where('dayId').equals(id!).sortBy('createdAt'), [id]);
  const processingJobs = useLiveQuery(() => db.processingJobs.toArray(), []);
  
  const people = useLiveQuery(() => db.people.where('id').anyOf(day?.personIds || []).toArray(), [day?.personIds]);
  const tags = useLiveQuery(() => db.tags.where('id').anyOf(day?.tagIds || []).toArray(), [day?.tagIds]);

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');

  const [isEditingQuestions, setIsEditingQuestions] = useState(false);
  const [editedQuestions, setEditedQuestions] = useState<string[]>([]);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

  const [isWriting, setIsWriting] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Nya states för flikar och Q&A
  const [activeTab, setActiveTab] = useState<'timeline' | 'qa'>('timeline');
  const [isQaModalOpen, setIsQaModalOpen] = useState(false);
  const [qaList, setQaList] = useState<{question: string, answer: string}[]>([]);

  // Uppdatera editedQuestions när day laddas
  const questions = day?.questions || [];
  useEffect(() => {
    if (questions.length > 0) {
      setEditedQuestions(questions);
    }
  }, [questions]);

  if (!day) return <div className="p-6 text-center text-gray-500 mt-10">Laddar dag...</div>;

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      await summarizeDayAI(day.id, (_, msg) => setLoadingMsg(msg));
    } catch (e: any) {
      alert("Kunde inte sammanfatta dagen: " + e.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const startEditingSummary = () => {
    setEditedSummary(day.summary || '');
    setIsEditingSummary(true);
  };

  const saveSummaryEdit = async () => {
    await db.days.update(day.id, { summary: editedSummary });
    setIsEditingSummary(false);
  };

  const handleSaveQuestions = async () => {
    try {
      await db.days.update(day.id, { questions: editedQuestions });
      setIsEditingQuestions(false);
    } catch (err) {
      console.error("Kunde inte spara frågor:", err);
      alert("Något gick fel när frågorna skulle sparas.");
    }
  };

  const handleSaveTextEntry = async () => {
    if (!textInput.trim()) return;
    await addEntry({ dayId: day.id, createdAt: new Date().toISOString(), isTranscribed: true, transcription: textInput.trim() });
    setTextInput('');
    setIsWriting(false);
  };

  const handleSaveEntryEdit = async (entryId: string, newText: string) => {
    if (newText.trim() !== '') await updateEntry(entryId, { transcription: newText });
    setEditingEntryId(null);
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (window.confirm("Är du säker på att du vill radera detta inlägg?")) await deleteEntry(entryId);
  };

  // NY FUNKTION: Hämta frågor från AI
  const handleGenerateQuestions = async () => {
    setIsGeneratingQuestions(true);
    try {
      const qs = await generateQuestionsAI(day.id);
      setEditedQuestions(qs);
      await db.days.update(day.id, { questions: qs });
      setQaList(qs.map((q: string) => ({ question: q, answer: '' })));
    } catch (e: any) {
      alert("Kunde inte hämta frågor: " + e.message);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // NY FUNKTION: Spara svar och gör ny sammanfattning
  const handleSaveQa = async () => {
    const answered = qaList.filter(q => q.answer.trim() !== '');
    if (answered.length > 0) {
      const existing = day.qa || [];
      await db.days.update(day.id, { qa: [...existing, ...answered] });
      setIsQaModalOpen(false);
      // När vi sparat svaren, ber vi AI:n automatiskt göra en ny, djupare sammanfattning!
      await handleSummarize(); 
    } else {
      setIsQaModalOpen(false);
    }
  };

  const d = new Date(day.date);
  const formattedDate = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-screen bg-slate-50 pb-24 relative">
      <div className="bg-white p-6 pb-6 shadow-sm sticky top-0 z-10">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => navigate(-1)} className="p-2 bg-gray-100 rounded-full text-gray-600"><ArrowLeft size={20} /></button>
          <div className="text-3xl">{day.mood || '📓'}</div>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 capitalize leading-tight">{formattedDate}</h1>
      </div>

      <div className="p-4 space-y-6">
        
        {/* AI-SAMMANFATTNINGEN */}
        {day.summary ? (
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-3xl border border-indigo-100 shadow-sm relative overflow-hidden">
             <div className="absolute top-4 right-4 flex items-center gap-2">
               {!isEditingSummary ? (
                 <>
                   <button onClick={startEditingSummary} disabled={isSummarizing} className="p-2 bg-white/60 hover:bg-white text-indigo-500 rounded-full transition-all shadow-sm active:scale-95 disabled:opacity-50"><Edit2 size={16} /></button>
                   <button onClick={handleSummarize} disabled={isSummarizing} className="p-2 bg-white/60 hover:bg-white text-indigo-500 rounded-full transition-all shadow-sm active:scale-95 disabled:opacity-50"><RefreshCw size={16} className={clsx(isSummarizing && "animate-spin")} /></button>
                 </>
               ) : (
                 <>
                   <button onClick={() => setIsEditingSummary(false)} className="text-xs font-bold text-gray-500 px-2">Avbryt</button>
                   <button onClick={saveSummaryEdit} className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-indigo-700 active:scale-95 shadow-sm">Spara</button>
                 </>
               )}
             </div>

             <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2 mt-1">
               <Sparkles size={14} /> AI Sammanfattning
             </h3>
             
             {isSummarizing ? (
               <div className="flex flex-col items-center justify-center py-6 text-indigo-400">
                 <Loader2 className="animate-spin mb-3" size={28} />
                 <span className="text-sm font-medium">{loadingMsg || 'Skriver ny sammanfattning...'}</span>
               </div>
             ) : (
               <>
                 {isEditingSummary ? (
                   <textarea value={editedSummary} onChange={(e) => setEditedSummary(e.target.value)} className="w-full min-h-[150px] bg-white/80 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-950 font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-6" autoFocus />
                 ) : (
                   <p className="text-indigo-950 text-sm font-medium leading-relaxed mb-6 whitespace-pre-wrap">{day.summary}</p>
                 )}
                 
                 {!isEditingSummary && ((people && people.length > 0) || (tags && tags.length > 0)) && (
                   <div className="mt-4 pt-4 border-t border-indigo-100/50 flex flex-wrap gap-2">
                     {people?.map(p => <span key={p.id} className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-xs font-bold border border-pink-200">👤 {p.name}</span>)}
                     {tags?.map(t => <span key={t.id} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200">🏷️ {t.name}</span>)}
                   </div>
                 )}
               </>
             )}
          </div>
        ) : (
          <button onClick={handleSummarize} disabled={isSummarizing || !entries || entries.length === 0} className={clsx("w-full py-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 transition-all shadow-sm border", isSummarizing ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-transparent hover:shadow-md active:scale-[0.98]", (!entries || entries.length === 0) && "opacity-50 grayscale cursor-not-allowed")}>
            {isSummarizing ? (
              <><Loader2 className="animate-spin mb-1" size={24} /><span className="text-sm">{loadingMsg || 'Tänker...'}</span></>
            ) : (
              <><Sparkles size={24} /><span>Sammanfatta Min Dag</span></>
            )}
          </button>
        )}

        {/* NYA FLIKAR: Tidslinje eller Q&A */}
        <div className="flex gap-6 mt-8 border-b border-gray-200 px-2">
          <button onClick={() => setActiveTab('timeline')} className={clsx("pb-3 text-sm font-bold flex items-center gap-2 transition-colors", activeTab === 'timeline' ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-400 hover:text-gray-600")}>
            <Clock size={16}/> Tidslinje
          </button>
          <button onClick={() => setActiveTab('qa')} className={clsx("pb-3 text-sm font-bold flex items-center gap-2 transition-colors", activeTab === 'qa' ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-400 hover:text-gray-600")}>
            <MessageSquare size={16}/> Frågor & Svar
          </button>
        </div>

        {/* INNEHÅLL BASERAT PÅ FLIK */}
        {activeTab === 'timeline' ? (
          <div className="mt-6 space-y-4">
            {entries?.map((entry) => {
              const time = new Date(entry.createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
              
              // Hitta om detta inlägg ligger i kön eller har kraschat
              const job = processingJobs?.find(j => j.meetingId === entry.id);
              
              return (
                <div key={entry.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center min-w-[50px]">
                    <span className="text-xs font-bold text-gray-400 bg-slate-50 py-1">{time}</span>
                    <div className="w-0.5 h-full bg-gray-200 mt-2 rounded-full group-last:bg-transparent"></div>
                  </div>
                  <div className="flex-1 bg-white p-4 pr-10 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 mb-2 relative">
                    <button onClick={() => handleDeleteEntry(entry.id)} className="absolute top-2 right-2 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                    
                    {!entry.isTranscribed ? (
                      job?.status === 'error' ? (
                        <div className="text-red-600 text-sm font-medium p-3 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-2">
                          <span className="font-bold">⚠️ Ett fel uppstod</span>
                          <span className="text-xs opacity-80">{job.message}</span>
                          <button 
                            onClick={() => {
                              db.processingJobs.update(job.id, {status: 'pending', message: 'Försöker igen...'});
                              import('../services/queueService').then(m => m.processQueue());
                            }} 
                            className="mt-1 w-full bg-red-600 text-white py-2 rounded-lg text-xs font-bold active:scale-95 transition-all">
                            Försök igen
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-indigo-500 text-sm font-bold bg-indigo-50/50 p-3 rounded-xl border border-indigo-50">
                          <Loader2 className="animate-spin" size={16} /> 
                          {job?.message || 'Ligger i kö...'} 
                        </div>
                      )
                    ) : (
                      editingEntryId === entry.id ? (
                        <textarea autoFocus defaultValue={entry.transcription} onBlur={(e) => handleSaveEntryEdit(entry.id, e.target.value)} className="w-full text-gray-800 text-sm leading-relaxed bg-gray-50 border border-indigo-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none min-h-[80px]" />
                      ) : (
                        <p onClick={() => setEditingEntryId(entry.id)} className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors">{entry.transcription}</p>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {entries?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Inga inlägg idag. Skriv eller spela in något!</p>}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* Frågor & Svar Sektion */}
            <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" /> Frågor & Svar
                </h3>
                <div className="flex gap-2">
                  {!isEditingQuestions ? (
                    <button 
                      onClick={() => setIsEditingQuestions(true)}
                      className="p-2 hover:bg-indigo-50 rounded-full text-indigo-400 transition-colors"
                      title="Redigera frågor"
                    >
                      <Edit2 size={16} />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSaveQuestions}
                      className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold hover:bg-green-600 shadow-sm transition-colors"
                    >
                      <Check size={14} /> Spara
                    </button>
                  )}

                  <button
                    onClick={handleGenerateQuestions}
                    disabled={isGeneratingQuestions || !entries || entries.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50 text-xs font-bold"
                  >
                    <RefreshCw size={14} className={clsx(isGeneratingQuestions && "animate-spin")} />
                    Hämta frågor
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {isGeneratingQuestions ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
                    <p className="text-sm text-indigo-600 font-medium">AI tänker ut frågor...</p>
                  </div>
                ) : questions.length > 0 ? (
                  <div className="space-y-4">
                    {isEditingQuestions ? (
                      editedQuestions.map((q, idx) => (
                        <textarea
                          key={idx}
                          value={q}
                          onChange={(e) => {
                            const newQs = [...editedQuestions];
                            newQs[idx] = e.target.value;
                            setEditedQuestions(newQs);
                          }}
                          className="w-full bg-slate-50 border border-indigo-100 rounded-xl p-3 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-400 outline-none"
                          rows={2}
                        />
                      ))
                    ) : (
                      questions.map((q, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-indigo-50 text-sm text-gray-700 leading-relaxed">
                          {q}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">Inga frågor genererade än.</p>
                )}
              </div>
            </div>

            {day.qa && day.qa.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Dina Svar</h3>
                {day.qa.map((qa, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100">
                    <h4 className="font-bold text-indigo-900 text-sm mb-3 flex gap-2"><Sparkles size={16} className="text-indigo-400 flex-shrink-0 mt-0.5"/> {qa.question}</h4>
                    <p className="text-gray-700 text-sm bg-indigo-50/50 p-3 rounded-xl border border-indigo-50/50 leading-relaxed">{qa.answer}</p>
                  </div>
                ))}
              </div>
            )}
            
            <button 
              onClick={() => {
                setQaList((day.questions || []).map(q => ({ question: q, answer: '' })));
                setIsQaModalOpen(true);
              }} 
              disabled={isGeneratingQuestions || !day.questions || day.questions.length === 0}
              className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm border bg-indigo-600 text-white border-transparent hover:bg-indigo-700 disabled:opacity-50 mt-4"
            >
              <MessageSquare size={20}/> Svara på frågorna
            </button>
          </div>
        )}
      </div>

      {/* MODAL FÖR ATT SVARA PÅ FRÅGOR */}
      {isQaModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-10">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Sparkles size={18} className="text-indigo-500"/> AIns frågor till dig</h3>
            
            <div className="space-y-6 overflow-y-auto pr-2 pb-4">
              {qaList.map((qa, i) => (
                <div key={i} className="space-y-3">
                  <label className="text-sm font-bold text-indigo-900 block leading-snug">{qa.question}</label>
                  <textarea
                    value={qa.answer}
                    onChange={e => {
                      const newList = [...qaList];
                      newList[i].answer = e.target.value;
                      setQaList(newList);
                    }}
                    placeholder="Skriv ditt svar här... (frivilligt)"
                    className="w-full h-28 bg-gray-50 rounded-xl p-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 border border-gray-200"
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => setIsQaModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 bg-gray-100 rounded-xl">Avbryt</button>
              <button onClick={handleSaveQa} disabled={isSummarizing} className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl flex items-center justify-center gap-2">
                {isSummarizing ? <Loader2 className="animate-spin" size={18}/> : 'Spara & Uppdatera'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEXT-INMANTNINGS-MODAL */}
      {isWriting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Skriv ett inlägg</h3>
              <button onClick={() => setIsWriting(false)} className="text-gray-400 p-1"><X size={20} /></button>
            </div>
            <textarea autoFocus value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="Vad tänker du på?" className="w-full h-32 bg-gray-50 rounded-xl p-3 text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 border border-gray-100" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setIsWriting(false)} className="flex-1 py-3 font-bold text-gray-500 bg-gray-100 rounded-xl">Avbryt</button>
              <button onClick={handleSaveTextEntry} className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl">Spara inlägg</button>
            </div>
          </div>
        </div>
      )}

      {/* FLYTANDE KNAPPAR */}
      <div className="fixed bottom-24 right-6 flex flex-col gap-3 z-40 items-center">
        <button onClick={() => setIsWriting(true)} className="w-12 h-12 bg-indigo-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-600 active:scale-90 transition-transform">
          <PenLine size={20} fill="currentColor" />
        </button>
        <button onClick={() => navigate('/record')} className="w-16 h-16 bg-red-500 text-white rounded-full shadow-xl shadow-red-500/30 flex items-center justify-center hover:bg-red-600 active:scale-90 transition-transform">
          <Mic size={28} fill="currentColor" />
        </button>
      </div>

    </div>
  );
};
