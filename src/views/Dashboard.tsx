import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, Clock, Calendar, Search, AlertTriangle, Activity, FolderKanban, CheckSquare, Users } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { hasApiKey } from '../services/geminiService';
import { clsx } from 'clsx';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);

  // STATES FOR FILTERS
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [filterTag, setFilterTag] = useState('');

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const keyExists = await hasApiKey();
        setIsApiKeyMissing(!keyExists);
      } catch (e) {
        console.error("Kunde inte kolla API-nyckel", e);
      }
    };
    checkApiKey();
  }, []);

  const meetings = useLiveQuery(() => db.meetings.orderBy('date').reverse().toArray());
  const people = useLiveQuery(() => db.people.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const activeJobs = useLiveQuery(() => db.processingJobs.where('status').anyOf(['pending', 'processing']).toArray()) || [];

  const activeJobsCount = activeJobs.length;

  // COMBINED FILTERING LOGIC
  const filteredMeetings = useMemo(() => {
    return meetings?.filter(meeting => {
      // --- 1. DROPDOWN-FILTER ---
      if (filterProject && meeting.projectId !== filterProject) return false;
      if (filterCategory && meeting.categoryId !== filterCategory) return false;
      if (filterSubcategory && meeting.subCategoryName !== filterSubcategory) return false;
      if (filterTag && (!meeting.tagIds || !meeting.tagIds.includes(filterTag))) return false;

      // --- 2. DEEP SEARCH (FRITEXT) ---
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        let matchesSearch = false;

        if (meeting.title?.toLowerCase().includes(query)) matchesSearch = true;
        else if (meeting.protocol?.summary?.toLowerCase().includes(query)) matchesSearch = true;
        else if (meeting.protocol?.decisions?.some(d => d.toLowerCase().includes(query))) matchesSearch = true;
        else if (meeting.transcription?.some(t => t.text.toLowerCase().includes(query) || t.speaker?.toLowerCase().includes(query))) matchesSearch = true;
        else {
          const meetingPeople = people?.filter(p => meeting.participantIds?.includes(p.id)) || [];
          if (meetingPeople.some(p => p.name.toLowerCase().includes(query))) matchesSearch = true;
        }

        if (!matchesSearch) return false;
      }

      return true;
    }).map(m => ({ // Enrich the final filtered list
      ...m,
      projectName: projects?.find(p => p.id === m.projectId)?.name,
    }));
  }, [meetings, people, projects, categories, searchQuery, filterProject, filterCategory, filterSubcategory, filterTag]);


  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-32 relative">
    <header className="flex justify-between items-center mb-6 pt-4">
    <div>
    <h1 className="text-2xl font-bold text-gray-900">Möten</h1>
    <p className="text-gray-500 text-sm">Dina dokumenterade samtal.</p>
    </div>

    {/* Snabbknappar för genvägar */}
    <div className="flex items-center gap-1.5 sm:gap-2">
    <Link to="/projects" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 transition border border-gray-100 text-gray-500" title="Projekt">
    <FolderKanban size={18} />
    </Link>
    <Link to="/tasks" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 transition border border-gray-100 text-gray-500" title="Uppgifter">
    <CheckSquare size={18} />
    </Link>
    <Link to="/people" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 transition border border-gray-100 text-gray-500" title="Personer">
    <Users size={18} />
    </Link>
    <Link to="/queue" className="relative p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 transition border border-gray-100" title="Kö">
    <Activity size={18} className={activeJobsCount > 0 ? "text-blue-600" : "text-gray-500"} />
    {activeJobsCount > 0 && (
      <span className="absolute top-0 right-0 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white"></span>
    )}
    </Link>
    <div className="h-8 w-8 bg-gray-200 rounded-full overflow-hidden border border-gray-200 shadow ml-1">
    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Avatar" />
    </div>
    </div>
    </header>

    {isApiKeyMissing && (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-xl shadow-sm flex items-start gap-3">
      <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
      <div className="flex-1">
      <h3 className="font-bold text-yellow-800 text-sm">API-nyckel saknas</h3>
      <p className="text-yellow-700 text-xs mt-1">Gå till inställningar för att aktivera AI.</p>
      </div>
      </div>
    )}

    {/* FILTER MENUS */}
    <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 space-y-4 border border-gray-100">
    <div className="relative">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
    <Search className="h-5 w-5 text-gray-400" />
    </div>
    <input
    type="text"
    placeholder="Sök i allt (titlar, transkribering, beslut...)"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-3 pl-10 focus:ring-blue-500 focus:border-blue-500"
    />
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    <select
    value={filterProject}
    onChange={(e) => setFilterProject(e.target.value)}
    className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-2.5"
    >
    <option value="">Alla Projekt</option>
    {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>

    <select
    value={filterCategory}
    onChange={(e) => setFilterCategory(e.target.value)}
    className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-2.5"
    >
    <option value="">Alla Kategorier</option>
    {categories
      ?.filter(c => !filterProject || c.projectId === filterProject)
      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
    }
    </select>

    <select
    value={filterSubcategory}
    onChange={(e) => setFilterSubcategory(e.target.value)}
    className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-2.5"
    >
    <option value="">Underkategori</option>
    </select>

    <select
    value={filterTag}
    onChange={(e) => setFilterTag(e.target.value)}
    className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl p-2.5"
    >
    <option value="">Tagg</option>
    </select>
    </div>
    </div>


    <div className="space-y-4">
    {filteredMeetings && filteredMeetings.length === 0 ? (
      <p className="text-center text-gray-400 mt-10 text-sm italic">Inga möten hittades.</p>
    ) : (
      filteredMeetings?.map(meeting => (
        <Link key={meeting.id} to={`/meeting/${meeting.id}`} className="block bg-white p-5 rounded-2xl shadow-sm border border-gray-100 transition-transform active:scale-[0.98]">
        <div className="flex justify-between items-start mb-1">
        <div className="flex-1">
        <h3 className="font-bold text-gray-900 leading-tight">{meeting.title}</h3>
        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tight mt-0.5">{meeting.projectName || 'Osorterat'}</p>
        </div>
        {!meeting.isProcessed && (
          <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">I kö</span>
        )}
        </div>

        {meeting.protocol?.summary && (
          <p className="text-gray-600 text-xs line-clamp-2 mt-2 leading-relaxed">
          {meeting.protocol.summary}
          </p>
        )}

        <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-4 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1"><Calendar size={12}/> {new Date(meeting.date).toLocaleDateString()}</div>
        <div className="flex items-center gap-1"><Clock size={12}/> {Math.floor(meeting.duration / 60)} min</div>
        </div>
        </Link>
      ))
    )}
    </div>

    <button
    onClick={() => navigate('/record')}
    className="fixed bottom-24 right-6 w-16 h-16 bg-red-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-red-700 active:scale-90 transition-all z-50 border-4 border-white"
    >
    <Mic size={28} fill="white" />
    </button>
    </div>
  );
};
