import { open, stat } from 'fs/promises';
import { parseLine, detectSource, extractSessionId, extractProjectPath } from './parser.js';
import { OffsetStore } from './offset-store.js';
import type { ChatMessage, SyncPayload } from '@ai-code-board/shared';

export class IncrementalReader {
  constructor(
    private machineId: string,
    private offsetStore: OffsetStore
  ) {}

  async readFile(filePath: string): Promise<{
    messages: ChatMessage[];
    newOffset: number;
    newLineCount: number;
    sessionId: string;
    source: ReturnType<typeof detectSource>;
    projectPath: string;
  } | null> {
    const source = detectSource(filePath);
    const sessionId = extractSessionId(filePath, source);
    const projectPath = extractProjectPath(filePath, source);
    const { byteOffset, lineCount } = this.offsetStore.get(filePath);

    let fileSize: number;
    try {
      const s = await stat(filePath);
      fileSize = s.size;
    } catch {
      return null;
    }

    if (fileSize <= byteOffset) return null;

    const fd = await open(filePath, 'r');
    try {
      const buf = Buffer.alloc(fileSize - byteOffset);
      await fd.read(buf, 0, buf.length, byteOffset);

      const text = buf.toString('utf-8');
      const lines = text.split('\n').filter(l => l.trim());
      const messages: ChatMessage[] = [];

      for (let i = 0; i < lines.length; i++) {
        const msg = parseLine(lines[i], lineCount + i, sessionId, this.machineId, source);
        if (msg) messages.push(msg);
      }

      return {
        messages,
        newOffset: fileSize,
        newLineCount: lineCount + lines.length,
        sessionId,
        source,
        projectPath,
      };
    } finally {
      await fd.close();
    }
  }
}
