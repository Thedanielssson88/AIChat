import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { seedDatabase } from './services/db';
import { processQueue } from './services/queueService';
import { initLocalEngine } from './services/geminiService';
import { Dashboard } from './views/Dashboard';
import { RecordView } from './views/RecordView';
import { DayView } from './views/DayView';
import { TasksView } from './views/TasksView';
import { PeopleView } from './views/PeopleView';
import { PersonDetail } from './views/PersonDetail';
import { SettingsView } from './views/SettingsView';
import ProjectsView from './views/ProjectsView';
import ProjectDetailView from './views/ProjectDetailView';
import { QueueView } from './views/QueueView';
import { TagsView } from './views/TagsView';
import { BottomNav } from './components/BottomNav';

// Vi importerar inte App direkt för att undvika krasch vid import på webben
const HardwareBackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Om vi inte är på en mobil (Native), gör ingenting
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let listener: any = null;

    const initBackListener = async () => {
      try {
        // Dynamisk import för att undvika krasch på webben
        const { App: CapApp } = await import('@capacitor/app');
        listener = await CapApp.addListener('backButton', () => {
          if (location.pathname === '/') {
            CapApp.exitApp();
          } else {
            navigate(-1);
          }
        });
      } catch (e) {
        console.error("Backbutton handler error:", e);
      }
    };

    initBackListener();

    return () => {
      if (listener) listener.remove();
    };
  }, [location.pathname, navigate]);

  return null;
};

function App() {
  useEffect(() => {
    try {
      seedDatabase();
      processQueue();
      
      const summaryMode = localStorage.getItem('SUMMARY_MODE');
      // Om användaren har valt 'local' som sammanfattningsmetod, förladda filen i bakgrunden.
      if (summaryMode === 'local') {
        console.log("App start: Påbörjar förladdning av lokal modell...");
        initLocalEngine((percent, text) => {
          // Loggar framsteg i konsolen så du ser att den hittar din GGUF-fil
          if (percent % 20 === 0) console.log(`Laddar AI: ${percent}% - ${text}`);
        });
      }
    } catch (err) {
      console.error("App startup error:", err);
    }
  }, []);

  return (
    <BrowserRouter>
      <HardwareBackButtonHandler /> 
      <div className="max-w-md mx-auto bg-white min-h-screen relative shadow-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/record" element={<RecordView />} />
            <Route path="/day/:id" element={<DayView />} />
            <Route path="/tasks" element={<TasksView />} />
            <Route path="/people" element={<PeopleView />} />
            <Route path="/person/:id" element={<PersonDetail />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/projects" element={<ProjectsView />} />
            <Route path="/project/:projectId" element={<ProjectDetailView />} />
            <Route path="/queue" element={<QueueView />} />
            <Route path="/tags" element={<TagsView />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
