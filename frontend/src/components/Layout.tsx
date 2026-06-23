import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, BrainCircuit, Activity, Cpu, LogOut, GitBranch } from 'lucide-react';
import { getAuthenticatedUser, logout } from '../services/api';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getAuthenticatedUser();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'AI Assistant', path: '/chat', icon: MessageSquare },
    { name: 'GitHub Pipelines', path: '/github-setup', icon: GitBranch },
    { name: 'Intelligence', path: '/intelligence', icon: BrainCircuit },
    { name: 'UiPath Hub', path: '/uipath-hub', icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-slate-200 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 m-0">PipelineDoc</h1>
              <span className="text-[9px] text-blue-600 font-semibold tracking-wider uppercase font-mono">Self-Healing CI/CD</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-150 group cursor-pointer ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-transform duration-150 group-hover:scale-105 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-slate-200 text-xs flex flex-col space-y-3">
          {user && (
            <div className="flex flex-col space-y-0.5 min-w-0">
              <span className="font-semibold text-slate-800 text-sm truncate">{user.name}</span>
              <span className="text-slate-500 truncate">{user.email}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-500 font-medium">Gateway Active</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm/5">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono bg-slate-50 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
              Env: Production
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium"
            >
              Docs
            </a>
          </div>
        </header>

        {/* Dynamic page contents */}
        <div className="p-6 md:p-8 max-w-7xl w-full mx-auto flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
