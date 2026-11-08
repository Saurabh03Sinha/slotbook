import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { Plus, Bell, Lock, Calendar, Clock, Trash2 } from 'lucide-react';

const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
];

export default function HostDashboard({ onAuthChange }: { onAuthChange?: (token: string | null) => void }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('slotbook_host_token'));
  const [hostProfile, setHostProfile] = useState<any>(() => {
    const saved = localStorage.getItem('slotbook_host_profile');
    return saved ? JSON.parse(saved) : null;
  });

  const [loginUser, setLoginUser] = useState('alex');
  const [loginPass, setLoginPass] = useState('slotbook123');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'bookings' | 'events' | 'availability' | 'notifications' | 'settings'>('bookings');
  const [events, setEvents] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventSlug, setNewEventSlug] = useState('');
  const [newEventDuration, setNewEventDuration] = useState(30);
  const [newEventCapacity, setNewEventCapacity] = useState(1);
  const [newEventBufBefore, setNewEventBufBefore] = useState(10);
  const [newEventBufAfter, setNewEventBufAfter] = useState(10);
  const [newEventNotice, setNewEventNotice] = useState(240);
  const [newEventHorizon, setNewEventHorizon] = useState(30);

  const [selectedEventSlug, setSelectedEventSlug] = useState<string>('intro-call');
  const [weeklyWindows, setWeeklyWindows] = useState<Array<{ weekday: number; startTime: string; endTime: string }>>([]);
  const [dateOverrides, setDateOverrides] = useState<Array<{ localDate: string; isUnavailable: boolean; startTime?: string; endTime?: string }>>([]);
  const [savingAvail, setSavingAvail] = useState(false);

  const [newOverrideDate, setNewOverrideDate] = useState('');
  const [newOverrideOff, setNewOverrideOff] = useState(true);
  const [newOverrideStart, setNewOverrideStart] = useState('10:00');
  const [newOverrideEnd, setNewOverrideEnd] = useState('14:00');

  const [newTz, setNewTz] = useState('America/New_York');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch('/api/host/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('slotbook_host_token', data.token);
      localStorage.setItem('slotbook_host_profile', JSON.stringify(data.host));
      setToken(data.token);
      setHostProfile(data.host);
      setNewTz(data.host.timeZone);
      if (onAuthChange) onAuthChange(data.token);
    } catch (err: any) {
      setLoginError(err.message);
    }
  }

  async function loadAllData() {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'x-api-key': token };
      const [hostRes, evRes, bkRes, notifRes] = await Promise.all([
        fetch('/api/host/me', { headers }).then((r) => r.json()),
        fetch('/api/host/events', { headers }).then((r) => r.json()),
        fetch('/api/host/bookings', { headers }).then((r) => r.json()),
        fetch('/api/notifications').then((r) => r.json()),
      ]);

      if (hostRes && !hostRes.error) {
        setHostProfile(hostRes);
        setNewTz(hostRes.timeZone);
      }
      setEvents(evRes.events || []);
      setBookings(bkRes.bookings || []);
      setNotifications(notifRes.events || []);

      if (evRes.events?.length > 0 && !selectedEventSlug) {
        setSelectedEventSlug(evRes.events[0].slug);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadAllData();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedEventSlug) return;
    async function loadAvail() {
      try {
        const res = await fetch(`/api/host/events/${selectedEventSlug}/availability`, {
          headers: { 'x-api-key': token! },
        });
        if (res.ok) {
          const data = await res.json();
          setWeeklyWindows(data.weeklyWindows || []);
          setDateOverrides(data.dateOverrides || []);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadAvail();
  }, [token, selectedEventSlug]);

  async function handleSaveAvailability(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedEventSlug) return;
    setSavingAvail(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/host/events/${selectedEventSlug}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': token },
        body: JSON.stringify({ weeklyWindows, dateOverrides }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save availability');
      }
      setMessage(`Availability & overrides for '/${selectedEventSlug}' updated!`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingAvail(false);
    }
  }

  function addWeeklyWindow(weekday: number) {
    setWeeklyWindows((prev) => [...prev, { weekday, startTime: '09:00', endTime: '17:00' }]);
  }

  function removeWeeklyWindow(index: number) {
    setWeeklyWindows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateWeeklyWindow(index: number, field: 'startTime' | 'endTime', val: string) {
    setWeeklyWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: val } : w))
    );
  }

  function addDateOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!newOverrideDate) return;
    setDateOverrides((prev) => [
      ...prev.filter((o) => o.localDate !== newOverrideDate),
      {
        localDate: newOverrideDate,
        isUnavailable: newOverrideOff,
        startTime: newOverrideOff ? undefined : newOverrideStart,
        endTime: newOverrideOff ? undefined : newOverrideEnd,
      },
    ]);
    setNewOverrideDate('');
  }

  function removeDateOverride(localDate: string) {
    setDateOverrides((prev) => prev.filter((o) => o.localDate !== localDate));
  }

  async function handleUpdateTimezone(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': token! },
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
        headers: { 'Content-Type': 'application/json', 'x-api-key': token! },
        body: JSON.stringify({
          name: newEventName,
          slug: newEventSlug,
          durationMinutes: Number(newEventDuration),
          capacity: Number(newEventCapacity),
          bufferBeforeMinutes: Number(newEventBufBefore),
          bufferAfterMinutes: Number(newEventBufAfter),
          minimumNoticeMinutes: Number(newEventNotice),
          bookingHorizonDays: Number(newEventHorizon),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create event');
      }
      setShowNewEvent(false);
      setMessage(`Event '/${newEventSlug}' created!`);
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
        headers: { 'Content-Type': 'application/json', 'x-api-key': token! },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to cancel booking');
      setMessage('Booking cancelled by host.');
      loadAllData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-indigo-50 rounded-xl text-indigo-600 mb-2">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Host Authentication</h1>
          <p className="text-xs text-slate-500 mt-1">Sign in to manage your events, availability, and bookings</p>
        </div>

        {loginError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg">
            {loginError}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs font-semibold">
          <div>
            <label className="text-slate-700">Host Username</label>
            <input
              type="text"
              required
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              className="w-full mt-1 p-2.5 font-normal border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-slate-700">Password</label>
            <input
              type="password"
              required
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              className="w-full mt-1 p-2.5 font-normal border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-[11px] text-slate-400 font-normal">
            Seeded host credentials: <span className="font-mono font-bold text-slate-600">alex</span> / <span className="font-mono font-bold text-slate-600">slotbook123</span>
          </p>
          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition shadow-sm"
          >
            Sign In to Dashboard
          </button>
        </form>
      </div>
    );
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

        <button
          onClick={loadAllData}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
        >
          Refresh Data
        </button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 rounded-xl flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold overflow-x-auto">
        <button onClick={() => setActiveTab('bookings')} className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${activeTab === 'bookings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Upcoming Bookings ({bookings.length})</button>
        <button onClick={() => setActiveTab('events')} className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${activeTab === 'events' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Event Types ({events.length})</button>
        <button onClick={() => setActiveTab('availability')} className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${activeTab === 'availability' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Weekly Hours & Overrides</button>
        <button onClick={() => setActiveTab('notifications')} className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${activeTab === 'notifications' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Notifications Sink ({notifications.length})</button>
        <button onClick={() => setActiveTab('settings')} className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Home Timezone</button>
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
            <div className="py-12 text-center text-xs text-slate-400">No active upcoming bookings.</div>
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
            <h2 className="text-sm font-bold text-slate-800">Configured Event Types</h2>
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
                    <input required value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="e.g. Sprint Planning" className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Slug</label>
                    <input required pattern="^[a-z0-9-]+$" value={newEventSlug} onChange={(e) => setNewEventSlug(e.target.value.toLowerCase())} placeholder="e.g. sprint-planning" className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700">Duration (15-120 min)</label>
                      <input type="number" min="15" max="120" value={newEventDuration} onChange={(e) => setNewEventDuration(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Capacity (1 = 1-on-1)</label>
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
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700">Min Notice (minutes, e.g. 240)</label>
                      <input type="number" min="0" value={newEventNotice} onChange={(e) => setNewEventNotice(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Booking Horizon (days)</label>
                      <input type="number" min="1" max="365" value={newEventHorizon} onChange={(e) => setNewEventHorizon(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg mt-1" />
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
      ) : activeTab === 'availability' ? (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Configure Availability For Event:</label>
              <select
                value={selectedEventSlug}
                onChange={(e) => setSelectedEventSlug(e.target.value)}
                className="ml-3 text-xs p-1.5 font-bold border border-slate-300 rounded-lg"
              >
                {events.map((ev) => (
                  <option key={ev.slug} value={ev.slug}>{ev.name} (/{ev.slug})</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSaveAvailability}
              disabled={savingAvail}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
            >
              {savingAvail ? 'Saving...' : 'Save Availability Changes'}
            </button>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Weekly Schedule Windows (in Host Time Zone: {hostProfile?.timeZone})</h3>
            <div className="space-y-3">
              {WEEKDAYS.map((day) => {
                const dayWindows = weeklyWindows
                  .map((w, idx) => ({ ...w, originalIndex: idx }))
                  .filter((w) => w.weekday === day.id);

                return (
                  <div key={day.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <span className="font-bold w-24 text-slate-800">{day.name}</span>
                    <div className="flex-1 space-y-1.5">
                      {dayWindows.length === 0 ? (
                        <span className="text-slate-400 italic">Unavailable / Day Off</span>
                      ) : (
                        dayWindows.map((win) => (
                          <div key={win.originalIndex} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={win.startTime}
                              onChange={(e) => updateWeeklyWindow(win.originalIndex, 'startTime', e.target.value)}
                              className="p-1 border border-slate-300 rounded bg-white"
                            />
                            <span>to</span>
                            <input
                              type="time"
                              value={win.endTime}
                              onChange={(e) => updateWeeklyWindow(win.originalIndex, 'endTime', e.target.value)}
                              className="p-1 border border-slate-300 rounded bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => removeWeeklyWindow(win.originalIndex)}
                              className="p-1 text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => addWeeklyWindow(day.id)}
                      className="text-xs font-semibold px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100"
                    >
                      + Add Window
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Date Overrides (Specific Dates Off or Custom Hours)</h3>

            <form onSubmit={addDateOverride} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-600 mb-0.5">Date</label>
                <input
                  type="date"
                  required
                  value={newOverrideDate}
                  onChange={(e) => setNewOverrideDate(e.target.value)}
                  className="p-1.5 border border-slate-300 rounded bg-white"
                />
              </div>

              <div className="flex items-center gap-1.5 mt-4">
                <input
                  type="checkbox"
                  id="chkOff"
                  checked={newOverrideOff}
                  onChange={(e) => setNewOverrideOff(e.target.checked)}
                />
                <label htmlFor="chkOff" className="font-semibold text-slate-700">Entire Day Off</label>
              </div>

              {!newOverrideOff && (
                <>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-600 mb-0.5">Custom Start</label>
                    <input
                      type="time"
                      value={newOverrideStart}
                      onChange={(e) => setNewOverrideStart(e.target.value)}
                      className="p-1.5 border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-600 mb-0.5">Custom End</label>
                    <input
                      type="time"
                      value={newOverrideEnd}
                      onChange={(e) => setNewOverrideEnd(e.target.value)}
                      className="p-1.5 border border-slate-300 rounded bg-white"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                className="mt-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded"
              >
                + Add Override
              </button>
            </form>

            <div className="divide-y divide-slate-100">
              {dateOverrides.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 italic">No date overrides configured.</div>
              ) : (
                dateOverrides.map((o) => (
                  <div key={o.localDate} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{o.localDate}</span>
                      <span className="ml-3 font-medium text-slate-600">
                        {o.isUnavailable ? (
                          <span className="text-rose-600 font-bold">Unavailable (Day Off)</span>
                        ) : (
                          `Custom Hours: ${o.startTime} - ${o.endTime}`
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDateOverride(o.localDate)}
                      className="text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
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
                  <pre className="bg-slate-50 p-2 rounded text-[11px] text-slate-700 font-mono overflow-x-auto">
                    {JSON.stringify(n.payload, null, 2)}
                  </pre>
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
}
