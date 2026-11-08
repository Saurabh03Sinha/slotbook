import os

files = {
    "package.json": """{
  "name": "slotbook-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "luxon": "^3.5.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.2",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.1"
  }
}""",
    "tsconfig.json": """{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}""",
    "vite.config.ts": """import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});""",
    "tailwind.config.js": """/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
      },
    },
  },
  plugins: [],
};""",
    "postcss.config.js": """export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};""",
    "index.html": """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Slotbook | Reliable Scheduling</title>
  </head>
  <body class="bg-slate-50 text-slate-900 font-sans antialiased min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>""",
    "src/index.css": """@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  min-height: 100vh;
}""",
    "src/main.tsx": """import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);""",
    "src/App.tsx": """import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Calendar, UserCheck } from 'lucide-react';
import BookingPage from './pages/BookingPage.tsx';
import ManagePage from './pages/ManagePage.tsx';
import HostDashboard from './pages/HostDashboard.tsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/alex/intro-call" className="flex items-center gap-2 font-bold text-lg text-slate-800">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>Slotbook</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link to="/alex/intro-call" className="text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition">Public: 1-on-1 Call</Link>
            <Link to="/alex/office-hours" className="text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition">Public: Office Hours (Group)</Link>
            <Link to="/host" className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition">
              <UserCheck className="w-4 h-4" />
              <span>Host Dashboard</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 md:p-8">
        <Routes>
          <Route path="/" element={<Navigate to="/alex/intro-call" replace />} />
          <Route path="/:host/:slug" element={<BookingPage />} />
          <Route path="/bookings/:token" element={<ManagePage />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="*" element={<div className="p-8 text-center text-slate-500">Page not found</div>} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        Slotbook Scheduling Engine &bull; Zero Double-Bookings Guaranteed &bull; Backed by PostgreSQL
      </footer>
    </div>
  );
}""",
    "src/pages/BookingPage.tsx": """import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Clock, Users, Globe, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

interface Slot {
  startUtc: string;
  endUtc: string;
  startLocal: string;
  endLocal: string;
  remainingCapacity: number;
  totalCapacity: number;
}

interface EventMeta {
  name: string;
  slug: string;
  durationMinutes: number;
  capacity: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeMinutes: number;
}

const COMMON_TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
];

export default function BookingPage() {
  const { host = 'alex', slug = 'intro-call' } = useParams();
  const navigate = useNavigate();
  const [tz, setTz] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventMeta, setEventMeta] = useState<EventMeta | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [hold, setHold] = useState<{ holdId: string; expiresAt: string } | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [holding, setHolding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  useEffect(() => {
    async function loadSlots() {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);
      setHold(null);
      try {
        const res = await fetch(`/api/hosts/${host}/events/${slug}/slots?tz=${encodeURIComponent(tz)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        const data = await res.json();
        setEventMeta(data.event);
        setSlots(data.slots);
        if (data.slots.length > 0) {
          setSelectedDate(DateTime.fromISO(data.slots[0].startLocal, { zone: tz }).toFormat('yyyy-MM-dd'));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch slots');
      } finally {
        setLoading(false);
      }
    }
    loadSlots();
  }, [host, slug, tz]);

  const groupedDates = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot.startLocal, { zone: tz });
      const dateKey = dt.toFormat('yyyy-MM-dd');
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(slot);
    }
    return map;
  }, [slots, tz]);

  useEffect(() => {
    if (!hold) return;
    const interval = setInterval(() => {
      const diffSec = Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000);
      if (diffSec <= 0) {
        clearInterval(interval);
        setHold(null);
        setSelectedSlot(null);
        setError('Your 5-minute hold expired. Please pick a slot again.');
      } else {
        setSecondsRemaining(diffSec);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [hold]);

  async function handleSelectSlot(slot: Slot) {
    setSelectedSlot(slot);
    setHolding(true);
    setError(null);
    const idempotencyKey = `hold-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await fetch('/api/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ host, slug, slotStart: slot.startUtc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to place hold on slot');
      setHold({ holdId: data.holdId, expiresAt: data.holdExpiresAt || data.expiresAt });
      setSecondsRemaining(Math.max(0, Math.floor((new Date(data.holdExpiresAt || data.expiresAt).getTime() - Date.now()) / 1000)));
    } catch (err: any) {
      setSelectedSlot(null);
      setError(err.message || 'Slot is no longer available');
    } finally {
      setHolding(false);
    }
  }

  async function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!hold || !guestName || !guestEmail) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/holds/${hold.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: guestName, email: guestEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Confirmation failed');
      navigate(`/bookings/${data.manageToken}`);
    } catch (err: any) {
      setError(err.message || 'Confirmation failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {hold && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Slot reserved for 5 minutes while you complete details</span>
          </div>
          <div className="font-mono font-bold bg-amber-200 px-2.5 py-0.5 rounded text-amber-950">
            {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
          </div>
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-center gap-2 text-sm text-rose-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        <div className="p-6 md:p-8 bg-slate-50/60">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">Host: @{host}</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">{eventMeta ? eventMeta.name : 'Loading event...'}</h1>
          <div className="space-y-3 text-sm text-slate-600 mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>{eventMeta ? `${eventMeta.durationMinutes} minutes` : '...'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <span>{eventMeta?.capacity === 1 ? '1-on-1 Session' : `Group Session (Up to ${eventMeta?.capacity} guests)`}</span>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" /> Your Time Zone
            </label>
            <select value={tz} onChange={(e) => setTz(e.target.value)} disabled={!!hold} className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {COMMON_TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </div>
        </div>
        <div className="p-6 md:p-8 md:col-span-2">
          {loading ? (
            <div className="py-16 text-center text-slate-400">Loading available slots...</div>
          ) : hold && selectedSlot ? (
            <div>
              <button type="button" onClick={() => { setHold(null); setSelectedSlot(null); }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium mb-6">
                <ArrowLeft className="w-3.5 h-3.5" /> Change Selected Slot
              </button>
              <div className="mb-6 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Held Appointment Slot</div>
                <div className="text-base font-bold text-slate-900 mt-1">{DateTime.fromISO(selectedSlot.startLocal, { zone: tz }).toFormat('cccc, MMMM d, yyyy')}</div>
                <div className="text-sm text-indigo-900 mt-0.5">{DateTime.fromISO(selectedSlot.startLocal, { zone: tz }).toFormat('h:mm a')} &ndash; {DateTime.fromISO(selectedSlot.endLocal, { zone: tz }).toFormat('h:mm a')} ({tz})</div>
              </div>
              <form onSubmit={handleConfirmBooking} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">Your Full Name</label>
                  <input type="text" required value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Priya Sharma" className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">Email Address</label>
                  <input type="email" required value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="priya@example.com" className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <button type="submit" disabled={confirming} className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{confirming ? 'Confirming...' : 'Confirm Appointment'}</span>
                </button>
              </form>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-4">Select Date & Time</h2>
              {slots.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">No upcoming slots found in the next 30 days for this time zone.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Available Dates</label>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {Array.from(groupedDates.keys()).map((dStr) => {
                        const dateObj = DateTime.fromISO(dStr, { zone: tz });
                        const isSelected = selectedDate === dStr;
                        return (
                          <button key={dStr} type="button" onClick={() => setSelectedDate(dStr)} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                            <span>{dateObj.toFormat('EEE, MMM d')}</span>
                            <span className="text-[10px] opacity-80">{groupedDates.get(dStr)?.length} slots</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Times for {selectedDate ? DateTime.fromISO(selectedDate, { zone: tz }).toFormat('MMM d') : ''}</label>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {(groupedDates.get(selectedDate) || []).map((slot) => {
                        const timeStr = DateTime.fromISO(slot.startLocal, { zone: tz }).toFormat('h:mm a');
                        return (
                          <button key={slot.startUtc} type="button" disabled={holding} onClick={() => handleSelectSlot(slot)} className="w-full py-2.5 px-3 rounded-lg border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 text-slate-800 text-xs font-semibold flex items-center justify-between transition group">
                            <span className="text-indigo-600 group-hover:underline">{timeStr}</span>
                            {slot.totalCapacity > 1 && <span className="text-[10px] text-slate-500 font-normal">{slot.remainingCapacity}/{slot.totalCapacity} left</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}""",
    "src/pages/ManagePage.tsx": """import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Calendar, CheckCircle2, Clock, Download, XCircle, RefreshCw, AlertCircle, User } from 'lucide-react';

export default function ManagePage() {
  const { token } = useParams<{ token: string }>();
  const [booking, setBooking] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [newSlotStart, setNewSlotStart] = useState<string>('');
  const [rescheduling, setRescheduling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  useEffect(() => {
    async function loadBooking() {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bookings/${token}`);
        if (!res.ok) throw new Error('Booking not found');
        const data = await res.json();
        setBooking(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load booking');
      } finally {
        setLoading(false);
      }
    }
    loadBooking();
  }, [token]);

  async function openReschedule() {
    if (!booking) return;
    setShowReschedule(true);
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/hosts/${booking.hostUsername}/events/${booking.eventSlug}/slots?tz=${encodeURIComponent(localTz)}`);
      const data = await res.json();
      setAvailableSlots(data.slots || []);
      if (data.slots?.length > 0) setNewSlotStart(data.slots[0].startUtc);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newSlotStart) return;
    setRescheduling(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotStart: newSlotStart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule');
      setBooking((prev: any) => (prev ? { ...prev, startsAt: data.startsAt, endsAt: data.endsAt } : null));
      setShowReschedule(false);
    } catch (err: any) {
      setError(err.message || 'Reschedule failed');
    } finally {
      setRescheduling(false);
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || 'Guest rescheduled plans' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      setBooking((prev: any) => prev ? { ...prev, status: 'cancelled', cancellationReason: cancelReason, cancelledBy: 'guest' } : null);
      setShowCancel(false);
    } catch (err: any) {
      setError(err.message || 'Cancellation failed');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-slate-500">Loading booking details...</div>;
  if (error || !booking) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900 mb-1">Booking Not Found</h2>
        <p className="text-xs text-slate-600 mb-4">{error || 'This link may have expired or is invalid.'}</p>
        <Link to="/" className="text-xs font-semibold text-indigo-600 hover:underline">Return to Booking Page</Link>
      </div>
    );
  }

  const startLocal = DateTime.fromISO(booking.startsAt, { zone: localTz });
  const endLocal = DateTime.fromISO(booking.endsAt, { zone: localTz });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
            {booking.status === 'confirmed' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Confirmed</> : <><XCircle className="w-3.5 h-3.5" /> Cancelled</>}
          </span>
          <span className="text-xs text-slate-400 font-mono">ID: {booking.id.slice(0, 8)}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{booking.eventName}</h1>
        <p className="text-xs text-slate-500 mb-6">Hosted by {booking.hostName} (@{booking.hostUsername})</p>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 mb-6 text-sm">
          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900">{startLocal.toFormat('cccc, MMMM d, yyyy')}</div>
              <div className="text-xs text-slate-600">{startLocal.toFormat('h:mm a')} &ndash; {endLocal.toFormat('h:mm a')} ({localTz})</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-700">{booking.durationMinutes} Minutes</span>
          </div>
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-700">{booking.guestName} ({booking.guestEmail})</span>
          </div>
        </div>
        {booking.cancellationReason && (
          <div className="mb-6 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900">
            <span className="font-semibold">Cancellation reason:</span> {booking.cancellationReason}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
          <a href={`/api/bookings/${token}/invite.ics`} download className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition">
            <Download className="w-3.5 h-3.5" />
            <span>Download .ics</span>
          </a>
          {booking.status === 'confirmed' && (
            <>
              <button type="button" onClick={openReschedule} className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reschedule</span>
              </button>
              <button type="button" onClick={() => setShowCancel(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition ml-auto">
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </>
          )}
        </div>
      </div>
      {showReschedule && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Reschedule Appointment</h3>
            <p className="text-xs text-slate-500 mb-4">Choose a new available slot in {localTz}:</p>
            {loadingSlots ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading open slots...</div>
            ) : availableSlots.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">No alternate slots available.</div>
            ) : (
              <form onSubmit={handleReschedule} className="space-y-4">
                <select value={newSlotStart} onChange={(e) => setNewSlotStart(e.target.value)} className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {availableSlots.map((s) => (
                    <option key={s.startUtc} value={s.startUtc}>
                      {DateTime.fromISO(s.startLocal, { zone: localTz }).toFormat('EEE, MMM d @ h:mm a')}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowReschedule(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100">Close</button>
                  <button type="submit" disabled={rescheduling} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white">{rescheduling ? 'Moving...' : 'Confirm New Slot'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {showCancel && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Cancel Appointment</h3>
            <p className="text-xs text-slate-500 mb-4">Are you sure you want to cancel this booking?</p>
            <form onSubmit={handleCancel} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Cancellation (Optional)</label>
                <input type="text" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Sudden travel conflict" className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowCancel(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100">Keep Booking</button>
                <button type="submit" disabled={cancelling} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white">{cancelling ? 'Cancelling...' : 'Yes, Cancel'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}""",
    "src/pages/HostDashboard.tsx": """import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { Plus, Bell } from 'lucide-react';

export default function HostDashboard() {
  const [activeTab, setActiveTab] = useState<'events' | 'bookings' | 'notifications' | 'settings'>('bookings');
  const [apiKey, setApiKey] = useState('demo-host-secret-key');
  const [hostProfile, setHostProfile] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventSlug, setNewEventSlug] = useState('');
  const [newEventDuration, setNewEventDuration] = useState(30);
  const [newEventCapacity, setNewEventCapacity] = useState(1);
  const [newEventBufBefore, setNewEventBufBefore] = useState(10);
  const [newEventBufAfter, setNewEventBufAfter] = useState(10);
  const [newTz, setNewTz] = useState('America/New_York');

  async function loadAllData() {
    setLoading(true);
    try {
      const headers = { 'x-api-key': apiKey };
      const [hostRes, evRes, bkRes, notifRes] = await Promise.all([
        fetch('/api/host/me', { headers }).then((r) => r.json()),
        fetch('/api/host/events', { headers }).then((r) => r.json()),
        fetch('/api/host/bookings', { headers }).then((r) => r.json()),
        fetch('/api/notifications').then((r) => r.json()),
      ]);
      setHostProfile(hostRes);
      if (hostRes?.timeZone) setNewTz(hostRes.timeZone);
      setEvents(evRes.events || []);
      setBookings(bkRes.bookings || []);
      setNotifications(notifRes.events || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAllData(); }, [apiKey]);

  async function handleUpdateTimezone(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ timeZone: newTz }),
      });
      if (!res.ok) throw new Error('Failed to update timezone');
      setMessage('Host home time zone updated successfully!');
      loadAllData();
    } catch (err: any) {
      setMessage(err.message);
    }
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          name: newEventName,
          slug: newEventSlug,
          durationMinutes: Number(newEventDuration),
          capacity: Number(newEventCapacity),
          bufferBeforeMinutes: Number(newEventBufBefore),
          bufferAfterMinutes: Number(newEventBufAfter),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create event');
      }
      setShowNewEvent(false);
      setMessage(`Event '${newEventSlug}' created!`);
      loadAllData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleCancelBookingAsHost(id: string) {
    const reason = prompt('Please enter a cancellation reason for the guest:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/host/bookings/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to cancel booking');
      setMessage('Booking cancelled by host.');
      loadAllData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Host Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Signed in as <strong>{hostProfile?.name || 'Alex Rivera'}</strong> (@{hostProfile?.username || 'alex'}) &bull; Home Timezone:{' '}
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-indigo-700">{hostProfile?.timeZone || 'America/New_York'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} title="Host API Key" className="text-xs px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg w-44" />
          <button onClick={loadAllData} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Refresh</button>
        </div>
      </div>
      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 rounded-xl flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button onClick={() => setActiveTab('bookings')} className={`px-3 py-1.5 rounded-lg transition ${activeTab === 'bookings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Upcoming Bookings ({bookings.length})</button>
        <button onClick={() => setActiveTab('events')} className={`px-3 py-1.5 rounded-lg transition ${activeTab === 'events' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Event Types ({events.length})</button>
        <button onClick={() => setActiveTab('notifications')} className={`px-3 py-1.5 rounded-lg transition ${activeTab === 'notifications' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Notifications Sink ({notifications.length})</button>
        <button onClick={() => setActiveTab('settings')} className={`px-3 py-1.5 rounded-lg transition ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Host Timezone Settings</button>
      </div>
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading dashboard data...</div>
      ) : activeTab === 'bookings' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Confirmed Bookings & Active Holds</h2>
            <span className="text-xs text-slate-500">Live PostgreSQL state</span>
          </div>
          {bookings.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No active upcoming bookings yet. Book a slot from the public page to see it here!</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {bookings.map((b) => (
                <div key={b.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{b.eventName}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{b.status}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1 flex items-center gap-3">
                      <span>{DateTime.fromISO(b.startsAt, { zone: hostProfile?.timeZone }).toFormat('EEE, MMM d, yyyy @ h:mm a')} ({hostProfile?.timeZone})</span>
                      <span>&bull;</span>
                      <span>Guest: <strong>{b.guestName || 'Pending Hold'}</strong> ({b.guestEmail || '...'})</span>
                    </div>
                  </div>
                  {b.status === 'confirmed' && (
                    <button type="button" onClick={() => handleCancelBookingAsHost(b.id)} className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-700 hover:bg-rose-100">Cancel with Reason</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'events' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Host Event Types</h2>
            <button onClick={() => setShowNewEvent(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>Create Event Type</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((ev) => (
              <div key={ev.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">{ev.name}</h3>
                  <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">/{ev.slug}</span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div>Duration: <strong>{ev.durationMinutes} min</strong> &bull; Capacity: <strong>{ev.capacity}</strong></div>
                  <div>Buffers: <strong>{ev.bufferBeforeMinutes}m</strong> before / <strong>{ev.bufferAfterMinutes}m</strong> after</div>
                  <div>Notice: <strong>{ev.minimumNoticeMinutes / 60}h</strong> min &bull; Horizon: <strong>{ev.bookingHorizonDays}d</strong></div>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <a href={`/alex/${ev.slug}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">View Public Page &rarr;</a>
                </div>
              </div>
            ))}
          </div>
          {showNewEvent && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
                <h3 className="text-base font-bold text-slate-900 mb-3">Create New Event Type</h3>
                <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700">Name</label>
                    <input required value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="e.g. Quick Sync" className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Slug</label>
                    <input required pattern="^[a-z0-9-]+$" value={newEventSlug} onChange={(e) => setNewEventSlug(e.target.value.toLowerCase())} placeholder="e.g. quick-sync" className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700">Duration (15-120 min)</label>
                      <input type="number" min="15" max="120" value={newEventDuration} onChange={(e) => setNewEventDuration(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Capacity (&ge; 1)</label>
                      <input type="number" min="1" value={newEventCapacity} onChange={(e) => setNewEventCapacity(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700">Buffer Before (0-30 min)</label>
                      <input type="number" min="0" max="30" value={newEventBufBefore} onChange={(e) => setNewEventBufBefore(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Buffer After (0-30 min)</label>
                      <input type="number" min="0" max="30" value={newEventBufAfter} onChange={(e) => setNewEventBufAfter(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button type="button" onClick={() => setShowNewEvent(false)} className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Save Event</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'notifications' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-600" />
              <span>Emitted Notifications Sink</span>
            </h2>
            <span className="text-xs text-slate-500">Live webhook / audit ledger</span>
          </div>
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No notifications emitted yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-700 font-mono">{n.eventType}</span>
                    <span className="text-slate-400">{new Date(n.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <pre className="bg-slate-50 p-2 rounded text-[11px] text-slate-700 font-mono overflow-x-auto">{JSON.stringify(n.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-2">Host Home Time Zone</h2>
          <p className="text-xs text-slate-500 mb-4">Weekly availability and custom overrides are evaluated in this IANA time zone.</p>
          <form onSubmit={handleUpdateTimezone} className="space-y-4">
            <input type="text" value={newTz} onChange={(e) => setNewTz(e.target.value)} placeholder="e.g. America/New_York or Asia/Kolkata" className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
            <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm">Save Time Zone</button>
          </form>
        </div>
      )}
    </div>
  );
}"""
}

os.makedirs("slotbook-frontend/src/pages", exist_ok=True)
for path, content in files.items():
    fp = os.path.join("slotbook-frontend", path)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, "w", encoding="utf-8") as f:
        f.write(content)

print("Frontend files generated successfully!")
