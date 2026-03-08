import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { machines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { MachineInfo, HeartbeatPayload } from '@ai-code-board/shared';
import { broadcast } from '../ws/index.js';

export async function machineRoutes(app: FastifyInstance) {
  // Register machine
  app.post<{ Body: MachineInfo }>('/api/register', async (req, reply) => {
    const info = req.body;
    const now = new Date().toISOString();

    db.insert(machines).values({
      id: info.id,
      hostname: info.hostname,
      ipAddress: info.ipAddress,
      osInfo: info.osInfo,
      sshPort: info.sshPort,
      sshUser: info.sshUser,
      watchDirs: JSON.stringify(info.watchDirs),
      agentVersion: info.agentVersion,
      isOnline: true,
      lastHeartbeat: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: machines.id,
      set: {
        hostname: info.hostname,
        ipAddress: info.ipAddress,
        osInfo: info.osInfo,
        sshPort: info.sshPort,
        sshUser: info.sshUser,
        watchDirs: JSON.stringify(info.watchDirs),
        agentVersion: info.agentVersion,
        isOnline: true,
        lastHeartbeat: now,
        updatedAt: now,
      },
    }).run();

    broadcast({ type: 'machine-online', data: info });
    return { success: true };
  });

  // Heartbeat
  app.post<{ Body: HeartbeatPayload }>('/api/heartbeat', async (req, reply) => {
    const { machineId, ipAddress, timestamp } = req.body;
    const now = new Date().toISOString();

    db.update(machines)
      .set({ ipAddress, isOnline: true, lastHeartbeat: now, updatedAt: now })
      .where(eq(machines.id, machineId))
      .run();

    return { success: true };
  });

  // List all machines
  app.get('/api/machines', async (req, reply) => {
    const result = db.select().from(machines).all();
    return { success: true, data: result.map(m => ({ ...m, watchDirs: JSON.parse(m.watchDirs) })) };
  });

  // Update machine display name
  app.patch<{ Params: { machineId: string }; Body: { displayName: string } }>(
    '/api/machines/:machineId',
    async (req, reply) => {
      const { machineId } = req.params;
      const { displayName } = req.body;
      const now = new Date().toISOString();

      db.update(machines)
        .set({ displayName, updatedAt: now })
        .where(eq(machines.id, machineId))
        .run();

      return { success: true };
    }
  );
}
