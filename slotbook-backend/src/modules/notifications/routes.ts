import { FastifyInstance } from 'fastify';
import { listNotificationEvents } from './service.js';

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async (req) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const events = await listNotificationEvents(limit);
    return { count: events.length, events };
  });
}
