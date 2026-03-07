import { getLocalIP } from './machine-id.js';

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private serverUrl: string,
    private machineId: string,
    private intervalMs: number = 30000
  ) {}

  start() {
    this.send(); // Send immediately
    this.timer = setInterval(() => this.send(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async send() {
    try {
      await fetch(`${this.serverUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: this.machineId,
          ipAddress: getLocalIP(),
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Silent fail, will retry
    }
  }
}
