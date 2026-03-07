export type ChatSource = 'claude' | 'codex';

export interface MachineInfo {
  id: string;
  hostname: string;
  displayName: string | null;
  ipAddress: string;
  osInfo: string;
  sshPort: number;
  sshUser: string;
  watchDirs: string[];
  agentVersion: string;
  isOnline: boolean;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  id: string;
  machineId: string;
  projectPath: string;
  source: ChatSource;
  filePath: string;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  createdAt: string;
  displayName: string | null;
  firstMessage: string | null;
  isStarred: boolean;
  isWatched: boolean;
}

export interface ChatMessage {
  id?: number;
  sessionId: string;
  machineId: string;
  lineNumber: number;
  type: string;
  content: string;
  rawJson: string;
  timestamp: string;
  syncedAt?: string;
}
