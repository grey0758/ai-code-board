import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { sessions, messages } from '../db/schema.js';
import { eq, and, gt, desc, asc, isNull } from 'drizzle-orm';

export async function queryRoutes(app: FastifyInstance) {
  // List sessions for a machine
  app.get<{ Params: { machineId: string } }>('/api/machines/:machineId/sessions', async (req) => {
    const result = db.select().from(sessions)
      .where(eq(sessions.machineId, req.params.machineId))
      .all();
    return { success: true, data: result };
  });

  // List all sessions
  app.get('/api/sessions', async () => {
    const result = db.select().from(sessions).all();
    return { success: true, data: result };
  });

  // Get messages for a session (supports incremental with ?since=id)
  app.get<{
    Params: { sessionId: string };
    Querystring: { since?: string; machineId?: string; limit?: string };
  }>('/api/sessions/:sessionId/messages', async (req) => {
    const { sessionId } = req.params;
    const since = parseInt(req.query.since || '0');
    const limit = parseInt(req.query.limit || '200');
    const machineId = req.query.machineId;

    let conditions = [eq(messages.sessionId, sessionId)];
    if (since > 0) conditions.push(gt(messages.id, since));
    if (machineId) conditions.push(eq(messages.machineId, machineId));

    const result = db.select().from(messages)
      .where(and(...conditions))
      .orderBy(messages.id)
      .limit(limit)
      .all();

    return { success: true, data: result };
  });

  // Update session metadata (displayName, starred, watched)
  app.patch<{
    Params: { sessionId: string };
    Body: { displayName?: string; isStarred?: boolean; isWatched?: boolean; machineId?: string };
  }>('/api/sessions/:sessionId', async (req) => {
    const { sessionId } = req.params;
    const { displayName, isStarred, isWatched, machineId } = req.body;

    const set: Record<string, any> = {};
    if (displayName !== undefined) set.displayName = displayName;
    if (isStarred !== undefined) set.isStarred = isStarred;
    if (isWatched !== undefined) set.isWatched = isWatched;

    if (Object.keys(set).length > 0) {
      let q = db.update(sessions).set(set).where(eq(sessions.id, sessionId));
      if (machineId) {
        q = db.update(sessions).set(set).where(and(eq(sessions.id, sessionId), eq(sessions.machineId, machineId)));
      }
      q.run();
    }

    return { success: true };
  });

  // Backfill first_message for sessions that don't have it
  app.post('/api/sessions/backfill-first-message', async () => {
    const emptyOnes = db.select({ id: sessions.id, machineId: sessions.machineId })
      .from(sessions)
      .where(isNull(sessions.firstMessage))
      .all();

    let updated = 0;
    for (const s of emptyOnes) {
      const firstMsg = db.select({ content: messages.content, type: messages.type })
        .from(messages)
        .where(and(
          eq(messages.sessionId, s.id),
          eq(messages.machineId, s.machineId)
        ))
        .orderBy(asc(messages.lineNumber))
        .limit(20)
        .all();

      const userMsg = firstMsg.find(m => m.type === 'user' && m.content && m.content.trim());
      if (userMsg) {
        db.update(sessions)
          .set({ firstMessage: userMsg.content!.slice(0, 200) })
          .where(and(eq(sessions.id, s.id), eq(sessions.machineId, s.machineId)))
          .run();
        updated++;
      }
    }

    return { success: true, updated };
  });

  // Get recent messages across all sessions (for live feed)
  app.get<{ Querystring: { since?: string; limit?: string } }>('/api/messages/recent', async (req) => {
    const since = parseInt(req.query.since || '0');
    const limit = parseInt(req.query.limit || '100');

    const conditions = since > 0 ? [gt(messages.id, since)] : [];

    const result = db.select().from(messages)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(messages.id))
      .limit(limit)
      .all();

    return { success: true, data: result };
  });
}
