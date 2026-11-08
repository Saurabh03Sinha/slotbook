import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/client.js';
import { resolveAuthenticatedHost } from '../../plugins/auth.js';
import { AppError } from '../../plugins/errors.js';

const CreateEventTypeSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  durationMinutes: z.number().int().min(15).max(120),
  capacity: z.number().int().min(1).default(1),
  bufferBeforeMinutes: z.number().int().min(0).max(30).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(30).default(0),
  minimumNoticeMinutes: z.number().int().min(0).default(240),
  bookingHorizonDays: z.number().int().min(1).max(365).default(30),
});

export async function registerEventRoutes(app: FastifyInstance) {
  // Public list of active event types for a host (used by public navbar)
  app.get('/api/hosts/:host/public-events', async (req) => {
    const { host } = req.params as { host: string };
    const res = await pool.query(
      `SELECT e.id, e.name, e.slug, e.duration_minutes AS "durationMinutes", e.capacity
       FROM event_types e
       JOIN hosts h ON h.id = e.host_id
       WHERE (h.username = $1 OR h.id::text = $1) AND e.active = true
       ORDER BY e.created_at ASC`,
      [host]
    );
    return { events: res.rows };
  });

  // List host's event types
  app.get('/api/host/events', async (req) => {
    const host = await resolveAuthenticatedHost(req);
    const res = await pool.query(
      `SELECT id,
              host_id AS "hostId",
              name,
              slug,
              duration_minutes AS "durationMinutes",
              capacity,
              buffer_before_minutes AS "bufferBeforeMinutes",
              buffer_after_minutes AS "bufferAfterMinutes",
              minimum_notice_minutes AS "minimumNoticeMinutes",
              booking_horizon_days AS "bookingHorizonDays",
              active,
              created_at AS "createdAt"
       FROM event_types
       WHERE host_id = $1
       ORDER BY created_at ASC`,
      [host.id]
    );
    return { events: res.rows };
  });

  // Create event types
  app.post('/api/host/events', async (req, reply) => {
    const host = await resolveAuthenticatedHost(req);
    const body = CreateEventTypeSchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO event_types (
           host_id, name, slug, duration_minutes, capacity,
           buffer_before_minutes, buffer_after_minutes,
           minimum_notice_minutes, booking_horizon_days
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id,
                   host_id AS "hostId",
                   name,
                   slug,
                   duration_minutes AS "durationMinutes",
                   capacity,
                   buffer_before_minutes AS "bufferBeforeMinutes",
                   buffer_after_minutes AS "bufferAfterMinutes",
                   minimum_notice_minutes AS "minimumNoticeMinutes",
                   booking_horizon_days AS "bookingHorizonDays",
                   active`,
        [
          host.id,
          body.name,
          body.slug,
          body.durationMinutes,
          body.capacity,
          body.bufferBeforeMinutes,
          body.bufferAfterMinutes,
          body.minimumNoticeMinutes,
          body.bookingHorizonDays,
        ]
      );
      const createdEvent = res.rows[0];

      // Seed default Mon-Fri 09:00-17:00 availability for the new event type
      for (const weekday of [1, 2, 3, 4, 5]) {
        await client.query(
          `INSERT INTO weekly_availability (event_type_id, weekday, start_time, end_time)
           VALUES ($1, $2, '09:00', '17:00')`,
          [createdEvent.id, weekday]
        );
      }

      await client.query('COMMIT');
      return reply.code(201).send(createdEvent);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') {
        throw new AppError(409, `Event slug '${body.slug}' already exists for this host`, 'DUPLICATE_SLUG');
      }
      throw err;
    } finally {
      client.release();
    }
  });
}
