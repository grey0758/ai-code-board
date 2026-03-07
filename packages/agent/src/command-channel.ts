import WebSocket from 'ws';
import { execFile } from 'child_process';
import { RemoteSession, type SessionRequest } from './remote-session.js';

export class CommandChannel {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSessions = new Map<string, RemoteSession>();

  constructor(
    private serverUrl: string,
    private machineId: string
  ) {}

  start() {
    this.connect();
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    for (const session of this.activeSessions.values()) {
      session.kill();
    }
  }

  private connect() {
    const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws/agent';

    try {
      this.ws = new WebSocket(wsUrl, {
        headers: { 'x-machine-id': this.machineId },
      });
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      console.log('[CommandChannel] Connected to server');
      // Identify this agent
      this.send({
        type: 'agent-identify',
        machineId: this.machineId,
      });
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch {}
    });

    this.ws.on('close', () => {
      console.log('[CommandChannel] Disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[CommandChannel] Error:', err.message);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'start-session':
        this.startSession(msg);
        break;
      case 'session-input':
        this.sessionInput(msg);
        break;
      case 'session-resize':
        this.sessionResize(msg);
        break;
      case 'kill-session':
        this.killSession(msg);
        break;
      case 'continue-session':
        this.continueSession(msg);
        break;
      case 'list-sessions':
        this.listSessions(msg);
        break;
    }
  }

  private startSession(msg: any) {
    const request: SessionRequest = {
      requestId: msg.requestId,
      tool: msg.tool || 'claude',
      sessionId: msg.sessionId,
      cwd: msg.cwd || process.env.HOME || '/tmp',
      autoApprove: msg.autoApprove ?? true,
    };

    // Kill existing session with same requestId if any
    if (this.activeSessions.has(request.requestId)) {
      this.activeSessions.get(request.requestId)!.kill();
    }

    const session = new RemoteSession(request, this.machineId);

    session.on('data', (data: string) => {
      this.send({
        type: 'session-output',
        requestId: request.requestId,
        data,
      });
    });

    session.on('exit', (code: number) => {
      this.send({
        type: 'session-exit',
        requestId: request.requestId,
        exitCode: code,
      });
      this.activeSessions.delete(request.requestId);
    });

    session.on('error', (error: string) => {
      this.send({
        type: 'session-error',
        requestId: request.requestId,
        error,
      });
    });

    this.activeSessions.set(request.requestId, session);
    session.start();

    this.send({
      type: 'session-started',
      requestId: request.requestId,
      tool: request.tool,
      sessionId: request.sessionId,
      cwd: request.cwd,
    });
  }

  private sessionInput(msg: any) {
    const session = this.activeSessions.get(msg.requestId);
    if (session) {
      session.write(msg.input);
    }
  }

  private sessionResize(msg: any) {
    const session = this.activeSessions.get(msg.requestId);
    if (session) {
      session.resize(msg.cols || 120, msg.rows || 40);
    }
  }

  private killSession(msg: any) {
    const session = this.activeSessions.get(msg.requestId);
    if (session) {
      session.kill();
      this.activeSessions.delete(msg.requestId);
    }
  }

  private continueSession(msg: any) {
    const { requestId, sessionId, source, prompt, cwd } = msg;

    this.send({
      type: 'session-started',
      requestId,
      tool: source,
      sessionId,
      cwd,
      mode: 'continue',
    });

    let cmd: string;
    let args: string[];

    if (source === 'claude') {
      cmd = 'claude';
      args = ['-r', sessionId, '-p', prompt];
    } else {
      // codex exec resume <sessionId> <prompt>
      cmd = 'codex';
      args = ['exec', 'resume', sessionId, prompt];
    }

    console.log(`[ContinueSession] Running: ${cmd} ${args.join(' ')}`);

    const env = { ...process.env, CLAUDECODE: undefined, CLAUDE_CODE_ENTRYPOINT: undefined };

    const child = execFile(cmd, args, {
      cwd,
      env,
      timeout: 300000, // 5 min timeout
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ContinueSession] Error: ${error.message}`);
        this.send({
          type: 'session-error',
          requestId,
          error: error.message,
        });
      }

      this.send({
        type: 'session-output',
        requestId,
        data: stdout || stderr || '',
      });

      this.send({
        type: 'session-exit',
        requestId,
        exitCode: error ? (error as any).code || 1 : 0,
      });
    });
  }

  private listSessions(msg: any) {
    const sessions = Array.from(this.activeSessions.keys());
    this.send({
      type: 'active-sessions',
      requestId: msg.requestId,
      sessions,
    });
  }
}
