import { DateTime } from 'luxon';
import pg from 'pg';
import { pool } from '../../db/client.js';

export interface EventSlotContext {
  eventId: string;
  hostId: string;
  hostUsername: string;
  hostName: string;
  hostEmail: string;
  hostTimeZone: string;
  name: string;
  slug: string;
  durationMinutes: number;
  capacity: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeMinutes: number;
  bookingHorizonDays: number;
}

export interface AvailableSlot {
  startUtc: string;
  endUtc: string;
  startLocal: string;
  endLocal: string;
  remainingCapacity: number;
  totalCapacity: number;
}

/**
 * Look up an event type by host identifier (username, email, or UUID) and event slug.
 */
export async function getEventSlotContext(
  hostIdentifier: string,
  eventSlug: string,
  client?: pg.PoolClient
): Promise<EventSlotContext | null> {
  const db = client ?? pool;
  const res = await db.query(
    `SELECT e.id AS "eventId",
            h.id AS "hostId",
            h.username AS "hostUsername",
            h.name AS "hostName",
            h.email AS "hostEmail",
            h.time_zone AS "hostTimeZone",
            e.name,
            e.slug,
            e.duration_minutes AS "durationMinutes",
            e.capacity,
            e.buffer_before_minutes AS "bufferBeforeMinutes",
            e.buffer_after_minutes AS "bufferAfterMinutes",
            e.minimum_notice_minutes AS "minimumNoticeMinutes",
            e.booking_horizon_days AS "bookingHorizonDays"
     FROM event_types e
     JOIN hosts h ON h.id = e.host_id
     WHERE e.slug = $2
       AND e.active = true
       AND (h.username = $1 OR h.email = $1 OR h.id::text = $1)
     LIMIT 1`,
    [hostIdentifier, eventSlug]
  );
  return res.rows[0] ?? null;
}

/**
 * Generates DST-safe available slots in the host's IANA time zone and converts them
 * to both UTC and the guest's requested display time zone (`guestTimeZone`).
 */
