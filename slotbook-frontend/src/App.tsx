import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { Calendar, UserCheck, LogOut } from 'lucide-react';
import BookingPage from './pages/BookingPage.tsx';
import ManagePage from './pages/ManagePage.tsx';
import HostDashboard from './pages/HostDashboard.tsx';

export default function App() {
  const [publicEvents, setPublicEvents] = useState<any[]>([]);
  const [hostToken, setHostToken] = useState<string | null>(() => localStorage.getItem('slotbook_host_token'));
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch('/api/hosts/alex/public-events');
        if (res.ok) {
          const data = await res.json();
          setPublicEvents(data.events || []);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadEvents();
  }, [location.pathname]);

  function handleLogout() {
    localStorage.removeItem('slotbook_host_token'); window.dispatchEvent(new Event('slotbook-auth-change'));
    localStorage.removeItem('slotbook_host_profile');
    setHostToken(null);
    navigate('/alex/intro-call');
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/alex/intro-call" className="flex items-center gap-2 font-bold text-lg text-slate-800">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>Slotbook</span>
          </Link>

          <nav className="flex items-center gap-3 text-sm font-medium">
            <div className="hidden sm:flex items-center gap-2">
              {publicEvents.map((ev) => (
                <Link
                  key={ev.id}
                  to={`/alex/${ev.slug}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    location.pathname === `/alex/${ev.slug}`
                      ? 'bg-slate-200 text-slate-900 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {ev.name}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">
              <Link
                to="/host"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${
                  location.pathname === '/host'
                    ? 'bg-indigo-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Host Dashboard</span>
              </Link>

              {hostToken && (
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Logout from Host Dashboard"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 md:p-8">
        <Routes>
          <Route path="/" element={<Navigate to="/alex/intro-call" replace />} />
          <Route path="/:host/:slug" element={<BookingPage />} />
          <Route path="/bookings/:token" element={<ManagePage />} />
          <Route path="/host" element={<HostDashboard onAuthChange={setHostToken} />} />
          <Route path="*" element={<div className="p-8 text-center text-slate-500">Page not found</div>} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        Slotbook Scheduling Engine &bull; Zero Double-Bookings Guaranteed &bull; Backed by PostgreSQL
      </footer>
    </div>
  );
}
