import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { pool } from './db/client.js';
import { seedDatabase } from './db/seed.js';
import { AppError } from './plugins/errors.js';
import { registerHostRoutes } from './modules/hosts/routes.js';
import { registerEventRoutes } from './modules/events/routes.js';
import { registerAvailabilityRoutes } from './modules/availability/routes.js';
import { registerBookingRoutes } from './modules/bookings/routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';

export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    requestIdHeader: 'x-request-id',
  });

  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Slotbook API',
        description: 'Transactional scheduling and booking engine on PostgreSQL',
        version: '1.0.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', async (_request, reply) => {
    try {
      const statsRes = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS "confirmedBookings",
          COUNT(*) FILTER (WHERE status = 'held' AND hold_expires_at > NOW())::int AS "activeHolds",
          COUNT(*) FILTER (WHERE status = 'expired' OR (status = 'held' AND hold_expires_at <= NOW()))::int AS "expiredHolds",
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledBookings",
          (SELECT COUNT(*)::int FROM notification_events) AS "notificationsEmitted"
        FROM bookings
      `);
      return {
        status: 'ok',
        database: 'connected',
        metrics: statsRes.rows[0],
      };
    } catch {
      return reply.code(503).send({ status: 'degraded', database: 'unavailable' });
    }
  });

  await registerHostRoutes(app);
  await registerEventRoutes(app);
  await registerAvailabilityRoutes(app);
  await registerBookingRoutes(app);
  await registerNotificationRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
        requestId: request.id,
      });
    }
    if (error instanceof ZodError) {
      const firstIssue = error.errors[0];
      const field = firstIssue?.path?.join('.') || 'input';
      const friendlyMessage = firstIssue?.message
        ? `${firstIssue.message} (${field})`
        : 'Validation Error';
      return reply.code(400).send({
        error: friendlyMessage,
        details: error.errors,
        requestId: request.id,
      });
    }
    request.log.error(error);
    const status =
      (error as any).statusCode && (error as any).statusCode >= 400
        ? (error as any).statusCode
        : 500;
    return reply.code(status).send({
      error: status === 500 ? 'Internal Server Error' : (error as Error).message,
      requestId: request.id,
    });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  try {
    const seeded = await seedDatabase();
    const app = await buildApp({ logger: true });
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(
      `Seeded demo host '${seeded.username}' (x-api-key: ${seeded.apiKey}) with events: ${seeded.events.map((e) => e.slug).join(', ')}`
    );

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, async () => {
        await app.close();
        await pool.end();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error('Failed to start Slotbook backend:', error);
    process.exit(1);
  }
}
