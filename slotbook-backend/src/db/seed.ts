import { fileURLToPath } from 'node:url';
import { pool } from './client.js';
import { runMigrations } from './migrate.js';

export async function seedDatabase(): Promise<{
  hostId: string;
  username: string;
  apiKey: string;
  events: Array<{ id: string; slug: string; name: string }>;
}> {
  await runMigrations();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hostRes = await client.query(
      `INSERT INTO hosts (username, email, name, time_zone, api_key)
       VALUES ('alex', 'alex@slotbook.dev', 'Godfrey Loux', 'America/New_York', $1)
       ON CONFLICT (username) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           api_key = EXCLUDED.api_key
       RETURNING id, username, api_key AS "apiKey"`,
      [process.env.HOST_API_KEY ?? 'demo-host-secret-key']
    );
    const host = hostRes.rows[0];

    const ev1Res = await client.query(
      `INSERT INTO event_types (
         host_id, name, slug, duration_minutes, capacity,
         buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days
       )
       VALUES ($1, '30-Min 1-on-1 Consultation', 'intro-call', 30, 1, 10, 10, 240, 30)
       ON CONFLICT (host_id, slug) DO UPDATE
       SET duration_minutes = EXCLUDED.duration_minutes,
           capacity = EXCLUDED.capacity,
           buffer_before_minutes = EXCLUDED.buffer_before_minutes,
           buffer_after_minutes = EXCLUDED.buffer_after_minutes
       RETURNING id, slug, name`,
      [host.id]
    );

    const ev2Res = await client.query(
      `INSERT INTO event_types (
         host_id, name, slug, duration_minutes, capacity,
         buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days
       )
       VALUES ($1, 'Architecture Office Hours (Group)', 'office-hours', 60, 3, 0, 15, 120, 30)
       ON CONFLICT (host_id, slug) DO UPDATE
       SET duration_minutes = EXCLUDED.duration_minutes,
           capacity = EXCLUDED.capacity,
           buffer_before_minutes = EXCLUDED.buffer_before_minutes,
           buffer_after_minutes = EXCLUDED.buffer_after_minutes
       RETURNING id, slug, name`,
      [host.id]
    );

    const events = [ev1Res.rows[0], ev2Res.rows[0]];

    for (const ev of events) {
      const existing = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM weekly_availability WHERE event_type_id = $1`,
        [ev.id]
      );
      if (existing.rows[0].cnt === 0) {
        // ISO-8601 weekdays 1 (Monday) through 5 (Friday): two windows per day
        for (const weekday of [1, 2, 3, 4, 5]) {
          await client.query(
            `INSERT INTO weekly_availability (event_type_id, weekday, start_time, end_time)
             VALUES ($1, $2, '09:00', '12:00'), ($1, $2, '13:00', '17:00')`,
            [ev.id, weekday]
          );
        }
      }
    }

    await client.query('COMMIT');
    return {
      hostId: host.id,
      username: host.username,
      apiKey: host.apiKey,
      events,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(async (seeded) => {
      console.log('Seeded demo host and events:', seeded);
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await pool.end();
      process.exit(1);
    });
}
