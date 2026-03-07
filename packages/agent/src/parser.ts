import type { ChatMessage, ChatSource } from '@chat-sync/shared';

export function detectSource(filePath: string): ChatSource {
  if (filePath.includes('.claude/')) return 'claude';
  if (filePath.includes('.codex/')) return 'codex';
  return 'claude'; // default
}

export function extractSessionId(filePath: string, source: ChatSource): string {
  const filename = filePath.split('/').pop() || '';
  switch (source) {
    case 'claude':
      // UUID.jsonl
      return filename.replace('.jsonl', '');
    case 'codex':
      // rollout-2026-02-26T14-13-46-UUID.jsonl -> extract UUID part
      const match = filename.match(/rollout-[\dT-]+-(.+)\.jsonl/);
      return match ? match[1] : filename.replace('.jsonl', '');
  }
}

export function extractProjectPath(filePath: string, source: ChatSource): string {
  switch (source) {
    case 'claude': {
      // ~/.claude/projects/-home-grey-work-project1/uuid.jsonl
      const match = filePath.match(/\.claude\/projects\/([^/]+)/);
      if (match) {
        // Convert -home-grey-work to /home/grey/work
        return '/' + match[1].replace(/^-/, '').replace(/-/g, '/');
      }
      return filePath;
    }
    case 'codex': {
      // Codex doesn't have per-project dirs, use session cwd from meta
      return filePath;
    }
  }
}

function extractTextContent(content: any): string | null {
  if (typeof content === 'string') return content || null;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === 'object' && item?.type === 'text' && item?.text) {
        return item.text;
      }
      if (typeof item === 'object' && item?.type === 'input_text' && item?.text) {
        return item.text;
      }
    }
  }
  return null;
}

export function parseLine(
  line: string,
  lineNumber: number,
  sessionId: string,
  machineId: string,
  source: ChatSource
): ChatMessage | null {
  try {
    const obj = JSON.parse(line);

    switch (source) {
      case 'claude': {
        const type = obj.type || 'unknown';
        let content: string | null = null;
        let timestamp: string | null = null;

        if (type === 'user' || type === 'human') {
          content = extractTextContent(obj.message?.content);
        } else if (type === 'assistant') {
          content = extractTextContent(obj.message?.content);
        } else if (type === 'summary') {
          content = obj.summary || null;
        }

        // Try to get timestamp from various fields
        timestamp = obj.timestamp || obj.message?.timestamp || obj.snapshot?.timestamp || null;

        return {
          sessionId,
          machineId,
          lineNumber,
          type,
          content,
          rawJson: obj,
          timestamp,
        };
      }

      case 'codex': {
        const type = obj.type || 'unknown';
        let content: string | null = null;
        const timestamp = obj.timestamp || null;

        if (type === 'response_item' && obj.payload) {
          const role = obj.payload.role || 'unknown';
          content = extractTextContent(obj.payload.content);
          return {
            sessionId,
            machineId,
            lineNumber,
            type: role === 'user' ? 'user' : role === 'assistant' ? 'assistant' : type,
            content,
            rawJson: obj,
            timestamp,
          };
        }

        if (type === 'session_meta') {
          return {
            sessionId,
            machineId,
            lineNumber,
            type: 'session_meta',
            content: obj.payload?.cwd || null,
            rawJson: obj,
            timestamp,
          };
        }

        return {
          sessionId, machineId, lineNumber, type, content, rawJson: obj, timestamp,
        };
      }

    }
  } catch {
    return null;
  }
}
