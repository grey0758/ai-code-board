import { useState, useEffect, useCallback, useRef } from 'react';
import type { MachineInfo, SessionInfo, ChatMessage } from '@/types';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  // API wraps responses in { success, data }
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

export function useMachines() {
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<MachineInfo[]>(`${API_BASE}/machines`);
      setMachines(data);
    } catch (err) {
      console.error('Failed to fetch machines:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { machines, loading, refresh };
}

export function useSessions(machineId?: string) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const url = machineId
        ? `${API_BASE}/machines/${machineId}/sessions`
        : `${API_BASE}/sessions`;
      const data = await fetchJson<SessionInfo[]>(url);
      setSessions(data);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh };
}

export function useMessages(sessionId: string, machineId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (machineId) params.set('machineId', machineId);
      const data = await fetchJson<ChatMessage[]>(
        `${API_BASE}/sessions/${sessionId}/messages?${params}`
      );
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, machineId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { messages, loading, refresh };
}

export function useRecentMessages(limit = 50) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<ChatMessage[]>(
        `${API_BASE}/messages/recent?limit=${limit}`
      );
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch recent messages:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { messages, loading, refresh };
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());

  useEffect(() => {
    let ws: WebSocket;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;
    } catch (err) {
      console.warn('WebSocket connection failed:', err);
      return;
    }

    ws.onopen = () => setConnected(true);
    ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
      setConnected(false);
    };
    ws.onclose = () => {
      setConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const listeners = listenersRef.current.get(parsed.type);
        if (listeners) {
          listeners.forEach((fn) => fn(parsed.data));
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const on = useCallback((type: string, fn: (data: unknown) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(fn);
    return () => {
      listenersRef.current.get(type)?.delete(fn);
    };
  }, []);

  return { connected, on };
}

export async function renameMachine(machineId: string, displayName: string) {
  const res = await fetch(`${API_BASE}/machines/${machineId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw new Error('Failed to rename machine');
}

export async function updateSession(
  sessionId: string,
  machineId: string,
  updates: { displayName?: string | null; isStarred?: boolean; isWatched?: boolean }
) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, machineId }),
  });
  if (!res.ok) throw new Error('Failed to update session');
}

export async function continueSession(
  machineId: string,
  sessionId: string,
  source: 'claude' | 'codex',
  prompt: string,
  cwd?: string
) {
  const res = await fetch(`${API_BASE}/remote/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineId, sessionId, source, prompt, cwd }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function backfillFirstMessages() {
  const res = await fetch(`${API_BASE}/sessions/backfill-first-message`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to backfill');
  return res.json();
}
