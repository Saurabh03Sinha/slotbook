import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import pg from 'pg';
import { pool, withHostTransactionLock } from '../../db/client.js';
import { AppError } from '../../plugins/errors.js';
import { computeAvailableSlots, getEventSlotContext } from '../availability/service.js';
import {
  buildIcsCalendarInvite,
  emitNotificationEvent,
} from '../notifications/service.js';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function assertSlotBookableInTx(params: {
  client: pg.PoolClient;
  hostIdentifier: string;
  eventSlug: string;
  slotStartIso: string;
  excludeBookingId?: string;
}) {
  const { client, hostIdentifier, eventSlug, slotStartIso, excludeBookingId } = params;
  const ctx = await getEventSlotContext(hostIdentifier, eventSlug, client);
  if (!ctx) {
    throw new AppError(404, 'Event type not found', 'EVENT_NOT_FOUND');
  }

  const slotStart = DateTime.fromISO(slotStartIso, { zone: 'utc' });
  if (!slotStart.isValid) {
    throw new AppError(400, 'Invalid slotStart ISO timestamp', 'INVALID_SLOT_START');
  }
  const slotEnd = slotStart.plus({ minutes: ctx.durationMinutes });

  const available = await computeAvailableSlots({
    ctx,
    fromIso: slotStart.minus({ minutes: ctx.durationMinutes }).toISO()!,
    toIso: slotEnd.plus({ minutes: ctx.durationMinutes }).toISO()!,
    guestTimeZone: 'UTC',
    client,
    excludeBookingId,
  });

  const matchingSlot = available.find(
    (s) =>
      DateTime.fromISO(s.startUtc).toMillis() === slotStart.toMillis() &&
      s.remainingCapacity > 0
  );

  if (!matchingSlot) {
    throw new AppError(
      409,
      'Selected slot is unavailable, conflicts with a buffer, or has reached capacity',
      'SLOT_UNAVAILABLE'
    );
  }

  return {
    ctx,
    startsAtIso: slotStart.toISO()!,
    endsAtIso: slotEnd.toISO()!,
    effectiveStartsAtIso: slotStart
      .minus({ minutes: ctx.bufferBeforeMinutes })
      .toISO()!,
    effectiveEndsAtIso: slotEnd.plus({ minutes: ctx.bufferAfterMinutes }).toISO()!,
  };
}

/**
 * Hold a slot for 5 minutes with strict Idempotency-Key protection and Postgres host lock.
 */
