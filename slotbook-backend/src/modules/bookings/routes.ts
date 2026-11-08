import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { resolveAuthenticatedHost } from '../../plugins/auth.js';
import { AppError } from '../../plugins/errors.js';
import {
  cancelBookingRecord,
  confirmSlotHold,
  createSlotHold,
  getBookingByManageToken,
  rescheduleBookingByToken,
} from './service.js';
import { buildIcsCalendarInvite } from '../notifications/service.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CreateHoldSchema = z.object({
  host: z.string().min(1, 'Host username is required'),
  slug: z.string().min(1, 'Event slug is required'),
  slotStart: z.string().datetime({ offset: true, message: 'Invalid ISO slotStart timestamp' }),
});

const ConfirmHoldSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name (at least 2 characters)').max(160),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address (e.g. name@example.com)')
    .regex(EMAIL_REGEX, 'Email must include a valid domain extension (e.g. .com, .in, .org)')
    .max(320),
});

const RescheduleSchema = z.object({
  slotStart: z.string().datetime({ offset: true, message: 'Invalid ISO slotStart timestamp' }),
});

const CancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function registerBookingRoutes(app: FastifyInstance) {
  /**
   * Minimum API:
   * POST /api/holds (takes an Idempotency-Key header)
   */
  app.post('/api/holds', async (req, reply) => {
    // Prevent authenticated host from booking slots while logged in
    const hostKey = req.headers['x-host-session'] as string | undefined;
    if (hostKey) {
      throw new AppError(
        403,
        'Hosts cannot book slots while logged in. Please log out of Host Dashboard to book as a guest.',
        'HOST_BOOKING_FORBIDDEN'
      );
    }

    const idempotencyKey = (req.headers['idempotency-key'] as string) ?? '';
    const body = CreateHoldSchema.parse(req.body);

    const result = await createSlotHold({
      host: body.host,
      slug: body.slug,
      slotStart: body.slotStart,
      idempotencyKey,
    });

    return reply.code(result.statusCode).send(result.body);
  });

  /**
   * Minimum API:
   * POST /api/holds/:id/confirm
   */
  app.post('/api/holds/:id/confirm', async (req) => {
    const { id } = req.params as { id: string };
    const body = ConfirmHoldSchema.parse(req.body);

    return confirmSlotHold({
      holdId: id,
      guestName: body.name,
      guestEmail: body.email,
    });
  });

  /**
   * Guest manage link view:
   * GET /api/bookings/:token
   */
  app.get('/api/bookings/:token', async (req) => {
    const { token } = req.params as { token: string };
    return getBookingByManageToken(token);
  });

  /**
   * Optional extension: Downloadable .ics calendar invite for a booking
   * GET /api/bookings/:token/invite.ics
   */
  app.get('/api/bookings/:token/invite.ics', async (req, reply) => {
    const { token } = req.params as { token: string };
    const b = await getBookingByManageToken(token);
    const ics = buildIcsCalendarInvite({
      bookingId: b.id,
      eventName: b.eventName,
      hostName: b.hostName,
      hostEmail: b.hostEmail,
      guestName: b.guestName ?? 'Guest',
      guestEmail: b.guestEmail ?? 'guest@example.com',
      startsAtIso: new Date(b.startsAt).toISOString(),
      endsAtIso: new Date(b.endsAt).toISOString(),
      status: b.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    });
    reply.header('Content-Type', 'text/calendar; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="booking-${b.id}.ics"`);
    return reply.send(ics);
  });

  /**
   * Minimum API:
   * POST /api/bookings/:token/reschedule
   */
  app.post('/api/bookings/:token/reschedule', async (req) => {
    const { token } = req.params as { token: string };
    const body = RescheduleSchema.parse(req.body);

    return rescheduleBookingByToken({
      token,
      newSlotStart: body.slotStart,
    });
  });

  /**
   * Minimum API:
   * POST /api/bookings/:token/cancel
   */
  app.post('/api/bookings/:token/cancel', async (req) => {
    const { token } = req.params as { token: string };
    const body = CancelSchema.parse(req.body ?? {});

    return cancelBookingRecord({
      token,
      cancelledBy: 'guest',
      reason: body.reason,
    });
  });

  /**
   * Host surface 4:
   * See upcoming bookings and cancel one with a reason
   */
  app.get('/api/host/bookings', async (req) => {
    const host = await resolveAuthenticatedHost(req);
    const res = await pool.query(
      `SELECT b.id,
              b.status,
              b.starts_at AS "startsAt",
              b.ends_at AS "endsAt",
              b.hold_expires_at AS "holdExpiresAt",
              b.guest_name AS "guestName",
              b.guest_email AS "guestEmail",
              b.cancellation_reason AS "cancellationReason",
              e.name AS "eventName",
              e.slug AS "eventSlug"
       FROM bookings b
       JOIN event_types e ON e.id = b.event_type_id
       WHERE b.host_id = $1
         AND b.ends_at >= NOW()
         AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW()))
       ORDER BY b.starts_at ASC`,
      [host.id]
    );
    return { bookings: res.rows };
  });

  app.post('/api/host/bookings/:id/cancel', async (req) => {
    await resolveAuthenticatedHost(req);
    const { id } = req.params as { id: string };
    const body = z.object({ reason: z.string().min(1) }).parse(req.body);

    return cancelBookingRecord({
      bookingId: id,
      cancelledBy: 'host',
      reason: body.reason,
    });
  });
}
