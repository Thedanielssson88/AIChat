import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addProject } from '../services/db';
import { useNavigate } from 'react-router-dom';
import { Plus, Briefcase, FolderPlus, Users, FolderTree, ChevronRight, ArrowLeft } from 'lucide-react';

const ProjectsView: React.FC = () => {
  const navigate = useNavigate();
  const [newProjectName, setNewProjectName] = useState('');

  // Live queries för att hämta all data
  const projects = useLiveQuery(() => db.projects.toArray());
  const allMembers = useLiveQuery(() => db.projectMembers.toArray());
  const allCategories = useLiveQuery(() => db.categories.toArray());

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim() === '') return;

    try {
      await addProject({ name: newProjectName.trim() });
      setNewProjectName(''); // Töm fältet när det är sparat
    } catch (error) {
      console.error("Kunde inte skapa projekt:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* HEADER */}
      <header className="flex items-center gap-3 mb-6 pt-4 px-6 bg-white shadow-sm sticky top-0 z-10 pb-4">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 -ml-2 bg-white rounded-full shadow-sm hover:bg-gray-50 border border-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projekt</h1>
          <p className="text-gray-500 text-sm">Här är dina projekt</p>
        </div>
      </header>

      <div className="p-6 space-y-8">
        
        {/* SKAPA NYTT PROJEKT - KORT */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FolderPlus size={16} className="text-blue-500" /> Skapa Nytt Projekt
          </h3>
          <form onSubmit={handleAddProject} className="flex gap-3">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="T.ex. 'Ny Hemsida' eller 'Sälj Q3'"
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block w-full p-3 transition-colors"
              required
            />
            <button 
              type="submit" 
              disabled={!newProjectName.trim()} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm px-5 py-3 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-2"
            >
              <Plus size={18} /> Skapa
            </button>
          </form>
        </div>

        {/* LISTA MED PROJEKT */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Dina aktiva projekt</h3>
          
          {projects?.map(project => {
            // Räkna ut hur många medlemmar och kategorier just detta projekt har
            const memberCount = allMembers?.filter(m => m.projectId === project.id).length || 0;
            const categoryCount = allCategories?.filter(c => c.projectId === project.id).length || 0;

            return (
              <Link 
                to={`/project/${project.id}`} 
                key={project.id} 
                className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-gray-100 transition-all hover:border-blue-300 hover:shadow-md group"
              >
                <div className="flex items-center gap-4">
                  {/* Ikon */}
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Briefcase size={24} />
                  </div>
                  
                  {/* Text & Meta-data */}
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{project.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Users size={12} className="text-gray-400" /> {memberCount} {memberCount === 1 ? 'medlem' : 'medlemmar'}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <FolderTree size={12} className="text-gray-400" /> {categoryCount} {categoryCount === 1 ? 'kategori' : 'kategorier'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pil till höger */}
                <ChevronRight className="text-gray-300 group-hover:text-blue-500 transition-colors" />
              </Link>
            );
          })}

          {/* Om det är tomt */}
          {projects && projects.length === 0 && (
            <div className="text-center p-8 bg-transparent border-2 border-dashed border-gray-200 rounded-2xl">
              <p className="text-gray-400 text-sm">Du har inte skapat några projekt än.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ProjectsView;
