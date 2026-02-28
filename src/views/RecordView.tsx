import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { audioRecorder } from '../services/audioRecorder';
import { db, addProjectMember } from '../services/db';
import { processQueue } from '../services/queueService'; // <-- NY IMPORT FÖR ATT STARTA KÖN DIREKT
import { Mic, Square, ArrowLeft, Users, StickyNote, Plus, Folder, Tag, CheckCircle2, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QuickNote, MemberGroup, Person } from '../types';
import { BottomSheet } from '../components/BottomSheet';
import { Capacitor } from '@capacitor/core';
import { BackgroundMode } from '@anuradev/capacitor-background-mode';

const SelectionCard = ({ children, onClick, isSelected, isDisabled = false }: { children: React.ReactNode, onClick: () => void, isSelected: boolean, isDisabled?: boolean }) => (
  <motion.button
  layout
  onClick={onClick}
  disabled={isDisabled}
  className={`w-full text-left p-4 rounded-xl border transition-all ${
    isSelected
    ? 'bg-blue-600 text-white border-blue-700 shadow-lg'
    : 'bg-white hover:bg-gray-50 border-gray-200'
  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  whileTap={{ scale: 0.98 }}
  >
  <div className="flex justify-between items-center">
  <div className="flex items-center gap-3">
  {children}
  </div>
  {isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 size={20} /></motion.div>}
  </div>
  </motion.button>
);

export const RecordView = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [title, setTitle] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | undefined>();
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [currentNote, setCurrentNote] = useState('');

  const [modal, setModal] = useState<'project' | 'person' | 'addExistingPerson' | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRole, setNewPersonRole] = useState('');
  const [newPersonGroup, setNewPersonGroup] = useState<MemberGroup>(MemberGroup.CORE_TEAM);

  const [isManual, setIsManual] = useState(false);
  const [manualText, setManualText] = useState('');

  const navigate = useNavigate();

  const allPeople = useLiveQuery(() => db.people.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const categories = useLiveQuery(
    () => selectedProjectId ? db.categories.where('projectId').equals(selectedProjectId).toArray() : Promise.resolve([]),
                                  [selectedProjectId]
  );
  const projectMembers = useLiveQuery(
    () => selectedProjectId ? db.projectMembers.where('projectId').equals(selectedProjectId).toArray() : Promise.resolve([]),
                                      [selectedProjectId]
  );
  const projectTags = useLiveQuery(() => selectedProjectId ? db.tags.where('projectId').equals(selectedProjectId).toArray() : Promise.resolve([]), [selectedProjectId]);

  const visiblePeople = selectedProjectId
  ? allPeople?.filter(p => projectMembers?.some(pm => pm.personId === p.id))
  : allPeople;

  const peopleNotInProject = allPeople?.filter(p => !projectMembers?.some(pm => pm.personId === p.id));

  const animationRef = useRef<number>();

  const drawVisualizer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const animate = async () => {
      if (!isRecording) {
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = `rgba(59, 130, 246, 0.2)`;
          ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
        }
        return;
      }

      animationRef.current = requestAnimationFrame(animate);

      let data: Uint8Array;

      if (Capacitor.isNativePlatform()) {
        const amp = await audioRecorder.getNativeAmplitude();
        const level = Math.floor(amp * 255);
        data = new Uint8Array(64).fill(level);
      } else {
        data = audioRecorder.getVisualizerData();
      }

      if (!ctx || data.length === 0) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / data.length) * 2;
      let x = 0;
      for(let i = 0; i < data.length; i++) {
        let barHeight = (data[i] / 255) * canvas.height;
        if (barHeight < 2) barHeight = 2;

        ctx.fillStyle = `rgba(59, 130, 246, ${Math.max(data[i]/255, 0.3)})`;
        ctx.beginPath();
        // @ts-ignore
        ctx.roundRect(x, (canvas.height - barHeight) / 2, barWidth - 2, barHeight, 5);
        ctx.fill();
        x += barWidth;
      }
    };

    animate();
  };

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setDuration(d => d + 1), 1000);
      drawVisualizer();
    } else {
      drawVisualizer();
    }

    return () => {
      clearInterval(interval);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  const handleSelectProject = (projectId: string) => {
    if (selectedProjectId === projectId) {
      setSelectedProjectId(undefined);
      setSelectedCategoryId(undefined);
      setSelectedSubCategory(undefined);
      setSelectedPeople([]);
      setSelectedTagIds([]);
    } else {
      setSelectedProjectId(projectId);
      setSelectedCategoryId(undefined);
      setSelectedSubCategory(undefined);
      setSelectedPeople([]);
      setSelectedTagIds([]);
    }
  };

  const handleStartRecording = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await BackgroundMode.enable();
        await BackgroundMode.disableWebViewOptimizations();
      }

      await audioRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      alert("Kunde inte starta mikrofonen:\n\n" + error.message);
      setIsRecording(false);

      if (Capacitor.isNativePlatform()) {
        try { await BackgroundMode.disable(); } catch(e) {}
      }
    }
  };

  const handleStopRecording = async () => {
    try {
      const blob = await audioRecorder.stop();
      setIsRecording(false);
      const id = crypto.randomUUID();

      // 🔥 LÄGG TILL db.processingJobs I TRANSAKTIONEN 🔥
      await db.transaction('rw', db.meetings, db.audioFiles, db.processingJobs, async () => {
        await db.meetings.add({
          id,
          title: title || `Möte ${new Date().toLocaleDateString()}`,
                              date: new Date().toISOString(),
                              duration,
                              projectId: selectedProjectId,
                              categoryId: selectedCategoryId,
                              subCategoryName: selectedSubCategory,
                              participantIds: selectedPeople,
                              tagIds: selectedTagIds,
                              isProcessed: false,
                              quickNotes
        });

        await db.audioFiles.add({ id, blob, mimeType: blob.type });

        // 🔥 SKAPA ETT KÖ-JOBB FÖR ATT STARTA WHISPER 🔥
        await db.processingJobs.add({
          id: crypto.randomUUID(),
                                    meetingId: id,
                                    status: 'pending',
                                    createdAt: new Date().toISOString(),
                                    attempts: 0
        });
      });

      // Starta kön direkt
      processQueue();

      navigate(`/meeting/${id}`);
    } catch (e: any) {
      alert("Kunde inte spara inspelningen: " + e.message);
      setIsRecording(false);
    } finally {
      if (Capacitor.isNativePlatform()) {
        try { await BackgroundMode.disable(); } catch(e) {}
      }
    }
  };

  const handleToggle = async () => {
    if (!isRecording) {
      await handleStartRecording();
    } else {
      await handleStopRecording();
    }
  };

  const handleCancelRecording = async () => {
    if (window.confirm("Är du säker på att du vill avbryta? Ljudet kommer inte att sparas.")) {
      try {
        await audioRecorder.stop();
      } catch(e) { }

      setIsRecording(false);
      setDuration(0);
      setQuickNotes([]);
      setShowNoteInput(false);
      setCurrentNote('');

      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (Capacitor.isNativePlatform()) {
        try { await BackgroundMode.disable(); } catch(e) {}
      }
    }
  };

  const handleSaveManual = async () => {
    if (!manualText.trim()) return;

    const id = crypto.randomUUID();

    const transcription = [{
      start: 0,
      end: 0,
      text: manualText,
      speaker: "Inskriven text"
    }];

    // 🔥 ÄVEN HÄR SKAPAR VI ETT KÖ-JOBB FÖR AI-SAMMANFATTNINGEN 🔥
    await db.transaction('rw', db.meetings, db.processingJobs, async () => {
      await db.meetings.add({
        id,
        title: title || `Manuellt möte ${new Date().toLocaleDateString()}`,
                            date: new Date().toISOString(),
                            duration: 0,
                            projectId: selectedProjectId,
                            categoryId: selectedCategoryId,
                            subCategoryName: selectedSubCategory,
                            participantIds: selectedPeople,
                            tagIds: selectedTagIds,
                            isProcessed: false,
                            transcription: transcription,
                            quickNotes: []
      });

      await db.processingJobs.add({
        id: crypto.randomUUID(),
                                  meetingId: id,
                                  status: 'pending',
                                  createdAt: new Date().toISOString(),
                                  attempts: 0
      });
    });

    processQueue();
    navigate(`/meeting/${id}`);
  };

  const addQuickNote = () => {
    if (!currentNote.trim()) return;
    setQuickNotes([...quickNotes, { timestamp: duration, text: currentNote }]);
    setCurrentNote('');
    setShowNoteInput(false);
  };

  const togglePerson = (id: string) => {
    setSelectedPeople(selectedPeople.includes(id) ? selectedPeople.filter(p => p !== id) : [...selectedPeople, id]);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    const newId = crypto.randomUUID();
    await db.projects.add({ id: newId, name: newProjectName });
    setSelectedProjectId(newId);
    setNewProjectName('');
    setModal(null);
  };

  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    const personId = await db.people.add({
      id: crypto.randomUUID(),
                                         name: newPersonName,
                                         role: newPersonRole || 'Deltagare',
                                         region: 'Okänd',
                                         projectIds: []
    } as Person);

    if (selectedProjectId) {
      await addProjectMember(selectedProjectId, personId.toString(), newPersonGroup, newPersonRole);
    }

    togglePerson(personId.toString());
    setNewPersonName('');
    setNewPersonRole('');
    setNewPersonGroup(MemberGroup.CORE_TEAM);
    setModal(null);
  };

  const handleAddExistingPersonToProject = async (personId: string) => {
    if (!selectedProjectId) return;
    await addProjectMember(selectedProjectId, personId, MemberGroup.CORE_TEAM, '');
    togglePerson(personId);
    setModal(null);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
    <div className="h-screen bg-gray-50 flex flex-col p-6 overflow-y-auto no-scrollbar pb-40">
    <div className="flex items-center mb-6">
    <button onClick={() => navigate(-1)} className="p-2 bg-gray-100 rounded-full">
    <ArrowLeft size={20} />
    </button>
    <span className="ml-4 font-bold text-lg">Ny Inspelning</span>
    </div>

    <input
    type="text"
    placeholder="Vad handlar mötet om?"
    className="text-2xl font-bold placeholder-gray-300 border-none focus:ring-0 w-full mb-8 bg-transparent p-0"
    value={title}
    onChange={e => setTitle(e.target.value)}
    />

    <div className="space-y-6 mb-8">
    <div className="space-y-3">
    <h2 className="font-bold text-gray-700">Välj Projekt</h2>
    {projects?.map(proj => (
      <SelectionCard key={proj.id} onClick={() => handleSelectProject(proj.id)} isSelected={selectedProjectId === proj.id} isDisabled={selectedProjectId !== undefined && selectedProjectId !== proj.id}>
      <Folder className={`${selectedProjectId === proj.id ? 'text-white' : 'text-blue-500'}`} />
      <span className="font-semibold">{proj.name}</span>
      </SelectionCard>
    ))}
    <button onClick={() => setModal('project')} className="w-full flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-semibold border-2 border-dashed text-gray-500 hover:bg-gray-100 transition-colors">
    <Plus size={16} /> Nytt Projekt
    </button>
    </div>

    <AnimatePresence>
    {selectedProjectId && (
      <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
      >
      {categories && categories.length > 0 && (
        <div className="space-y-3">
        <h2 className="font-bold text-gray-700">Välj Kategori (Valfritt)</h2>
        {categories.map(cat => (
          <SelectionCard key={cat.id} onClick={() => setSelectedCategoryId(cat.id === selectedCategoryId ? undefined : cat.id)} isSelected={selectedCategoryId === cat.id}>
          <Tag className={`${selectedCategoryId === cat.id ? 'text-white' : 'text-green-500'}`} />
          <span className="font-semibold">{cat.name}</span>
          </SelectionCard>
        ))}
        </div>
      )}

      {projectTags && projectTags.length > 0 && (
        <div className="space-y-3">
        <h2 className="font-bold text-gray-700">Taggar</h2>
        <div className="flex flex-wrap gap-2">
        {projectTags.map(tag => (
          <button
          key={tag.id}
          onClick={() => toggleTag(tag.id)}
          className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
            selectedTagIds.includes(tag.id) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'
          }`}
          >
          {tag.name}
          </button>
        ))}
        </div>
        </div>
      )}

      <div className="space-y-3">
      <h2 className="font-bold text-gray-700">Välj Deltagare</h2>
      <div className="grid grid-cols-2 gap-3">
      {visiblePeople?.map(person => (
        <SelectionCard key={person.id} onClick={() => togglePerson(person.id)} isSelected={selectedPeople.includes(person.id)}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${selectedPeople.includes(person.id) ? 'bg-white text-blue-600' : 'bg-gray-200 text-gray-600'}`}>
        {person.name.charAt(0)}
        </div>
        <span className="font-semibold text-sm">{person.name}</span>
        </SelectionCard>
      ))}
      <button onClick={() => setModal('addExistingPerson')} className="h-full min-h-[56px] flex items-center justify-center gap-2 p-3 rounded-lg text-sm font-semibold border-2 border-dashed text-gray-500 hover:bg-gray-100 transition-colors">
      <Plus size={16} /> Lägg till
      </button>
      </div>
      </div>

      </motion.div>
    )}
    </AnimatePresence>
    </div>

    <div className="flex-1 flex flex-col items-center justify-center relative min-h-[200px]">
    <canvas ref={canvasRef} width={300} height={150} className="w-full h-40" />
    <div className="text-6xl font-mono font-medium text-gray-800 mt-8 tracking-tighter">{formatTime(duration)}</div>
    </div>

    {quickNotes.length > 0 && (
      <div className="mb-6 max-h-32 overflow-y-auto">
      <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Anteckningar</h4>
      {quickNotes.map((note, idx) => (
        <div key={idx} className="text-sm text-gray-600 mb-1">
        <span className="font-mono text-xs text-blue-500 mr-2">{formatTime(note.timestamp)}</span>{note.text}
        </div>
      ))}
      </div>
    )}

    {showNoteInput && (
      <div className="mb-4 flex gap-2">
      <input
      type="text"
      autoFocus
      placeholder="Skriv anteckning..."
      className="flex-1 bg-gray-50 border-gray-200 rounded-lg text-sm p-3"
      value={currentNote}
      onChange={e => setCurrentNote(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && addQuickNote()}
      />
      <button onClick={addQuickNote} className="p-3 bg-blue-600 text-white rounded-lg">
      <Plus size={18} />
      </button>
      </div>
    )}

    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-col items-center gap-4 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">

    {!isRecording && (
      <button
      onClick={() => setIsManual(true)}
      className="flex items-center justify-center gap-2 text-blue-600 font-bold text-sm px-6 py-2.5 bg-blue-50 rounded-full hover:bg-blue-100 transition-all w-full max-w-[260px]"
      >
      <Plus size={16} /> Lägg till transkribering manuellt
      </button>
    )}

    <div className="flex justify-between items-center w-full max-w-md">

    <button
    onClick={() => isRecording ? handleCancelRecording() : navigate(-1)}
    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-bold text-sm transition-colors w-[110px]"
    >
    {isRecording ? <Trash2 size={18} /> : <X size={18} />} Avbryt
    </button>

    <motion.button
    whileTap={{ scale: 0.9 }}
    onClick={handleToggle}
    className={`h-20 w-20 shrink-0 rounded-full flex items-center justify-center shadow-xl transition-colors ${isRecording ? 'bg-red-500 shadow-red-200' : 'bg-blue-600 shadow-blue-200'}`}
    >
    {isRecording ? <Square fill="white" className="text-white" /> : <Mic fill="white" className="text-white" />}
    </motion.button>

    {isRecording ? (
      <button
      onClick={() => setShowNoteInput(!showNoteInput)}
      className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 font-bold text-sm transition-colors w-[110px]"
      >
      <StickyNote size={18} /> Notis
      </button>
    ) : (
      <div className="w-[110px]" />
    )}
    </div>
    </div>
    </div>

    <BottomSheet isOpen={modal === 'project'} onClose={() => setModal(null)} title="Skapa Nytt Projekt">
    <div className="flex flex-col gap-4">
    <input
    type="text"
    value={newProjectName}
    onChange={e => setNewProjectName(e.target.value)}
    placeholder="Projektnamn..."
    className="w-full bg-gray-100 border-gray-300 rounded-lg p-3"
    />
    <button onClick={handleAddProject} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">
    Spara Projekt
    </button>
    </div>
    </BottomSheet>

    <BottomSheet isOpen={modal === 'person'} onClose={() => setModal(null)} title="Lägg till Ny Person">
    <div className="flex flex-col gap-4">
    <input
    type="text"
    value={newPersonName}
    onChange={e => setNewPersonName(e.target.value)}
    placeholder="Namn..."
    className="w-full bg-gray-100 border-gray-300 rounded-lg p-3"
    />
    <input
    type="text"
    value={newPersonRole}
    onChange={e => setNewPersonRole(e.target.value)}
    placeholder="Yrkestitel..."
    className="w-full bg-gray-100 border-gray-300 rounded-lg p-3"
    />
    {selectedProjectId && (
      <div className="flex flex-col gap-1 mt-2">
      <label className="text-sm font-medium text-gray-600">Roll i projektet</label>
      <select
      value={newPersonGroup}
      onChange={e => setNewPersonGroup(e.target.value as MemberGroup)}
      className="w-full bg-gray-100 border-gray-300 rounded-lg p-3 text-gray-800"
      >
      <option value={MemberGroup.STEERING}>Styrgrupp</option>
      <option value={MemberGroup.CORE_TEAM}>Projektgrupp</option>
      <option value={MemberGroup.REFERENCE}>Referensgrupp</option>
      <option value={MemberGroup.STAKEHOLDER}>Intressent</option>
      <option value={MemberGroup.OTHER}>Övrig</option>
      </select>
      </div>
    )}
    <button onClick={handleAddPerson} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold mt-2">
    Spara Person
    </button>
    </div>
    </BottomSheet>

    <BottomSheet isOpen={modal === 'addExistingPerson'} onClose={() => setModal(null)} title="Lägg till Person">
    <div className="flex flex-col gap-2 p-2">
    <button onClick={() => { setModal('person')}} className="w-full text-left p-3 bg-blue-50 text-blue-700 rounded-lg font-semibold">+ Skapa ny person</button>
    <div className="max-h-60 overflow-y-auto mt-4">
    {peopleNotInProject?.map(p => (
      <button key={p.id} onClick={() => handleAddExistingPersonToProject(p.id)} className="w-full text-left p-3 hover:bg-gray-100 rounded-lg">
      {p.name}
      </button>
    ))}
    </div>
    </div>
    </BottomSheet>

    <BottomSheet isOpen={isManual} onClose={() => setIsManual(false)} title="Klistra in text">
    <div className="flex flex-col gap-4">
    <textarea
    value={manualText}
    onChange={(e) => setManualText(e.target.value)}
    placeholder="Klistra in texten här..."
    className="w-full h-64 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
    />
    <button
    onClick={handleSaveManual}
    className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all"
    >
    Spara och analysera
    </button>
    </div>
    </BottomSheet>
    </>
  );
};
