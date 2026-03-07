import { FastifyInstance } from 'fastify';
import { agentSockets, dashboardBroadcast } from '../ws/index.js';
import { db } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';


export async function remoteRoutes(app: FastifyInstance) {
  // Start a remote session on a specific machine
  app.post<{
    Body: {
      machineId: string;
      tool: 'claude' | 'codex';
      sessionId: string;
      cwd: string;
      autoApprove?: boolean;
    };
  }>('/api/remote/start', async (req, reply) => {
    const { machineId, tool, sessionId, cwd, autoApprove } = req.body;
    const agentWs = agentSockets.get(machineId);

    if (!agentWs || agentWs.readyState !== 1) {
      return reply.code(404).send({
        success: false,
        error: `Machine ${machineId} is not connected`,
      });
    }

    const requestId = crypto.randomUUID();

    agentWs.send(JSON.stringify({
      type: 'start-session',
      requestId,
      tool,
      sessionId,
      cwd,
      autoApprove: autoApprove ?? true,
    }));

    return { success: true, requestId };
  });

  // Send input to a remote session
  app.post<{
    Body: {
      machineId: string;
      requestId: string;
      input: string;
    };
  }>('/api/remote/input', async (req, reply) => {
    const { machineId, requestId, input } = req.body;
    const agentWs = agentSockets.get(machineId);

    if (!agentWs || agentWs.readyState !== 1) {
      return reply.code(404).send({ success: false, error: 'Machine not connected' });
    }

    agentWs.send(JSON.stringify({
      type: 'session-input',
      requestId,
      input,
    }));

    return { success: true };
  });

  // Kill a remote session
  app.post<{
    Body: { machineId: string; requestId: string };
  }>('/api/remote/kill', async (req, reply) => {
    const { machineId, requestId } = req.body;
    const agentWs = agentSockets.get(machineId);

    if (!agentWs || agentWs.readyState !== 1) {
      return reply.code(404).send({ success: false, error: 'Machine not connected' });
    }

    agentWs.send(JSON.stringify({
      type: 'kill-session',
      requestId,
    }));

    return { success: true };
  });

  // Continue a conversation (non-interactive resume + prompt)
  app.post<{
    Body: {
      machineId: string;
      sessionId: string;
      source: 'claude' | 'codex';
      prompt: string;
      cwd?: string;
    };
  }>('/api/remote/continue', async (req, reply) => {
    const { machineId, sessionId, source, prompt, cwd } = req.body;
    const agentWs = agentSockets.get(machineId);

    if (!agentWs || agentWs.readyState !== 1) {
      return reply.code(404).send({
        success: false,
        error: `Machine ${machineId} is not connected`,
      });
    }

    // Look up the session's filePath from DB to pass to agent for cwd resolution
    const session = db.select({ filePath: sessions.filePath })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.machineId, machineId)))
      .get();

    const requestId = crypto.randomUUID();

    agentWs.send(JSON.stringify({
      type: 'continue-session',
      requestId,
      sessionId,
      source,
      prompt,
      cwd: cwd || process.env.HOME || '/tmp',
      filePath: session?.filePath || null,
    }));

    return { success: true, requestId };
  });

  // List connected agents
  app.get('/api/remote/agents', async () => {
    const agents: { machineId: string; connected: boolean }[] = [];
    for (const [id, ws] of agentSockets) {
      agents.push({ machineId: id, connected: ws.readyState === 1 });
    }
    return { success: true, data: agents };
  });
}
