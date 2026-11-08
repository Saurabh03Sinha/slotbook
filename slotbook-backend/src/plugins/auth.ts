import { FastifyRequest } from 'fastify';
import { pool } from '../db/client.js';
import { AppError } from './errors.js';

export interface AuthenticatedHost {
  id: string;
  username: string;
  email: string;
  name: string;
  timeZone: string;
}

export async function resolveAuthenticatedHost(
  req: FastifyRequest
): Promise<AuthenticatedHost> {
  const headerKey =
    (req.headers['x-api-key'] as string | undefined) ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    (process.env.HOST_API_KEY ?? 'demo-host-secret-key');

  const res = await pool.query(
    `SELECT id, username, email, name, time_zone AS "timeZone"
     FROM hosts
     WHERE api_key = $1
     LIMIT 1`,
    [headerKey]
  );

  if (res.rows.length === 0) {
    throw new AppError(401, 'Invalid or missing host credentials', 'UNAUTHORIZED');
  }

  return res.rows[0];
}
