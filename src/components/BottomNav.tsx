import { Link, useLocation } from 'react-router-dom';
import { Folder, Users, CheckSquare, MessageCircle, Settings, List, Bot } from 'lucide-react';
import { clsx } from 'clsx';

export const BottomNav = () => {
  const location = useLocation();

  const navItems = [
    { icon: MessageCircle, label: 'Chatt', path: '/' },
    { icon: Bot, label: 'Nano', path: '/nano' },
    { icon: Folder, label: 'Projekt', path: '/projects' },
    { icon: Users, label: 'Personer', path: '/people' },
    { icon: CheckSquare, label: 'Uppgifter', path: '/tasks' },
    { icon: List, label: 'Kö', path: '/queue' },
    { icon: Settings, label: 'Inställningar', path: '/settings' },
  ];

  if (location.pathname === '/record') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe pt-2 px-2 flex justify-between items-center z-50 overflow-x-auto no-scrollbar">
      {navItems.map((item) => {
        const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
        return (
          <Link key={item.path} to={item.path} className="flex flex-col items-center p-2 min-w-[60px] flex-1">
            <item.icon
              size={22}
              className={clsx("transition-colors", isActive ? "text-blue-600 fill-blue-100" : "text-gray-400")}
              strokeWidth={isActive ? 2.5 : 2}
            />
            <span className={clsx("text-[10px] mt-1 font-medium whitespace-nowrap", isActive ? "text-blue-600" : "text-gray-400")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
};
