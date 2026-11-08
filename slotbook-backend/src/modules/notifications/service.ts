import pg from 'pg';
import { pool } from '../../db/client.js';

export type NotificationEventType =
  | 'booking.confirmed'
  | 'booking.rescheduled'
  | 'booking.cancelled';

export function buildIcsCalendarInvite(params: {
  bookingId: string;
  eventName: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  guestEmail: string;
  startsAtIso: string;
  endsAtIso: string;
  status: 'CONFIRMED' | 'CANCELLED';
}): string {
  const formatIcsUtc = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const nowStamp = formatIcsUtc(new Date().toISOString());
  const dtStart = formatIcsUtc(params.startsAtIso);
  const dtEnd = formatIcsUtc(params.endsAtIso);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotbook//Booking Engine//EN',
    `METHOD:${params.status === 'CANCELLED' ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${params.bookingId}@slotbook.dev`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${params.eventName} with ${params.hostName}`,
    `ORGANIZER;CN=${params.hostName}:mailto:${params.hostEmail}`,
    `ATTENDEE;CN=${params.guestName}:mailto:${params.guestEmail}`,
    `STATUS:${params.status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function emitNotificationEvent(
  client: pg.PoolClient,
  bookingId: string,
  eventType: NotificationEventType,
  payload: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO notification_events (booking_id, event_type, payload, processed_at)
     VALUES ($1, $2, $3, NOW())`,
    [bookingId, eventType, JSON.stringify(payload)]
  );
}

export async function listNotificationEvents(limit = 50) {
  const res = await pool.query(
    `SELECT id,
            booking_id AS "bookingId",
            event_type AS "eventType",
            payload,
            created_at AS "createdAt",
            processed_at AS "processedAt"
     FROM notification_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload),
  }));
}
