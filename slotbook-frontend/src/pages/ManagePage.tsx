import { useEffect, useState } from 'react';
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
      const fromIso = new Date().toISOString();
      const toIso = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
      const query = new URLSearchParams({
        from: fromIso,
        to: toIso,
        tz: localTz,
      });
      const res = await fetch(
        `/api/hosts/${booking.hostUsername}/events/${booking.eventSlug}/slots?${query.toString()}`
      );
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
      setBooking((prev: any) =>
        prev
          ? { ...prev, status: 'cancelled', cancellationReason: cancelReason, cancelledBy: 'guest' }
          : null
      );
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
        <Link to="/" className="text-xs font-semibold text-indigo-600 hover:underline">
          Return to Booking Page
        </Link>
      </div>
    );
  }

  const startLocal = DateTime.fromISO(booking.startsAt, { zone: localTz });
  const endLocal = DateTime.fromISO(booking.endsAt, { zone: localTz });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              booking.status === 'confirmed'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {booking.status === 'confirmed' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" /> Cancelled
              </>
            )}
          </span>
          <span className="text-xs text-slate-400 font-mono">ID: {booking.id.slice(0, 8)}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{booking.eventName}</h1>
        <p className="text-xs text-slate-500 mb-6">
          Hosted by {booking.hostName} (@{booking.hostUsername})
        </p>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 mb-6 text-sm">
          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-900">{startLocal.toFormat('cccc, MMMM d, yyyy')}</div>
              <div className="text-xs text-slate-600">
                {startLocal.toFormat('h:mm a')} &ndash; {endLocal.toFormat('h:mm a')} ({localTz})
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-700">{booking.durationMinutes} Minutes</span>
          </div>
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-700">
              {booking.guestName} ({booking.guestEmail})
            </span>
          </div>
        </div>
        {booking.cancellationReason && (
          <div className="mb-6 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900">
            <span className="font-semibold">Cancellation reason:</span> {booking.cancellationReason}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
          <a
            href={`/api/bookings/${token}/invite.ics`}
            download
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .ics</span>
          </a>
          {booking.status === 'confirmed' && (
            <>
              <button
                type="button"
                onClick={openReschedule}
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reschedule</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCancel(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition ml-auto"
              >
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
                <select
                  value={newSlotStart}
                  onChange={(e) => setNewSlotStart(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {availableSlots.map((s) => (
                    <option key={s.startUtc} value={s.startUtc}>
                      {DateTime.fromISO(s.startLocal, { zone: localTz }).toFormat('EEE, MMM d @ h:mm a')}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowReschedule(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={rescheduling}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {rescheduling ? 'Moving...' : 'Confirm New Slot'}
                  </button>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Cancellation (Optional)
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Sudden travel conflict"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCancel(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
