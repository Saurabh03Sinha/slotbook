import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { pool } from '../src/db/client.js';
import { seedDatabase } from '../src/db/seed.js';
import { buildApp } from '../src/server.js';

describe('Slotbook Real-Postgres Concurrency & Lifecycle Suite', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await seedDatabase();
    await pool.query(
      'TRUNCATE TABLE notification_events, idempotency_keys, bookings RESTART IDENTITY CASCADE'
    );
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('prevents double-booking when 25 concurrent clients race for a 1-on-1 slot', async () => {
    const slotsRes = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/intro-call/slots?tz=America/New_York',
    });
    expect(slotsRes.statusCode).toBe(200);
    const { slots } = slotsRes.json();
    expect(slots.length).toBeGreaterThan(2);
    const targetSlot = slots[0].startUtc;

    // Fire 25 simultaneous hold requests with distinct Idempotency-Keys
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, idx) =>
        app.inject({
          method: 'POST',
          url: '/api/holds',
          headers: { 'Idempotency-Key': `race-1on1-key-${idx}` },
          payload: {
            host: 'alex',
            slug: 'intro-call',
            slotStart: targetSlot,
          },
        })
      )
    );

    const created = responses.filter((r) => r.statusCode === 201);
    const conflicts = responses.filter((r) => r.statusCode === 409);

    expect(created.length).toBe(1);
    expect(conflicts.length).toBe(24);
  });

  it('enforces exact capacity=3 when 20 concurrent clients race for a group session', async () => {
    const slotsRes = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/office-hours/slots?tz=UTC',
    });
    expect(slotsRes.statusCode).toBe(200);
    const { slots } = slotsRes.json();
    expect(slots.length).toBeGreaterThan(0);
    const targetSlot = slots[0].startUtc;

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, idx) =>
        app.inject({
          method: 'POST',
          url: '/api/holds',
          headers: { 'Idempotency-Key': `race-group-key-${idx}` },
          payload: {
            host: 'alex',
            slug: 'office-hours',
            slotStart: targetSlot,
          },
        })
      )
    );

    const created = responses.filter((r) => r.statusCode === 201);
    const conflicts = responses.filter((r) => r.statusCode === 409);

    expect(created.length).toBe(3);
    expect(conflicts.length).toBe(17);
  });

  it('replays Idempotency-Key safely, confirms -> reschedules -> cancels, and emits notifications', async () => {
    const slotsRes = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/intro-call/slots?tz=Asia/Kolkata',
    });
    const { slots } = slotsRes.json();
    // Pick a slot far enough away from the first test's booked slot so buffers don't overlap
    const slotA = slots[3].startUtc;
    const slotB = slots[5].startUtc;

    // 1. Hold slotA
    const hold1 = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { 'Idempotency-Key': 'idem-lifecycle-key-1' },
      payload: { host: 'alex', slug: 'intro-call', slotStart: slotA },
    });
    expect(hold1.statusCode).toBe(201);
    const holdData1 = hold1.json();

    // 2. Replay same Idempotency-Key -> returns same holdId with 200
    const holdReplay = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { 'Idempotency-Key': 'idem-lifecycle-key-1' },
      payload: { host: 'alex', slug: 'intro-call', slotStart: slotA },
    });
    expect(holdReplay.statusCode).toBe(200);
    expect(holdReplay.json().holdId).toBe(holdData1.holdId);
    expect(holdReplay.json().idempotentReplay).toBe(true);

    // 3. Confirm the hold
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/holds/${holdData1.holdId}/confirm`,
      payload: { name: 'Priya Sharma', email: 'priya@example.com' },
    });
    expect(confirmRes.statusCode).toBe(200);
    const { manageToken } = confirmRes.json();
    expect(manageToken).toBeDefined();

    // 4. Reschedule to slotB via manageToken
    const reschedRes = await app.inject({
      method: 'POST',
      url: `/api/bookings/${manageToken}/reschedule`,
      payload: { slotStart: slotB },
    });
    expect(reschedRes.statusCode).toBe(200);
    expect(new Date(reschedRes.json().startsAt).toISOString()).toBe(
      new Date(slotB).toISOString()
    );

    // 5. Cancel via manageToken
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/bookings/${manageToken}/cancel`,
      payload: { reason: 'Schedule conflict' },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe('cancelled');

    // 6. Verify 3 notifications emitted (confirmed, rescheduled, cancelled)
    const notifRes = await app.inject({
      method: 'GET',
      url: '/api/notifications',
    });
    const { events } = notifRes.json();
    const types = events.map((e: any) => e.eventType);
    expect(types).toContain('booking.confirmed');
    expect(types).toContain('booking.rescheduled');
    expect(types).toContain('booking.cancelled');
  });

  it('automatically frees capacity when a 5-minute hold expires without confirmation', async () => {
    const slotsRes = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/intro-call/slots?tz=UTC',
    });
    const targetSlot = slotsRes.json().slots[8].startUtc;

    const holdRes = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { 'Idempotency-Key': 'expiry-test-key-1' },
      payload: { host: 'alex', slug: 'intro-call', slotStart: targetSlot },
    });
    expect(holdRes.statusCode).toBe(201);
    const { holdId } = holdRes.json();

    // Backdate hold_expires_at in Postgres to simulate 5 minutes passing
    await pool.query(
      `UPDATE bookings SET hold_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1`,
      [holdId]
    );

    // Confirming the expired hold must fail with 410 Gone
    const lateConfirm = await app.inject({
      method: 'POST',
      url: `/api/holds/${holdId}/confirm`,
      payload: { name: 'Late Guest', email: 'late@example.com' },
    });
    expect(lateConfirm.statusCode).toBe(410);

    // Another guest can now hold the exact same slot immediately
    const nextHold = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { 'Idempotency-Key': 'expiry-test-key-2' },
      payload: { host: 'alex', slug: 'intro-call', slotStart: targetSlot },
    });
    expect(nextHold.statusCode).toBe(201);
  });
});
