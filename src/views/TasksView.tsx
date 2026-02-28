import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { Task } from '../types';
import { Plus, Check, Trash2, PlayCircle, Filter, Briefcase, ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';

const AVATAR_COLORS = [
  'bg-red-200 text-red-800', 'bg-blue-200 text-blue-800', 'bg-green-200 text-green-800',
  'bg-yellow-200 text-yellow-800', 'bg-purple-200 text-purple-800', 'bg-pink-200 text-pink-800'
];

export const TasksView: React.FC = () => {
  const navigate = useNavigate();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | undefined>(undefined);
  
  const [showFilters, setShowFilters] = useState(false);
  const [filterProject, setFilterProject] = useState<string | undefined>();
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [filterSubcategory, setFilterSubcategory] = useState<string | undefined>(); // NYTT filter

  const tasks = useLiveQuery(() => db.tasks.orderBy('createdAt').reverse().toArray());
  const people = useLiveQuery(() => db.people.toArray());
  const meetings = useLiveQuery(() => db.meetings.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const allCategories = useLiveQuery(() => db.categories.toArray()); // Laddar alla kategorier direkt

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    await db.tasks.add({
      id: crypto.randomUUID(),
      title: newTaskTitle.trim(),
      status: 'todo',
      assignedToId: assignedTo,
      createdAt: new Date().toISOString(),
      projectId: filterProject,
    });
    setNewTaskTitle('');
    setAssignedTo(undefined);
  };
  
  const toggleTaskStatus = async (task: Task) => {
    await db.tasks.update(task.id, {
      status: task.status === 'done' ? 'todo' : 'done'
    });
  };

  const deleteTask = async (id: string) => {
    if (window.confirm("Är du säker på att du vill radera uppgiften?")) {
      await db.tasks.delete(id);
    }
  };

  const handleLinkClick = (e: React.MouseEvent, meetingId: string, timestamp?: number) => {
    e.stopPropagation();
    navigate(`/meeting/${meetingId}?tab=transcript&time=${timestamp || 0}`);
  };

  // 1. Berika uppgifterna så de vet vilket projekt/kategori/underkategori de tillhör via sitt möte
  const enrichedTasks = useMemo(() => {
    if (!tasks || !people || !meetings || !projects || !allCategories) return [];
    
    return tasks.map(task => {
      const meeting = meetings.find(m => m.id === task.linkedMeetingId);
      
      const resolvedProjectId = task.projectId || meeting?.projectId;
      const resolvedCategoryId = meeting?.categoryId;
      const resolvedSubCategoryName = meeting?.subCategoryName;

      return {
        ...task,
        resolvedProjectId,
        resolvedCategoryId,
        resolvedSubCategoryName,
        person: people.find(p => p.id === task.assignedToId),
        meeting: meeting,
        project: projects.find(p => p.id === resolvedProjectId),
      };
    });
  }, [tasks, people, meetings, projects, allCategories]);

  // 2. Filtrera de berikade uppgifterna
  const filteredTasks = useMemo(() => {
    return enrichedTasks.filter(task => {
      const projectMatch = !filterProject || task.resolvedProjectId === filterProject;
      const categoryMatch = !filterCategory || task.resolvedCategoryId === filterCategory;
      const subCategoryMatch = !filterSubcategory || task.resolvedSubCategoryName === filterSubcategory;
      
      return projectMatch && categoryMatch && subCategoryMatch;
    });
  }, [enrichedTasks, filterProject, filterCategory, filterSubcategory]);
  
  const activeFilters = [filterProject, filterCategory, filterSubcategory].filter(Boolean).length;
  
  // Hjälpvariabler för dynamiska listor
  const projectCategories = allCategories?.filter(c => c.projectId === filterProject) || [];
  const activeCategory = allCategories?.find(c => c.id === filterCategory);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="flex items-center gap-3 mb-6 pt-4 px-6 bg-white shadow-sm sticky top-0 z-10 pb-4">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 -ml-2 bg-white rounded-full shadow-sm hover:bg-gray-50 border border-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Uppgifter</h1>
          <p className="text-gray-500 text-sm">Här är dina uppgifter</p>
        </div>
      </header>

      <div className="p-6 space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
           <form onSubmit={handleAddTask} className="space-y-3">
            <input
              type="text"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              placeholder="Vad behöver göras?"
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-3 w-full focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex gap-3">
              <select 
                value={assignedTo || ''}
                onChange={e => setAssignedTo(e.target.value || undefined)}
                className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-3 w-full"
              >
                <option value="">Ingen tilldelad</option>
                {people?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="submit" disabled={!newTaskTitle.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Plus size={18} /> Lägg till
              </button>
            </div>
           </form>
        </div>
        
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dina uppgifter</h3>
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 text-sm font-bold text-blue-600 relative">
            <Filter size={14} /> 
            {showFilters ? 'Dölj Filter' : 'Visa Filter'}
            {activeFilters > 0 && <span className="absolute -top-1 -right-2 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center">{activeFilters}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 gap-3">
            <select value={filterProject || ''} onChange={e => {
                setFilterProject(e.target.value || undefined); 
                setFilterCategory(undefined);
                setFilterSubcategory(undefined);
              }} className="bg-gray-50 border border-gray-200 text-sm rounded-xl p-3 w-full">
              <option value="">Alla Projekt</option>
              {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            
            <select value={filterCategory || ''} onChange={e => {
                setFilterCategory(e.target.value || undefined);
                setFilterSubcategory(undefined);
              }} className="bg-gray-50 border border-gray-200 text-sm rounded-xl p-3 w-full" disabled={!filterProject}>
              <option value="">Alla Kategorier</option>
              {projectCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Visas bara om kategorin har underkategorier */}
            <select value={filterSubcategory || ''} onChange={e => setFilterSubcategory(e.target.value || undefined)} className="bg-gray-50 border border-gray-200 text-sm rounded-xl p-3 w-full" disabled={!filterCategory || !activeCategory?.subCategories?.length}>
              <option value="">Alla Underkategorier</option>
              {activeCategory?.subCategories?.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>
        )}
        
        <div className="space-y-3">
          {filteredTasks.map(task => {
            const isDone = task.status === 'done';
            return (
              <div 
                key={task.id} 
                onClick={() => toggleTaskStatus(task)}
                className={clsx(
                  "bg-white p-4 rounded-2xl shadow-sm border transition-all cursor-pointer group flex items-start gap-4",
                  isDone ? "border-gray-100 opacity-60 hover:opacity-100" : "border-gray-200 hover:border-blue-300 hover:shadow-md"
                )}
              >
                <div className={clsx("mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors", isDone ? "bg-green-500 border-green-500" : "border-gray-300 group-hover:border-blue-400")}>
                  {isDone && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>

                <div className="flex-grow">
                  <p className={clsx("font-medium leading-snug transition-all", isDone ? "text-gray-500 line-through" : "text-gray-900")}>
                    {task.title}
                  </p>
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    {task.project && (
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded-md flex items-center gap-1"><Briefcase size={12} /> {task.project.name}</span>
                    )}
                    {task.person && (
                      <div className="flex items-center gap-2">
                        <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold", task.person.avatarColor || AVATAR_COLORS[0])}>
                           {task.person.name.charAt(0)}
                        </div>
                        <span className="text-xs font-medium text-gray-600">{task.person.name}</span>
                      </div>
                    )}
                    {task.meeting && (
                       <button 
                         onClick={(e) => handleLinkClick(e, task.meeting!.id, task.originTimestamp)}
                         className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors"
                       >
                         <PlayCircle size={14} /> 
                         <span className="font-semibold">{task.meeting.title}</span>
                       </button>
                    )}
                  </div>
                </div>

                 <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Trash2 size={16} />
                 </button>
              </div>
            )
          })}
           {filteredTasks.length === 0 && (
             <div className="text-center p-8 bg-transparent border-2 border-dashed border-gray-200 rounded-2xl">
              <p className="text-gray-400 text-sm">{activeFilters > 0 ? 'Inga uppgifter matchar ditt filter.' : 'Du har inga uppgifter. Skapa en ovan!'}</p>
            </div>
           )}
        </div>
      </div>
    </div>
  );
};