export async function createSlotHold(params: {
  host: string;
  slug: string;
  slotStart: string;
  idempotencyKey: string;
}) {
  if (!params.idempotencyKey || params.idempotencyKey.trim() === '') {
    throw new AppError(
      400,
      'Idempotency-Key header is required when holding a slot',
      'MISSING_IDEMPOTENCY_KEY'
    );
  }

  const requestHash = crypto
    .createHash('sha256')
    .update(`${params.host}:${params.slug}:${new Date(params.slotStart).toISOString()}`)
    .digest('hex');

  const previewCtx = await getEventSlotContext(params.host, params.slug);
  if (!previewCtx) {
    throw new AppError(404, 'Host or event type not found', 'EVENT_NOT_FOUND');
  }

  return withHostTransactionLock(previewCtx.hostId, async (client) => {
    // 1. Check idempotency_keys inside the serialized transaction
    const existingIdem = await client.query(
      `SELECT request_hash AS "requestHash",
              response_status AS "responseStatus",
              response_body AS "responseBody"
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [params.idempotencyKey]
    );

    if (existingIdem.rows.length > 0) {
      const row = existingIdem.rows[0];
      if (row.requestHash !== requestHash) {
        throw new AppError(
          422,
          'Idempotency-Key was already used with different request parameters',
          'IDEMPOTENCY_CONFLICT'
        );
      }
      return {
        statusCode: 200,
        body: {
          ...JSON.parse(row.responseBody),
          idempotentReplay: true,
        },
      };
    }

    // 2. Verify slot is valid and has capacity
    const {
      ctx,
      startsAtIso,
      endsAtIso,
      effectiveStartsAtIso,
      effectiveEndsAtIso,
    } = await assertSlotBookableInTx({
      client,
      hostIdentifier: params.host,
      eventSlug: params.slug,
      slotStartIso: params.slotStart,
    });

    // 3. Insert 5-minute hold anchored to Postgres NOW()
    const insertRes = await client.query(
      `INSERT INTO bookings (
         event_type_id, host_id, status,
         starts_at, ends_at, effective_starts_at, effective_ends_at,
         hold_expires_at
       )
       VALUES ($1, $2, 'held', $3, $4, $5, $6, NOW() + INTERVAL '5 minutes')
       RETURNING id,
                 status,
                 starts_at AS "startsAt",
                 ends_at AS "endsAt",
                 hold_expires_at AS "holdExpiresAt"`,
      [
        ctx.eventId,
        ctx.hostId,
        startsAtIso,
        endsAtIso,
        effectiveStartsAtIso,
        effectiveEndsAtIso,
      ]
    );

    const hold = insertRes.rows[0];
    const responsePayload = {
      holdId: hold.id,
      status: hold.status,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      holdExpiresAt: hold.holdExpiresAt,
      idempotentReplay: false,
    };

    await client.query(
      `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, expires_at)
       VALUES ($1, $2, 201, $3, NOW() + INTERVAL '24 hours')
       ON CONFLICT (key) DO UPDATE
       SET request_hash = EXCLUDED.request_hash,
           response_status = EXCLUDED.response_status,
           response_body = EXCLUDED.response_body,
           expires_at = EXCLUDED.expires_at`,
      [params.idempotencyKey, requestHash, JSON.stringify(responsePayload)]
    );

    return {
      statusCode: 201,
      body: responsePayload,
    };
  });
}

/**
 * Confirm a held slot within its 5-minute expiration window.
 */
export async function confirmSlotHold(params: {
  holdId: string;
  guestName: string;
  guestEmail: string;
}) {
  const lookup = await pool.query(
    `SELECT b.host_id AS "hostId",
            e.name AS "eventName",
            h.name AS "hostName",
            h.email AS "hostEmail"
     FROM bookings b
     JOIN event_types e ON e.id = b.event_type_id
     JOIN hosts h ON h.id = b.host_id
     WHERE b.id = $1`,
    [params.holdId]
  );

  if (lookup.rows.length === 0) {
    throw new AppError(404, 'Hold not found', 'HOLD_NOT_FOUND');
  }

  const { hostId, eventName, hostName, hostEmail } = lookup.rows[0];

  return withHostTransactionLock(hostId, async (client) => {
    const currentRes = await client.query(
      `SELECT id,
              status,
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              hold_expires_at AS "holdExpiresAt",
              guest_name AS "guestName",
              guest_email AS "guestEmail",
              manage_token AS "manageToken"
       FROM bookings
       WHERE id = $1`,
      [params.holdId]
    );

    const current = currentRes.rows[0];

    // Idempotent retry if already confirmed by the same guest
    if (
      current.status === 'confirmed' &&
      current.guestEmail === params.guestEmail
    ) {
      return {
        bookingId: current.id,
        status: current.status,
        startsAt: current.startsAt,
        endsAt: current.endsAt,
        manageToken: current.manageToken,
        manageUrl: `/bookings/${current.manageToken}`,
      };
    }

    if (current.status === 'expired') {
      throw new AppError(410, 'Hold has expired and can no longer be confirmed', 'HOLD_EXPIRED');
    }

    if (current.status !== 'held') {
      throw new AppError(
        409,
        `Cannot confirm booking from status '${current.status}'`,
        'INVALID_BOOKING_STATUS'
      );
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);

    const updatedRes = await client.query(
      `UPDATE bookings
       SET status = 'confirmed',
           guest_name = $2,
           guest_email = $3,
           manage_token = $4,
           manage_token_hash = $5,
           hold_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND status = 'held' AND hold_expires_at > NOW()
       RETURNING id,
                 status,
                 starts_at AS "startsAt",
                 ends_at AS "endsAt",
                 manage_token AS "manageToken"`,
      [params.holdId, params.guestName, params.guestEmail, rawToken, tokenHash]
    );

    if (updatedRes.rows.length === 0) {
      throw new AppError(410, 'Hold expired before confirmation completed', 'HOLD_EXPIRED');
    }

    const confirmed = updatedRes.rows[0];

    const icsInvite = buildIcsCalendarInvite({
      bookingId: confirmed.id,
      eventName,
      hostName,
      hostEmail,
      guestName: params.guestName,
      guestEmail: params.guestEmail,
      startsAtIso: new Date(confirmed.startsAt).toISOString(),
      endsAtIso: new Date(confirmed.endsAt).toISOString(),
      status: 'CONFIRMED',
    });

    await emitNotificationEvent(client, confirmed.id, 'booking.confirmed', {
      bookingId: confirmed.id,
      eventName,
      guestName: params.guestName,
      guestEmail: params.guestEmail,
      startsAt: confirmed.startsAt,
      endsAt: confirmed.endsAt,
      manageUrl: `/bookings/${confirmed.manageToken}`,
      icsAttachment: icsInvite,
    });

    return {
      bookingId: confirmed.id,
      status: confirmed.status,
      startsAt: confirmed.startsAt,
      endsAt: confirmed.endsAt,
      manageToken: confirmed.manageToken,
      manageUrl: `/bookings/${confirmed.manageToken}`,
    };
  });
}

/**
 * Look up booking by guest manage token (matches either raw token or SHA-256 hash).
 */
export async function getBookingByManageToken(token: string) {
  const tokenHash = hashToken(token);
  const res = await pool.query(
    `SELECT b.id,
            b.status,
            b.starts_at AS "startsAt",
            b.ends_at AS "endsAt",
            b.guest_name AS "guestName",
            b.guest_email AS "guestEmail",
            b.cancellation_reason AS "cancellationReason",
            b.cancelled_by AS "cancelledBy",
            e.id AS "eventTypeId",
            e.name AS "eventName",
            e.slug AS "eventSlug",
            e.duration_minutes AS "durationMinutes",
            h.id AS "hostId",
            h.username AS "hostUsername",
            h.name AS "hostName",
            h.email AS "hostEmail",
            h.time_zone AS "hostTimeZone"
     FROM bookings b
     JOIN event_types e ON e.id = b.event_type_id
     JOIN hosts h ON h.id = b.host_id
     WHERE b.manage_token = $1 OR b.manage_token_hash = $2
     LIMIT 1`,
    [token, tokenHash]
  );

  if (res.rows.length === 0) {
    throw new AppError(404, 'Booking not found for this manage token', 'BOOKING_NOT_FOUND');
  }

  return res.rows[0];
}

/**
 * Atomically move a confirmed booking to a new slot inside a single host-locked transaction.
 */
export async function rescheduleBookingByToken(params: {
  token: string;
  newSlotStart: string;
}) {
  const target = await getBookingByManageToken(params.token);

  return withHostTransactionLock(target.hostId, async (client) => {
    const lockedRes = await client.query(
      `SELECT id, status, starts_at AS "oldStartsAt", ends_at AS "oldEndsAt"
       FROM bookings
       WHERE id = $1`,
      [target.id]
    );
    const current = lockedRes.rows[0];

    if (current.status !== 'confirmed') {
      throw new AppError(
        409,
        `Only confirmed bookings can be rescheduled (current status: ${current.status})`,
        'INVALID_BOOKING_STATUS'
      );
    }

    const {
      startsAtIso,
      endsAtIso,
      effectiveStartsAtIso,
      effectiveEndsAtIso,
    } = await assertSlotBookableInTx({
      client,
      hostIdentifier: target.hostUsername,
      eventSlug: target.eventSlug,
      slotStartIso: params.newSlotStart,
      excludeBookingId: target.id,
    });

    const updatedRes = await client.query(
      `UPDATE bookings
       SET starts_at = $2,
           ends_at = $3,
           effective_starts_at = $4,
           effective_ends_at = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id,
                 status,
                 starts_at AS "startsAt",
                 ends_at AS "endsAt"`,
      [
        target.id,
        startsAtIso,
        endsAtIso,
        effectiveStartsAtIso,
        effectiveEndsAtIso,
      ]
    );

    const updated = updatedRes.rows[0];

    const icsInvite = buildIcsCalendarInvite({
      bookingId: updated.id,
      eventName: target.eventName,
      hostName: target.hostName,
      hostEmail: target.hostEmail,
      guestName: target.guestName,
      guestEmail: target.guestEmail,
      startsAtIso: new Date(updated.startsAt).toISOString(),
      endsAtIso: new Date(updated.endsAt).toISOString(),
      status: 'CONFIRMED',
    });

    await emitNotificationEvent(client, updated.id, 'booking.rescheduled', {
      bookingId: updated.id,
      guestEmail: target.guestEmail,
      previousStartsAt: current.oldStartsAt,
      newStartsAt: updated.startsAt,
      newEndsAt: updated.endsAt,
      icsAttachment: icsInvite,
    });

    return {
      bookingId: updated.id,
      status: updated.status,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
    };
  });
}

/**
 * Cancel a booking (by guest manage token or by host booking ID) and emit notification.
 */
export async function cancelBookingRecord(params: {
  token?: string;
  bookingId?: string;
  cancelledBy: 'guest' | 'host';
  reason?: string;
}) {
  let bookingId: string;
  let hostId: string;

  if (params.token) {
    const byToken = await getBookingByManageToken(params.token);
    bookingId = byToken.id;
    hostId = byToken.hostId;
  } else if (params.bookingId) {
    const res = await pool.query(
      `SELECT id, host_id AS "hostId" FROM bookings WHERE id = $1`,
      [params.bookingId]
    );
    if (res.rows.length === 0) {
      throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
    }
    bookingId = res.rows[0].id;
    hostId = res.rows[0].hostId;
  } else {
    throw new AppError(400, 'Missing booking identifier', 'INVALID_REQUEST');
  }

  return withHostTransactionLock(hostId, async (client) => {
    const curRes = await client.query(
      `SELECT b.id,
              b.status,
              b.starts_at AS "startsAt",
              b.ends_at AS "endsAt",
              b.guest_name AS "guestName",
              b.guest_email AS "guestEmail",
              e.name AS "eventName",
              h.name AS "hostName",
              h.email AS "hostEmail"
       FROM bookings b
       JOIN event_types e ON e.id = b.event_type_id
       JOIN hosts h ON h.id = b.host_id
       WHERE b.id = $1`,
      [bookingId]
    );
    const current = curRes.rows[0];

    if (current.status === 'cancelled') {
      return {
        bookingId: current.id,
        status: 'cancelled',
        cancellationReason: params.reason ?? null,
      };
    }

    if (current.status === 'expired') {
      throw new AppError(409, 'Cannot cancel an expired hold', 'INVALID_BOOKING_STATUS');
    }

    const updatedRes = await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancelled_by = $2,
           cancellation_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id AS "bookingId",
                 status,
                 cancelled_by AS "cancelledBy",
                 cancellation_reason AS "cancellationReason"`,
      [bookingId, params.cancelledBy, params.reason ?? null]
    );

    if (current.guestEmail) {
      const icsCancel = buildIcsCalendarInvite({
        bookingId: current.id,
        eventName: current.eventName,
        hostName: current.hostName,
        hostEmail: current.hostEmail,
        guestName: current.guestName ?? 'Guest',
        guestEmail: current.guestEmail,
        startsAtIso: new Date(current.startsAt).toISOString(),
        endsAtIso: new Date(current.endsAt).toISOString(),
        status: 'CANCELLED',
      });

      await emitNotificationEvent(client, current.id, 'booking.cancelled', {
        bookingId: current.id,
        cancelledBy: params.cancelledBy,
        reason: params.reason ?? null,
        startsAt: current.startsAt,
        guestEmail: current.guestEmail,
        icsAttachment: icsCancel,
      });
    }

    return updatedRes.rows[0];
  });
}
