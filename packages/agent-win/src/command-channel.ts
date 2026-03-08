import WebSocket from 'ws';
import { exec } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, delimiter, sep } from 'path';
import { platform, homedir } from 'os';
import { RemoteSession, type SessionRequest } from './remote-session.js';

const isWin = platform() === 'win32';

/** Get user home directory cross-platform */
function getHome(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/** Get temp directory cross-platform */
function getTmp(): string {
  return process.env.TEMP || process.env.TMP || (isWin ? 'C:\\Temp' : '/tmp');
}

/** Null device path */
const NULL_DEVICE = isWin ? 'NUL' : '/dev/null';

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
      cwd: msg.cwd || getHome() || getTmp(),
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
  // filePath examples:
  //   Linux: /home/user/.claude/projects/-home-user-my-project/uuid.jsonl
  //   Windows: C:\Users\user\.claude\projects\-C-Users-user-my-project\uuid.jsonl
  private resolveCwd(filePath: string | null, source: string, fallbackCwd: string): string {
    if (source === 'claude' && filePath) {
      // Normalize to forward slashes for consistent matching
      const normalized = filePath.replace(/\\/g, '/');
      const match = normalized.match(/\.claude\/projects\/([^/]+)/);
      if (match) {
        const encoded = match[1];
        const decoded = this.decodeProjectDir(encoded);
        if (decoded && existsSync(decoded)) {
          return decoded;
        }
      }
    }
    return fallbackCwd;
  }

  // Try to decode a claude project directory name back to a real path
  private decodeProjectDir(encoded: string): string | null {
    // Remove leading -
    const stripped = encoded.replace(/^-/, '');
    const parts = stripped.split('-');

    // Detect Windows-style path (starts with single letter like C)
    if (isWin && parts.length > 0 && /^[A-Za-z]$/.test(parts[0])) {
      // Windows: C-Users-user-work -> try C:\Users\user\work
      const results: string[] = [];
      this.findValidPathWin(parts, 1, parts[0] + ':', results);
      if (results.length > 0) return results[0];
      // Naive fallback
      return parts[0] + ':\\' + parts.slice(1).join('\\');
    }

    // Unix path
    const results: string[] = [];
    this.findValidPath(parts, 0, '', results);
    return results.length > 0 ? results[0] : '/' + parts.join('/');
  }

  private findValidPath(parts: string[], idx: number, current: string, results: string[]): void {
    if (results.length > 0) return;
    if (idx >= parts.length) {
      const path = '/' + current;
      if (existsSync(path)) results.push(path);
      return;
    }
    if (idx === 0) {
      this.findValidPath(parts, idx + 1, parts[idx], results);
      return;
    }
    // Try hyphen as literal first (prefer longer path segments = real hyphens in names)
    this.findValidPath(parts, idx + 1, current + '-' + parts[idx], results);
    // Try hyphen as /
    this.findValidPath(parts, idx + 1, current + '/' + parts[idx], results);
  }

  private findValidPathWin(parts: string[], idx: number, current: string, results: string[]): void {
    if (results.length > 0) return;
    if (idx >= parts.length) {
      if (existsSync(current)) results.push(current);
      return;
    }
    // Try hyphen as literal first
    this.findValidPathWin(parts, idx + 1, current + '-' + parts[idx], results);
    // Try hyphen as \
    this.findValidPathWin(parts, idx + 1, current + '\\' + parts[idx], results);
  }

  private continueSession(msg: any) {
    const { requestId, sessionId, source, prompt, filePath } = msg;
    const cwd = this.resolveCwd(filePath, source, msg.cwd || getHome() || getTmp());

    this.send({
      type: 'session-started',
      requestId,
      tool: source,
      sessionId,
      cwd,
      mode: 'continue',
    });

    let shellCmd: string;

    if (isWin) {
      // Windows: use cmd /c, no /dev/null redirect needed
      const safePrompt = prompt.replace(/"/g, '\\"');
      if (source === 'claude') {
        shellCmd = `claude -r "${sessionId}" -p "${safePrompt}" --dangerously-skip-permissions`;
      } else {
        shellCmd = `codex exec resume "${sessionId}" "${safePrompt}" --skip-git-repo-check --full-auto`;
      }
    } else {
      // Unix: escape single quotes
      const safePrompt = prompt.replace(/'/g, "'\\''");
      if (source === 'claude') {
        shellCmd = `claude -r '${sessionId}' -p '${safePrompt}' --dangerously-skip-permissions < /dev/null`;
      } else {
        shellCmd = `codex exec resume '${sessionId}' '${safePrompt}' --skip-git-repo-check --full-auto < /dev/null`;
      }
    }

    console.log(`[ContinueSession] Running: ${shellCmd} (cwd: ${cwd})`);

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    // Ensure common tool paths are in PATH
    if (!isWin) {
      if (env.PATH && !env.PATH.includes('/usr/local/bin')) {
        env.PATH = `/usr/local/bin:${env.PATH}`;
      }
    } else {
      // Windows: add common npm global paths
      const appData = process.env.APPDATA;
      if (appData && env.PATH) {
        const npmGlobal = join(appData, 'npm');
        if (!env.PATH.includes(npmGlobal)) {
          env.PATH = `${npmGlobal}${delimiter}${env.PATH}`;
        }
      }
    }

    const execOptions: any = {
      cwd,
      env,
      timeout: 3600000, // 1 hour timeout
      maxBuffer: 10 * 1024 * 1024,
    };
    if (isWin) {
      execOptions.shell = 'cmd.exe';
      execOptions.windowsHide = true;
    }

    exec(shellCmd, execOptions, (error, stdout, stderr) => {
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
    const targetPath = dirPath || getHome() || (isWin ? 'C:\\' : '/');

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
        items,
      });
    } catch (error: any) {
      this.send({
        type: 'directory-listing',
        requestId,
        path: targetPath,
        items: [],
        error: error.message,
      });
    }
  }

  private newSession(msg: any) {
    const { requestId, source, prompt, cwd } = msg;
    const targetCwd = cwd || getHome() || getTmp();

    this.send({
      type: 'session-started',
      requestId,
      tool: source,
      cwd: targetCwd,
      mode: 'new',
    });

    let shellCmd: string;
    if (isWin) {
      const safePrompt = prompt.replace(/"/g, '\\"');
      if (source === 'claude') {
        shellCmd = `claude -p "${safePrompt}" --dangerously-skip-permissions`;
      } else {
        shellCmd = `codex exec "${safePrompt}" --skip-git-repo-check --full-auto`;
      }
    } else {
      const safePrompt = prompt.replace(/'/g, "'\\''");
      if (source === 'claude') {
        shellCmd = `claude -p '${safePrompt}' --dangerously-skip-permissions < /dev/null`;
      } else {
        shellCmd = `codex exec '${safePrompt}' --skip-git-repo-check --full-auto < /dev/null`;
      }
    }

    console.log(`[NewSession] Running: ${shellCmd} (cwd: ${targetCwd})`);

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    if (!isWin) {
      if (env.PATH && !env.PATH.includes('/usr/local/bin')) {
        env.PATH = `/usr/local/bin:${env.PATH}`;
      }
    } else {
      const appData = process.env.APPDATA;
      if (appData && env.PATH) {
        const npmGlobal = join(appData, 'npm');
        if (!env.PATH.includes(npmGlobal)) {
          env.PATH = `${npmGlobal}${delimiter}${env.PATH}`;
        }
      }
    }

    const execOptions: any = {
      cwd: targetCwd,
      env,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    };
    if (isWin) {
      execOptions.shell = 'cmd.exe';
      execOptions.windowsHide = true;
    }

    exec(shellCmd, execOptions, (error, stdout, stderr) => {
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
