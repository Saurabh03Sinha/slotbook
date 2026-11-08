import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { Clock, Users, Globe, CheckCircle2, AlertCircle, ArrowLeft, ShieldAlert, CalendarCheck, LogOut } from 'lucide-react';

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
  bookingHorizonDays?: number;
}

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function BookingPage() {
  const { host = 'alex', slug = 'intro-call' } = useParams();
  const navigate = useNavigate();

  const [hostToken, setHostToken] = useState<string | null>(() =>
    localStorage.getItem('slotbook_host_token')
  );
  const isHostLoggedIn = Boolean(hostToken);

  const [hostDisplayName, setHostDisplayName] = useState<string>('Godfrey Loux');

  const [tz, setTz] = useState<string>(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return local || 'Asia/Kolkata';
  });

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
  const [emailTouched, setEmailTouched] = useState(false);

  const isEmailValid = EMAIL_REGEX.test(guestEmail.trim());
  const isNameValid = guestName.trim().length >= 2;

  // Listen for instant login/logout changes from navbar or other tabs without needing manual page refresh
  useEffect(() => {
    const syncAuth = () => {
      const current = localStorage.getItem('slotbook_host_token');
      setHostToken((prev) => {
        if (prev !== current) {
          setError(null);
        }
        return current;
      });
    };

    window.addEventListener('slotbook-auth-change', syncAuth);
    window.addEventListener('storage', syncAuth);
    const interval = setInterval(syncAuth, 250);

    return () => {
      window.removeEventListener('slotbook-auth-change', syncAuth);
      window.removeEventListener('storage', syncAuth);
      clearInterval(interval);
    };
  }, []);

  function handleInlineLogout() {
    localStorage.removeItem('slotbook_host_token');
    setHostToken(null);
    setError(null);
    window.dispatchEvent(new Event('slotbook-auth-change'));
  }

  // 1. Fetch available slots: GET /api/hosts/{host}/events/{slug}/slots?from&to&tz
  useEffect(() => {
    async function loadSlots() {
      setLoading(true);
      setError(null);
      setSelectedSlot(null);
      setHold(null);
      try {
        const fromIso = new Date().toISOString();
        const toIso = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
        const query = new URLSearchParams({
          from: fromIso,
          to: toIso,
          tz,
        });

        const res = await fetch(`/api/hosts/${host}/events/${slug}/slots?${query.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        const data = await res.json();
        setEventMeta(data.event);
        if (data.host?.name) {
          setHostDisplayName(data.host.name);
        }
        setSlots(data.slots);

        if (data.slots.length > 0) {
          const firstDate = DateTime.fromISO(data.slots[0].startLocal, { zone: tz }).toFormat('yyyy-MM-dd');
          setSelectedDate(firstDate);
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
      const diffSec = Math.floor(
        (new Date(hold.expiresAt).getTime() - Date.now()) / 1000
      );
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

  // 2. Request a 5-minute slot hold via POST /api/holds
  async function handleSelectSlot(slot: Slot) {
    if (isHostLoggedIn) {
      setError(`You are signed in as Host (${hostDisplayName}). Hosts can only view bookings and cannot book slots.`);
      return;
    }

    setSelectedSlot(slot);
    setHolding(true);
    setError(null);

    const idempotencyKey = `hold-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      };
      if (hostToken) {
        headers['x-host-session'] = hostToken;
      }

      const res = await fetch('/api/holds', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          host,
          slug,
          slotStart: slot.startUtc,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place hold on slot');
      }

      setHold({
        holdId: data.holdId,
        expiresAt: data.holdExpiresAt || data.expiresAt,
      });
      const initialDiff = Math.max(
        0,
        Math.floor((new Date(data.holdExpiresAt || data.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsRemaining(initialDiff);
    } catch (err: any) {
      setSelectedSlot(null);
      setError(err.message || 'Slot is no longer available');
    } finally {
      setHolding(false);
    }
  }

  // 3. Confirm the held slot via POST /api/holds/{id}/confirm
  async function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    setEmailTouched(true);

    if (!isNameValid) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!isEmailValid) {
      setError('Please enter a valid email address with a domain (e.g. priya@example.com).');
      return;
    }
    if (!hold) return;

    setConfirming(true);
    setError(null);

    try {
      const res = await fetch(`/api/holds/${hold.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: guestName.trim(),
          email: guestEmail.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Confirmation failed');
      }

      navigate(`/bookings/${data.manageToken}`);
    } catch (err: any) {
      setError(err.message || 'Confirmation failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Host Read-Only Mode Banner */}
      {isHostLoggedIn && (
        <div className="bg-indigo-950 text-white px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Signed in as Host ({hostDisplayName} / @{host}):</strong> Booking slots is disabled in Host mode. Inspect your live schedule below or view upcoming reservations in your dashboard.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/host"
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>See Bookings</span>
            </Link>
            <button
              type="button"
              onClick={handleInlineLogout}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch to Guest</span>
            </button>
          </div>
        </div>
      )}

      {/* Hold Countdown Banner */}
      {hold && !isHostLoggedIn && (
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

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-center gap-2 text-sm text-rose-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        <div className="p-6 md:p-8 bg-slate-50/60">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Host: {hostDisplayName} (@{host})
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            {eventMeta ? eventMeta.name : 'Loading event...'}
          </h1>

          <div className="space-y-3 text-sm text-slate-600 mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>{eventMeta ? `${eventMeta.durationMinutes} minutes` : '...'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <span>
                {eventMeta?.capacity === 1
                  ? '1-on-1 Session'
                  : `Group Session (Up to ${eventMeta?.capacity} guests)`}
              </span>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              Your Time Zone
            </label>
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              disabled={!!hold}
              className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {COMMON_TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 md:p-8 md:col-span-2">
          {loading ? (
            <div className="py-16 text-center text-slate-400">Loading available slots...</div>
          ) : hold && selectedSlot && !isHostLoggedIn ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  setHold(null);
                  setSelectedSlot(null);
                  setError(null);
                }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium mb-6"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Selected Slot
              </button>

              <div className="mb-6 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                  Held Appointment Slot
                </div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {DateTime.fromISO(selectedSlot.startLocal, { zone: tz }).toFormat('cccc, MMMM d, yyyy')}
                </div>
                <div className="text-sm text-indigo-900 mt-0.5">
                  {DateTime.fromISO(selectedSlot.startLocal, { zone: tz }).toFormat('h:mm a')} &ndash;{' '}
                  {DateTime.fromISO(selectedSlot.endLocal, { zone: tz }).toFormat('h:mm a')} ({tz})
                </div>
              </div>

              <form onSubmit={handleConfirmBooking} className="space-y-4" noValidate>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                    Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onBlur={() => setEmailTouched(true)}
                    onChange={(e) => {
                      setGuestEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="priya@example.com"
                    className={`w-full px-3.5 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                      emailTouched && !isEmailValid
                        ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/30'
                        : 'border-slate-300 focus:ring-indigo-500'
                    }`}
                  />
                  {emailTouched && !isEmailValid ? (
                    <p className="text-xs text-rose-600 font-medium mt-1">
                      Please enter a valid email address with a domain extension (e.g. name@example.com).
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Must be a valid email (e.g. user@domain.com) to receive your manage link.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={confirming || !isNameValid || !isEmailValid}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{confirming ? 'Confirming...' : 'Confirm Appointment'}</span>
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900">
                  {isHostLoggedIn ? 'Available Slots Preview (Host Read-Only)' : 'Select Date & Time'}
                </h2>
              </div>

              {slots.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No upcoming slots found in the next 30 days for this time zone.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Available Dates
                    </label>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {Array.from(groupedDates.keys()).map((dStr) => {
                        const dateObj = DateTime.fromISO(dStr, { zone: tz });
                        const isSelected = selectedDate === dStr;
                        return (
                          <button
                            key={dStr}
                            type="button"
                            onClick={() => setSelectedDate(dStr)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <span>{dateObj.toFormat('EEE, MMM d')}</span>
                            <span className="text-[10px] opacity-80">
                              {groupedDates.get(dStr)?.length} slots
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Times for {selectedDate ? DateTime.fromISO(selectedDate, { zone: tz }).toFormat('MMM d') : ''}
                    </label>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {(groupedDates.get(selectedDate) || []).map((slot) => {
                        const timeStr = DateTime.fromISO(slot.startLocal, { zone: tz }).toFormat('h:mm a');
                        if (isHostLoggedIn) {
                          return (
                            <div
                              key={slot.startUtc}
                              title="Log out of Host Dashboard to book this slot as a guest"
                              className="w-full py-2.5 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold flex items-center justify-between cursor-not-allowed select-none"
                            >
                              <span>{timeStr}</span>
                              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                                {slot.totalCapacity > 1
                                  ? `${slot.remainingCapacity}/${slot.totalCapacity} open`
                                  : 'Open (View Only)'}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={slot.startUtc}
                            type="button"
                            disabled={holding}
                            onClick={() => handleSelectSlot(slot)}
                            className="w-full py-2.5 px-3 rounded-lg border border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 text-slate-800 text-xs font-semibold flex items-center justify-between transition group"
                          >
                            <span className="text-indigo-600 group-hover:underline">{timeStr}</span>
                            {slot.totalCapacity > 1 && (
                              <span className="text-[10px] text-slate-500 font-normal">
                                {slot.remainingCapacity}/{slot.totalCapacity} left
                              </span>
                            )}
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
}
