import type { ChatMessage, SyncPayload, ChatSource } from '@chat-sync/shared';

interface PendingSession {
  sessionId: string;
  projectPath: string;
  source: ChatSource;
  filePath: string;
}

interface PendingOffset {
  filePath: string;
  byteOffset: number;
  lineCount: number;
}

export class Uploader {
  private messageQueue: ChatMessage[] = [];
  private sessionQueue: PendingSession[] = [];
  private offsetQueue: PendingOffset[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private uploading = false;

  constructor(
    private serverUrl: string,
    private machineId: string,
    private intervalMs: number = 3000
  ) {}

  start() {
    this.timer = setInterval(() => this.flush(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  push(messages: ChatMessage[], session: PendingSession, offset: PendingOffset) {
    this.messageQueue.push(...messages);
    // Deduplicate sessions
    if (!this.sessionQueue.find(s => s.sessionId === session.sessionId && s.filePath === session.filePath)) {
      this.sessionQueue.push(session);
    }
    this.offsetQueue.push(offset);

    // Flush immediately if queue is large
    if (this.messageQueue.length >= 100) this.flush();
  }

  async flush() {
    if (this.uploading || this.messageQueue.length === 0) return;
    this.uploading = true;

    const BATCH_SIZE = 500;
    const allMessages = this.messageQueue.splice(0);
    const sessions = this.sessionQueue.splice(0);
    const offsets = this.offsetQueue.splice(0);

    try {
      // Send in batches to avoid payload too large
      for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
        const batch = allMessages.slice(i, i + BATCH_SIZE);
        const isLast = i + BATCH_SIZE >= allMessages.length;

        const payload: SyncPayload = {
          machineId: this.machineId,
          sessions: i === 0 ? sessions : [], // only send sessions in first batch
          messages: batch,
          offsets: isLast ? offsets : [],     // only send offsets in last batch
        };

        const res = await fetch(`${this.serverUrl}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const result = await res.json() as any;
        console.log(`[Sync] Batch uploaded ${result.inserted} messages (${i + batch.length}/${allMessages.length})`);
      }
    } catch (err) {
      console.error(`[Sync] Upload failed, requeueing:`, err);
      this.messageQueue.unshift(...allMessages);
      for (const s of sessions) {
        if (!this.sessionQueue.find(q => q.sessionId === s.sessionId)) {
          this.sessionQueue.push(s);
        }
      }
      this.offsetQueue.unshift(...offsets);
    } finally {
      this.uploading = false;
    }
  }
}
