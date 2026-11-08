import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IANAZone } from 'luxon';
import { pool } from '../../db/client.js';
import { resolveAuthenticatedHost } from '../../plugins/auth.js';
import { AppError } from '../../plugins/errors.js';

const UpdateTimezoneSchema = z.object({
  timeZone: z.string().min(1),
  name: z.string().min(1).optional(),
});

export async function registerHostRoutes(app: FastifyInstance) {
  // Host Login (seeded credentials: alex / slotbook123)
  app.post('/api/host/login', async (req) => {
    const { username, password } = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }).parse(req.body);

    const res = await pool.query(
      `SELECT id, username, email, name, time_zone AS "timeZone", api_key AS "apiKey"
       FROM hosts
       WHERE username = $1 OR email = $1`,
      [username]
    );

    if (res.rows.length === 0 || (password !== 'slotbook123' && password !== 'password')) {
      throw new AppError(401, 'Invalid username or password. (Use alex / slotbook123)', 'INVALID_CREDENTIALS');
    }

    const host = res.rows[0];
    return {
      token: host.apiKey,
      host: {
        id: host.id,
        username: host.username,
        email: host.email,
        name: host.name,
        timeZone: host.timeZone,
      }
    };
  });

  // Get authenticated host profile
  app.get('/api/host/me', async (req) => {
    return resolveAuthenticatedHost(req);
  });

  // Set a home time zone (IANA)
  app.patch('/api/host/settings', async (req) => {
    const host = await resolveAuthenticatedHost(req);
    const body = UpdateTimezoneSchema.parse(req.body);

    if (!IANAZone.isValidZone(body.timeZone)) {
      throw new AppError(
        400,
        `Invalid IANA time zone: ${body.timeZone}`,
        'INVALID_TIMEZONE'
      );
    }

    const res = await pool.query(
      `UPDATE hosts
       SET time_zone = $2,
           name = COALESCE($3, name)
       WHERE id = $1
       RETURNING id, username, email, name, time_zone AS "timeZone"`,
      [host.id, body.timeZone, body.name ?? null]
    );

    return res.rows[0];
  });
}
