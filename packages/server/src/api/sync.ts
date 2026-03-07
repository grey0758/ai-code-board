import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { messages, sessions, syncOffsets } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import type { SyncPayload } from '@chat-sync/shared';
import { broadcast } from '../ws/index.js';

export async function syncRoutes(app: FastifyInstance) {
  app.post<{ Body: SyncPayload }>('/api/sync', async (req, reply) => {
    const { machineId, sessions: sessionList, messages: msgList, offsets } = req.body;
    const now = new Date().toISOString();

    // Upsert sessions
    for (const s of sessionList) {
      db.insert(sessions).values({
        id: s.sessionId,
        machineId,
        projectPath: s.projectPath,
        source: s.source,
        filePath: s.filePath,
        createdAt: now,
      }).onConflictDoNothing().run();
    }

    // Insert messages (ignore duplicates)
    const inserted: typeof msgList = [];
    for (const msg of msgList) {
      try {
        db.insert(messages).values({
          sessionId: msg.sessionId,
          machineId: msg.machineId,
          lineNumber: msg.lineNumber,
          type: msg.type,
          content: msg.content,
          rawJson: JSON.stringify(msg.rawJson),
          timestamp: msg.timestamp,
          syncedAt: now,
        }).run();
        inserted.push(msg);
      } catch {
        // duplicate, skip
      }
    }

    // Update session message counts
    for (const s of sessionList) {
      db.run(sql`UPDATE sessions SET
        message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ${s.sessionId} AND machine_id = ${machineId}),
        last_message_at = ${now}
        WHERE id = ${s.sessionId} AND machine_id = ${machineId}`);
    }

    // Upsert offsets
    for (const o of offsets) {
      db.insert(syncOffsets).values({
        machineId,
        filePath: o.filePath,
        byteOffset: o.byteOffset,
        lineCount: o.lineCount,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [syncOffsets.machineId, syncOffsets.filePath],
        set: {
          byteOffset: o.byteOffset,
          lineCount: o.lineCount,
          updatedAt: now,
        },
      }).run();
    }

    // Broadcast new messages to dashboard clients
    if (inserted.length > 0) {
      broadcast({ type: 'new-messages', data: inserted });
    }

    return { success: true, inserted: inserted.length };
  });
}