export async function computeAvailableSlots(params: {
  ctx: EventSlotContext;
  fromIso: string;
  toIso: string;
  guestTimeZone: string;
  client?: pg.PoolClient;
  excludeBookingId?: string;
}): Promise<AvailableSlot[]> {
  const { ctx, fromIso, toIso, guestTimeZone, client, excludeBookingId } = params;
  const db = client ?? pool;

  // Always use Postgres database server clock NOW() to prevent container/host clock drift
  const nowRes = await db.query('SELECT NOW() AS now');
  const dbNowUtc = DateTime.fromJSDate(nowRes.rows[0].now, { zone: 'utc' });

  const earliestBookableUtc = dbNowUtc.plus({ minutes: ctx.minimumNoticeMinutes });
  const latestHorizonUtc = dbNowUtc.plus({ days: ctx.bookingHorizonDays }).endOf('day');

  const reqFromUtc = DateTime.fromISO(fromIso, { zone: 'utc' });
  const reqToUtc = DateTime.fromISO(toIso, { zone: 'utc' });
  if (!reqFromUtc.isValid || !reqToUtc.isValid || reqFromUtc >= reqToUtc) {
    return [];
  }

  const windowStartUtc = DateTime.max(reqFromUtc, earliestBookableUtc);
  const windowEndUtc = DateTime.min(reqToUtc, latestHorizonUtc);

  if (windowStartUtc >= windowEndUtc) {
    return [];
  }

  const [weeklyRes, overridesRes, activeBookingsRes] = await Promise.all([
    db.query(
      `SELECT weekday,
              to_char(start_time, 'HH24:MI') AS "startTime",
              to_char(end_time, 'HH24:MI') AS "endTime"
       FROM weekly_availability
       WHERE event_type_id = $1
       ORDER BY weekday ASC, start_time ASC`,
      [ctx.eventId]
    ),
    db.query(
      `SELECT to_char(local_date, 'YYYY-MM-DD') AS "localDate",
              is_unavailable AS "isUnavailable",
              to_char(start_time, 'HH24:MI') AS "startTime",
              to_char(end_time, 'HH24:MI') AS "endTime"
       FROM date_overrides
       WHERE event_type_id = $1
       ORDER BY local_date ASC, start_time ASC`,
      [ctx.eventId]
    ),
    db.query(
      `SELECT id,
              event_type_id AS "eventTypeId",
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              effective_starts_at AS "effectiveStartsAt",
              effective_ends_at AS "effectiveEndsAt"
       FROM bookings
       WHERE host_id = $1
         AND effective_ends_at > $2
         AND effective_starts_at < $3
         AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
         AND ($4::uuid IS NULL OR id != $4::uuid)`,
      [
        ctx.hostId,
        windowStartUtc.minus({ minutes: 60 }).toISO(),
        windowEndUtc.plus({ minutes: 60 }).toISO(),
        excludeBookingId ?? null,
      ]
    ),
  ]);

  const activeBookings = activeBookingsRes.rows.map((b) => ({
    id: b.id as string,
    eventTypeId: b.eventTypeId as string,
    startsAtMs: new Date(b.startsAt).getTime(),
    endsAtMs: new Date(b.endsAt).getTime(),
    effectiveStartsAtMs: new Date(b.effectiveStartsAt).getTime(),
    effectiveEndsAtMs: new Date(b.effectiveEndsAt).getTime(),
  }));

  // Step day-by-day in the Host's local IANA time zone so DST transitions preserve wall-clock hours
  let cursorHostDay = windowStartUtc.setZone(ctx.hostTimeZone).startOf('day');
  const endHostDay = windowEndUtc.setZone(ctx.hostTimeZone).endOf('day');

  const slots: AvailableSlot[] = [];

  while (cursorHostDay <= endHostDay) {
    const localDateStr = cursorHostDay.toFormat('yyyy-MM-dd');
    const isoWeekday = cursorHostDay.weekday; // 1 = Monday ... 7 = Sunday

    const dayOverrides = overridesRes.rows.filter((o) => o.localDate === localDateStr);
    let windows: Array<{ startTime: string; endTime: string }> = [];

    if (dayOverrides.length > 0) {
      if (dayOverrides.some((o) => o.isUnavailable)) {
        windows = [];
      } else {
        windows = dayOverrides.map((o) => ({
          startTime: o.startTime,
          endTime: o.endTime,
        }));
      }
    } else {
      windows = weeklyRes.rows
        .filter((w) => w.weekday === isoWeekday)
        .map((w) => ({
          startTime: w.startTime,
          endTime: w.endTime,
        }));
    }

    for (const win of windows) {
      const [startH = 0, startM = 0] = win.startTime.split(':').map(Number);
      const [endH = 0, endM = 0] = win.endTime.split(':').map(Number);

      let slotStartHost = cursorHostDay.set({
        hour: startH,
        minute: startM,
        second: 0,
        millisecond: 0,
      });
      const winEndHost = cursorHostDay.set({
        hour: endH,
        minute: endM,
        second: 0,
        millisecond: 0,
      });

      while (slotStartHost.plus({ minutes: ctx.durationMinutes }) <= winEndHost) {
        const slotEndHost = slotStartHost.plus({ minutes: ctx.durationMinutes });
        const slotStartUtc = slotStartHost.toUTC();
        const slotEndUtc = slotEndHost.toUTC();

        if (slotStartUtc >= windowStartUtc && slotEndUtc <= windowEndUtc) {
          const slotStartMs = slotStartUtc.toMillis();
          const slotEndMs = slotEndUtc.toMillis();
          const effStartMs = slotStartUtc
            .minus({ minutes: ctx.bufferBeforeMinutes })
            .toMillis();
          const effEndMs = slotEndUtc
            .plus({ minutes: ctx.bufferAfterMinutes })
            .toMillis();

          // Bookings on the exact same group/1-on-1 slot
          const sameSlotBookings = activeBookings.filter(
            (b) =>
              b.eventTypeId === ctx.eventId &&
              b.startsAtMs === slotStartMs &&
              b.endsAtMs === slotEndMs
          );

          // Bookings on any other time/event that collide with this slot or its buffers
          const conflictingOtherBookings = activeBookings.filter((b) => {
            const isSameEventSlot =
              b.eventTypeId === ctx.eventId &&
              b.startsAtMs === slotStartMs &&
              b.endsAtMs === slotEndMs;
            if (isSameEventSlot) return false;

            const candidateBufferHitsExisting =
              effStartMs < b.endsAtMs && effEndMs > b.startsAtMs;
            const existingBufferHitsCandidate =
              slotStartMs < b.effectiveEndsAtMs && slotEndMs > b.effectiveStartsAtMs;

            return candidateBufferHitsExisting || existingBufferHitsCandidate;
          });

          const remainingCapacity = ctx.capacity - sameSlotBookings.length;

          if (conflictingOtherBookings.length === 0 && remainingCapacity > 0) {
            slots.push({
              startUtc: slotStartUtc.toISO()!,
              endUtc: slotEndUtc.toISO()!,
              startLocal: slotStartUtc.setZone(guestTimeZone).toISO()!,
              endLocal: slotEndUtc.setZone(guestTimeZone).toISO()!,
              remainingCapacity,
              totalCapacity: ctx.capacity,
            });
          }
        }

        slotStartHost = slotStartHost.plus({ minutes: ctx.durationMinutes });
      }
    }

    cursorHostDay = cursorHostDay.plus({ days: 1 }).startOf('day');
  }

  return slots;
}
