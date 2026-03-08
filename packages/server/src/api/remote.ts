import { FastifyInstance } from 'fastify';
import { agentSockets, dashboardBroadcast, pendingRequests } from '../ws/index.js';
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

  // Browse directory on a remote machine
  app.post<{
    Body: {
      machineId: string;
      path?: string;
    };
  }>('/api/remote/browse', async (req, reply) => {
    const { machineId, path } = req.body;
    const agentWs = agentSockets.get(machineId);

    if (!agentWs || agentWs.readyState !== 1) {
      return reply.code(404).send({
        success: false,
        error: `Machine ${machineId} is not connected`,
      });
    }

    const requestId = crypto.randomUUID();

    // Create a promise that resolves when the agent responds
    const result = await new Promise<any>((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve({ error: 'Timeout waiting for directory listing' });
      }, 10000);

      pendingRequests.set(requestId, { resolve, timer });

      agentWs.send(JSON.stringify({
        type: 'list-directory',
        requestId,
        path: path || null,
      }));
    });

    if (result.error) {
      return reply.code(500).send({ success: false, error: result.error });
    }

    return { success: true, data: { path: result.path, items: result.items } };
  });

  // Start a new conversation on a remote machine
  app.post<{
    Body: {
      machineId: string;
      source: 'claude' | 'codex';
      prompt: string;
      cwd: string;
    };
  }>('/api/remote/new-session', async (req, reply) => {
    const { machineId, source, prompt, cwd } = req.body;
    const agentWs = agentSockets.get(machineId);

    if (!agentWs || agentWs.readyState !== 1) {
      return reply.code(404).send({
        success: false,
        error: `Machine ${machineId} is not connected`,
      });
    }

    const requestId = crypto.randomUUID();

    agentWs.send(JSON.stringify({
      type: 'new-session',
      requestId,
      source,
      prompt,
      cwd,
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
