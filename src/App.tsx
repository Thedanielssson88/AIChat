import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { seedDatabase } from './services/db';
import { processQueue } from './services/queueService';
import { initLocalEngine } from './services/geminiService';
import { ChatView } from './views/ChatView';
import { RecordView } from './views/RecordView';
import { TasksView } from './views/TasksView';
import { PeopleView } from './views/PeopleView';
import { PersonDetail } from './views/PersonDetail';
import { SettingsView } from './views/SettingsView';
import ProjectsView from './views/ProjectsView';
import ProjectDetailView from './views/ProjectDetailView';
import { MeetingDetail } from './views/MeetingDetail';
import { MeetingDetailsView } from './views/MeetingDetailsView';
import { QueueView } from './views/QueueView';
import { BottomNav } from './components/BottomNav';

const HardwareBackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: any = null;
    const initBackListener = async () => {
      try {
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
      if (summaryMode === 'local') {
        initLocalEngine((percent, text) => {
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
            <Route path="/" element={<ChatView />} />
            <Route path="/projects" element={<ProjectsView />} />
            <Route path="/project/:projectId" element={<ProjectDetailView />} />
            <Route path="/meeting/:id" element={<MeetingDetail />} />
            <Route path="/meeting/:id/details" element={<MeetingDetailsView />} />
            <Route path="/people" element={<PeopleView />} />
            <Route path="/person/:id" element={<PersonDetail />} />
            <Route path="/tasks" element={<TasksView />} />
            <Route path="/record" element={<RecordView />} />
            <Route path="/queue" element={<QueueView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
