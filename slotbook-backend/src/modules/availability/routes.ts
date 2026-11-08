import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IANAZone } from 'luxon';
import { pool } from '../../db/client.js';
import { resolveAuthenticatedHost } from '../../plugins/auth.js';
import { AppError } from '../../plugins/errors.js';
import { computeAvailableSlots, getEventSlotContext } from './service.js';

const UpsertAvailabilitySchema = z.object({
  weeklyWindows: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ),
  dateOverrides: z
    .array(
      z.object({
        localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isUnavailable: z.boolean().default(false),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      })
    )
    .optional(),
});

export async function registerAvailabilityRoutes(app: FastifyInstance) {
  // Public slots list
  app.get('/api/hosts/:host/events/:slug/slots', async (req) => {
    const params = req.params as { host: string; slug: string };
    const query = req.query as { from?: string; to?: string; tz?: string };

    const guestTz = query.tz ?? 'UTC';
    if (!IANAZone.isValidZone(guestTz)) {
      throw new AppError(400, `Invalid IANA time zone: ${guestTz}`, 'INVALID_TIMEZONE');
    }

    const fromIso = query.from ?? new Date().toISOString();
    const toIso =
      query.to ?? new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    const ctx = await getEventSlotContext(params.host, params.slug);
    if (!ctx) {
      throw new AppError(404, 'Host or event type not found', 'EVENT_NOT_FOUND');
    }

    const slots = await computeAvailableSlots({
      ctx,
      fromIso,
      toIso,
      guestTimeZone: guestTz,
    });

    return {
      host: {
        username: ctx.hostUsername,
        name: ctx.hostName,
        timeZone: ctx.hostTimeZone,
      },
      event: {
        id: ctx.eventId,
        name: ctx.name,
        slug: ctx.slug,
        durationMinutes: ctx.durationMinutes,
        capacity: ctx.capacity,
        bufferBeforeMinutes: ctx.bufferBeforeMinutes,
        bufferAfterMinutes: ctx.bufferAfterMinutes,
        minimumNoticeMinutes: ctx.minimumNoticeMinutes,
        bookingHorizonDays: ctx.bookingHorizonDays,
      },
      guestTimeZone: guestTz,
      slots,
    };
  });

  // Get weekly availability rules and overrides for an event type
  app.get('/api/host/events/:slug/availability', async (req) => {
    const host = await resolveAuthenticatedHost(req);
    const { slug } = req.params as { slug: string };
    const evRes = await pool.query(
      `SELECT id FROM event_types WHERE host_id = $1 AND slug = $2`,
      [host.id, slug]
    );
    if (evRes.rows.length === 0) {
      throw new AppError(404, 'Event type not found', 'EVENT_NOT_FOUND');
    }
    const eventTypeId = evRes.rows[0].id;

    const [weeklyRes, overridesRes] = await Promise.all([
      pool.query(
        `SELECT id, weekday, to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
         FROM weekly_availability WHERE event_type_id = $1 ORDER BY weekday, start_time`,
        [eventTypeId]
      ),
      pool.query(
        `SELECT id, to_char(local_date, 'YYYY-MM-DD') AS "localDate", is_unavailable AS "isUnavailable",
                to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
         FROM date_overrides WHERE event_type_id = $1 ORDER BY local_date`,
        [eventTypeId]
      ),
    ]);

    return {
      weeklyWindows: weeklyRes.rows,
      dateOverrides: overridesRes.rows,
    };
  });

  // Save weekly availability and date overrides
  app.put('/api/host/events/:slug/availability', async (req) => {
    const host = await resolveAuthenticatedHost(req);
    const { slug } = req.params as { slug: string };
    const body = UpsertAvailabilitySchema.parse(req.body);

    const evRes = await pool.query(
      `SELECT id FROM event_types WHERE host_id = $1 AND slug = $2`,
      [host.id, slug]
    );
    if (evRes.rows.length === 0) {
      throw new AppError(404, 'Event type not found', 'EVENT_NOT_FOUND');
    }
    const eventTypeId = evRes.rows[0].id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM weekly_availability WHERE event_type_id = $1`, [
        eventTypeId,
      ]);
      for (const w of body.weeklyWindows) {
        await client.query(
          `INSERT INTO weekly_availability (event_type_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [eventTypeId, w.weekday, w.startTime, w.endTime]
        );
      }

      if (body.dateOverrides) {
        await client.query(`DELETE FROM date_overrides WHERE event_type_id = $1`, [
          eventTypeId,
        ]);
        for (const o of body.dateOverrides) {
          await client.query(
            `INSERT INTO date_overrides (event_type_id, local_date, is_unavailable, start_time, end_time)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              eventTypeId,
              o.localDate,
              o.isUnavailable,
              o.isUnavailable ? null : (o.startTime ?? null),
              o.isUnavailable ? null : (o.endTime ?? null),
            ]
          );
        }
      }
      await client.query('COMMIT');
      return { updated: true, eventTypeId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
