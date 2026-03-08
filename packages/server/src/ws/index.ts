import { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { WsEvent } from '@chat-sync/shared';

// Dashboard clients (browsers)
const dashboardClients = new Set<WebSocket>();

// Agent connections: machineId -> WebSocket
export const agentSockets = new Map<string, WebSocket>();

// Dashboard clients subscribed to a specific remote session: requestId -> Set<WebSocket>
const sessionSubscribers = new Map<string, Set<WebSocket>>();

// Pending request-response callbacks for agent commands (e.g. directory listing)
export const pendingRequests = new Map<string, { resolve: (data: any) => void; timer: ReturnType<typeof setTimeout> }>();

export function broadcast(event: WsEvent) {
  const data = JSON.stringify(event);
  for (const client of dashboardClients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

export function dashboardBroadcast(event: any) {
  const data = JSON.stringify(event);
  for (const client of dashboardClients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

// Send session output to subscribed dashboard clients
function relaySessionOutput(msg: any) {
  const { requestId } = msg;
  const subscribers = sessionSubscribers.get(requestId);
  const data = JSON.stringify(msg);

  // Send to specific subscribers
  if (subscribers) {
    for (const client of subscribers) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  // Also broadcast to all dashboard clients
  for (const client of dashboardClients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

export async function setupWebSocket(app: FastifyInstance) {
  // Dashboard WebSocket (browsers)
  app.get('/ws/live', { websocket: true }, (socket, req) => {
    dashboardClients.add(socket);
    console.log(`[WS] Dashboard connected. Total: ${dashboardClients.size}`);

    socket.on('close', () => {
      dashboardClients.delete(socket);
      // Clean up subscriptions
      for (const [requestId, subs] of sessionSubscribers) {
        subs.delete(socket);
        if (subs.size === 0) sessionSubscribers.delete(requestId);
      }
      console.log(`[WS] Dashboard disconnected. Total: ${dashboardClients.size}`);
    });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
        // Subscribe to a remote session's output
        if (msg.type === 'subscribe-session') {
          const subs = sessionSubscribers.get(msg.requestId) || new Set();
          subs.add(socket);
          sessionSubscribers.set(msg.requestId, subs);
        }
        // Forward input to agent via server
        if (msg.type === 'session-input') {
          const agentWs = agentSockets.get(msg.machineId);
          if (agentWs?.readyState === 1) {
            agentWs.send(JSON.stringify({
              type: 'session-input',
              requestId: msg.requestId,
              input: msg.input,
            }));
          }
        }
      } catch {}
    });

    socket.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
      connectedAgents: Array.from(agentSockets.keys()),
    }));
  });

  // Agent WebSocket (agents on remote machines)
  app.get('/ws/agent', { websocket: true }, (socket, req) => {
    let machineId: string | null = null;

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Agent identification
        if (msg.type === 'agent-identify') {
          machineId = msg.machineId;
          agentSockets.set(machineId!, socket);
          console.log(`[WS] Agent connected: ${machineId}. Total agents: ${agentSockets.size}`);

          // Notify dashboard
          dashboardBroadcast({
            type: 'agent-connected',
            machineId,
          });
          return;
        }

        // Resolve pending request-response (e.g. directory-listing)
        if (msg.requestId && pendingRequests.has(msg.requestId)) {
          const pending = pendingRequests.get(msg.requestId)!;
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.requestId);
          pending.resolve(msg);
        }

        // Relay session output/events from agent to dashboard clients
        if (msg.type === 'session-output' ||
            msg.type === 'session-exit' ||
            msg.type === 'session-error' ||
            msg.type === 'session-started' ||
            msg.type === 'active-sessions') {
          relaySessionOutput(msg);
        }
      } catch {}
    });

    socket.on('close', () => {
      if (machineId) {
        agentSockets.delete(machineId);
        console.log(`[WS] Agent disconnected: ${machineId}. Total agents: ${agentSockets.size}`);

        dashboardBroadcast({
          type: 'agent-disconnected',
          machineId,
        });
      }
    });
  });
}
