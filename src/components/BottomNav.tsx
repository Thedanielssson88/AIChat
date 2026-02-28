import { Link, useLocation } from 'react-router-dom';
import { Mic, Settings, MessageCircle, Bot } from 'lucide-react';
import { clsx } from 'clsx';

export const BottomNav = () => {
  const location = useLocation();

  // Endast de absolut viktigaste vyerna kvar i bottenmenyn
  const navItems = [
    { icon: MessageCircle, label: 'Chatt', path: '/' },
    { icon: Bot, label: 'Nano', path: '/nano' },
    { icon: Mic, label: 'Möten', path: '/dashboard' },
    { icon: Settings, label: 'Mer', path: '/settings' },
  ];

  // Göm menyn på /record och /nano
  if (location.pathname === '/record' || location.pathname === '/nano') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe pt-2 px-2 flex justify-around items-center z-50 overflow-x-auto no-scrollbar">
    {navItems.map((item) => {
      const isActive = item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path);

      return (
        <Link
        key={item.path}
        to={item.path}
        className="flex flex-col items-center p-2 min-w-[64px] flex-1 shrink-0 snap-center"
        >
        <item.icon
        size={22}
        className={clsx("transition-colors", isActive ? "text-blue-600 fill-blue-100" : "text-gray-400")}
        />
        <span className={clsx("text-[10px] mt-1 transition-colors font-medium", isActive ? "text-blue-600" : "text-gray-400")}>
        {item.label}
        </span>
        </Link>
      );
    })}
    </div>
  );
};
