// Source types for different AI tools
export type ChatSource = 'claude' | 'codex' | 'openclaw';

// Machine registration
export interface MachineInfo {
  id: string;           // hardware UUID from /etc/machine-id
  hostname: string;
  ipAddress: string;
  osInfo: string;
  sshPort: number;
  sshUser: string;
  watchDirs: string[];  // directories being watched
  agentVersion: string;
  isOnline: boolean;
  lastHeartbeat: string;
}

// Session info
export interface SessionInfo {
  id: string;
  machineId: string;
  projectPath: string;
  source: ChatSource;
  filePath: string;
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

// Parsed message from JSONL
export interface ChatMessage {
  sessionId: string;
  machineId: string;
  lineNumber: number;
  type: string;          // 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot' etc
  content: string | null;
  rawJson: Record<string, any>;
  timestamp: string | null;
}

// Sync batch payload from agent to server
export interface SyncPayload {
  machineId: string;
  sessions: {
    sessionId: string;
    projectPath: string;
    source: ChatSource;
    filePath: string;
  }[];
  messages: ChatMessage[];
  offsets: {
    filePath: string;
    byteOffset: number;
    lineCount: number;
  }[];
}

// Heartbeat payload
export interface HeartbeatPayload {
  machineId: string;
  ipAddress: string;
  timestamp: string;
}

// WebSocket events from server to dashboard
export type WsEvent =
  | { type: 'new-messages'; data: ChatMessage[] }
  | { type: 'machine-online'; data: MachineInfo }
  | { type: 'machine-offline'; data: { machineId: string } }
  | { type: 'catch-up'; data: ChatMessage[]; lastId: number }
  | { type: 'heartbeat'; data: { machineId: string; timestamp: string } };

// API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Config for agent
export interface AgentConfig {
  serverUrl: string;
  watchDirs: string[];
  syncIntervalMs: number;
  heartbeatIntervalMs: number;
  sshPort: number;
  sshUser: string;
}
