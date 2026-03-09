import WebSocket from 'ws';
import { exec } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, sep } from 'path';
import { platform } from 'os';
import { RemoteSession, type SessionRequest } from './remote-session.js';

const isWindows = platform() === 'win32';
const homeDir = process.env.HOME || process.env.USERPROFILE || (isWindows ? 'C:\\' : '/');

export class CommandChannel {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongReceived = true;
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
    if (this.pingTimer) clearInterval(this.pingTimer);
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
      // Start ping/pong heartbeat to detect dead connections
      this.startPingPong();
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch {}
    });

    this.ws.on('pong', () => {
      this.pongReceived = true;
    });

    this.ws.on('close', () => {
      console.log('[CommandChannel] Disconnected');
      this.stopPingPong();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[CommandChannel] Error:', err.message);
    });
  }

  private startPingPong() {
    this.stopPingPong();
    this.pongReceived = true;
    this.pingTimer = setInterval(() => {
      if (!this.pongReceived) {
        // No pong received since last ping — connection is dead
        console.log('[CommandChannel] No pong received, reconnecting...');
        this.ws?.terminate();
        return;
      }
      this.pongReceived = false;
      try {
        this.ws?.ping();
      } catch {
        // ping failed, connection is dead
        this.ws?.terminate();
      }
    }, 30000); // Check every 30 seconds
  }

  private stopPingPong() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    this.stopPingPong();
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
      case 'list-directory':
        this.listDirectory(msg);
        break;
      case 'new-session':
        this.newSession(msg);
        break;
    }
  }

  private startSession(msg: any) {
    const request: SessionRequest = {
      requestId: msg.requestId,
      tool: msg.tool || 'claude',
      sessionId: msg.sessionId,
      cwd: msg.cwd || homeDir,
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

  // Resolve real cwd for a claude session from its filePath
  // filePath: /home/user/.claude/projects/-home-user-my-project/uuid.jsonl
  // The dir name "-home-user-my-project" encodes the original path.
  // We find a matching real directory by checking existence.
  private resolveCwd(filePath: string | null, source: string, fallbackCwd: string): string {
    if (source === 'claude' && filePath) {
      // Extract the encoded project dir name (handle both / and \ separators)
      const match = filePath.match(/\.claude[/\\]projects[/\\]([^/\\]+)/);
      if (match) {
        const encoded = match[1]; // e.g. "-home-grey-test-kanban-test"
        // Strategy: try progressively splitting from right, replacing only path separators
        // The encoded form is: replace / with -, strip leading /
        // So "-home-grey-test-kanban-test" could be /home/grey/test-kanban-test or /home/grey/test/kanban/test etc.
        // We try the longest segments first (fewest splits = fewer /)
        const decoded = this.decodeProjectDir(encoded);
        if (decoded && existsSync(decoded)) {
          return decoded;
        }
      }
    }
    return fallbackCwd;
  }

  // Try to decode a claude project directory name back to a real path
  // by testing which combination of - being / vs literal - results in an existing directory
  private decodeProjectDir(encoded: string): string | null {
    // Remove leading -
    const parts = encoded.replace(/^-/, '').split('-');
    // Try to find the real path by testing combinations
    // Most common: each - is a / (the naive approach)
    // But we need to handle hyphens in directory names
    // Strategy: DFS - try keeping each - as literal or as /
    const results: string[] = [];
    this.findValidPath(parts, 0, '', results);
    if (results.length > 0) return results[0];
    // Fallback: naive join
    const fallback = sep + parts.join(sep);
    return fallback;
  }

  private findValidPath(parts: string[], idx: number, current: string, results: string[]): void {
    if (results.length > 0) return; // found one, stop
    if (idx >= parts.length) {
      // On Windows, check if first part is a drive letter (e.g. "C")
      // encoded path like "-C-Users-foo" → parts = ["C", "Users", "foo"]
      let testPath: string;
      if (isWindows && /^[A-Za-z]$/.test(current.split(sep)[0])) {
        testPath = current.replace(/^([A-Za-z])/, '$1:');
      } else {
        testPath = sep + current;
      }
      if (existsSync(testPath)) results.push(testPath);
      return;
    }
    if (idx === 0) {
      this.findValidPath(parts, idx + 1, parts[idx], results);
      return;
    }
    // Try hyphen as literal first (prefer longer path segments = real hyphens in names)
    this.findValidPath(parts, idx + 1, current + '-' + parts[idx], results);
    // Try hyphen as path separator
    this.findValidPath(parts, idx + 1, current + sep + parts[idx], results);
  }

  private continueSession(msg: any) {
    const { requestId, sessionId, source, prompt, filePath } = msg;
    const cwd = this.resolveCwd(filePath, source, msg.cwd || homeDir);

    this.send({
      type: 'session-started',
      requestId,
      tool: source,
      sessionId,
      cwd,
      mode: 'continue',
    });

    let shellCmd: string;

    if (isWindows) {
      // Windows: use double quotes, escape inner double quotes
      const safePrompt = prompt.replace(/"/g, '\\"');
      if (source === 'claude') {
        shellCmd = `echo 1 | claude -r "${sessionId}" -p "${safePrompt}" --dangerously-skip-permissions`;
      } else {
        shellCmd = `codex exec resume "${sessionId}" "${safePrompt}" --skip-git-repo-check --full-auto`;
      }
    } else {
      // Unix: use single quotes, escape inner single quotes
      const safePrompt = prompt.replace(/'/g, "'\\''");
      if (source === 'claude') {
        shellCmd = `echo 1 | claude -r '${sessionId}' -p '${safePrompt}' --dangerously-skip-permissions`;
      } else {
        shellCmd = `codex exec resume '${sessionId}' '${safePrompt}' --skip-git-repo-check --full-auto < /dev/null`;
      }
    }

    console.log(`[ContinueSession] Running: ${shellCmd} (cwd: ${cwd})`);

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    // Ensure common paths are in PATH
    if (!isWindows && env.PATH && !env.PATH.includes('/usr/local/bin')) {
      env.PATH = `/usr/local/bin:${env.PATH}`;
    }

    exec(shellCmd, {
      cwd,
      env,
      shell: isWindows ? 'cmd.exe' : undefined,
      timeout: 3600000, // 1 hour timeout
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[ContinueSession] Error: ${error.message}`);
        if (stderr) console.error(`[ContinueSession] stderr: ${stderr}`);
        this.send({
          type: 'session-error',
          requestId,
          error: error.message,
        });
      }

      const output = stdout || stderr || '';
      console.log(`[ContinueSession] Completed. Output length: ${output.length}`);

      this.send({
        type: 'session-output',
        requestId,
        data: output,
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

  private listDirectory(msg: any) {
    const { requestId, path: dirPath } = msg;

    // On Windows, if no path or path is "/" (from Unix-oriented UI), list drives
    if (isWindows && (!dirPath || dirPath === '/')) {
      const drives = this.listWindowsDrives();
      this.send({
        type: 'directory-listing',
        requestId,
        path: '/',
        isWindows: true,
        items: drives,
      });
      return;
    }

    const targetPath = dirPath || homeDir;

    try {
      const entries = readdirSync(targetPath, { withFileTypes: true });
      const items = entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          path: join(targetPath, e.name),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      this.send({
        type: 'directory-listing',
        requestId,
        path: targetPath,
        isWindows,
        items,
      });
    } catch (error: any) {
      this.send({
        type: 'directory-listing',
        requestId,
        path: targetPath,
        isWindows,
        items: [],
        error: error.message,
      });
    }
  }

  private listWindowsDrives(): Array<{ name: string; isDirectory: boolean; path: string }> {
    const drives: Array<{ name: string; isDirectory: boolean; path: string }> = [];
    // Check common drive letters A-Z
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const drivePath = `${letter}:\\`;
      try {
        readdirSync(drivePath);
        drives.push({ name: `${letter}:`, isDirectory: true, path: drivePath });
      } catch {
        // Drive doesn't exist or not accessible
      }
    }
    return drives;
  }

  private newSession(msg: any) {
    const { requestId, source, prompt, cwd } = msg;
    const targetCwd = cwd || homeDir;

    this.send({
      type: 'session-started',
      requestId,
      tool: source,
      cwd: targetCwd,
      mode: 'new',
    });

    let shellCmd: string;
    if (isWindows) {
      const safePrompt = prompt.replace(/"/g, '\\"');
      if (source === 'claude') {
        shellCmd = `echo 1 | claude -p "${safePrompt}" --dangerously-skip-permissions`;
      } else {
        shellCmd = `codex exec "${safePrompt}" --skip-git-repo-check --full-auto`;
      }
    } else {
      const safePrompt = prompt.replace(/'/g, "'\\''");
      if (source === 'claude') {
        shellCmd = `echo 1 | claude -p '${safePrompt}' --dangerously-skip-permissions`;
      } else {
        shellCmd = `codex exec '${safePrompt}' --skip-git-repo-check --full-auto < /dev/null`;
      }
    }

    console.log(`[NewSession] Running: ${shellCmd} (cwd: ${targetCwd})`);

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    if (!isWindows && env.PATH && !env.PATH.includes('/usr/local/bin')) {
      env.PATH = `/usr/local/bin:${env.PATH}`;
    }

    exec(shellCmd, {
      cwd: targetCwd,
      env,
      shell: isWindows ? 'cmd.exe' : undefined,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[NewSession] Error: ${error.message}`);
        if (stderr) console.error(`[NewSession] stderr: ${stderr}`);
        this.send({
          type: 'session-error',
          requestId,
          error: error.message,
        });
      }

      const output = stdout || stderr || '';
      console.log(`[NewSession] Completed. Output length: ${output.length}`);

      this.send({
        type: 'session-output',
        requestId,
        data: output,
      });

      this.send({
        type: 'session-exit',
        requestId,
        exitCode: error ? (error as any).code || 1 : 0,
      });
    });
  }
}
