import { EventEmitter } from 'events';
import { platform } from 'os';

const isWin = platform() === 'win32';

// node-pty is optional — interactive PTY sessions won't work without it,
// but exec-based continue/new sessions will still function fine.
let pty: typeof import('node-pty') | null = null;
try {
  pty = await import('node-pty');
} catch {
  console.warn('[RemoteSession] node-pty not available — interactive PTY sessions disabled.');
  console.warn('[RemoteSession] Continue/New sessions (exec mode) will still work.');
}

export interface SessionRequest {
  requestId: string;
  tool: 'claude' | 'codex';
  sessionId: string;
  cwd: string;
  autoApprove?: boolean;
}

export class RemoteSession extends EventEmitter {
  private ptyProcess: import('node-pty').IPty | null = null;
  private outputBuffer = '';
  private closed = false;

  constructor(
    private request: SessionRequest,
    private machineId: string
  ) {
    super();
  }

  start() {
    if (!pty) {
      this.emit('error', 'node-pty is not installed. Interactive PTY sessions are unavailable. Use exec-mode (continue/new session) instead.');
      this.emit('exit', 1);
      return;
    }

    const { tool, sessionId, cwd, autoApprove } = this.request;

    let shell: string;
    let args: string[];

    if (isWin) {
      shell = tool === 'claude' ? 'claude.cmd' : 'codex.cmd';
      args = ['--resume', sessionId];
    } else {
      shell = tool;
      args = ['--resume', sessionId];
    }

    console.log(`[RemoteSession] Starting: ${shell} ${args.join(' ')} in ${cwd}`);

    try {
      this.ptyProcess = pty.spawn(shell, args, {
        name: isWin ? '' : 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env: {
          ...process.env,
          ...(isWin ? {} : { TERM: 'xterm-256color' }),
          FORCE_COLOR: '1',
        },
      });
    } catch (err) {
      if (isWin) {
        try {
          this.ptyProcess = pty.spawn(tool, args, {
            name: '',
            cols: 120,
            rows: 40,
            cwd,
            env: { ...process.env, FORCE_COLOR: '1' },
          });
        } catch (err2) {
          this.emit('error', `Failed to spawn ${tool}: ${err2}`);
          this.emit('exit', 1);
          return;
        }
      } else {
        this.emit('error', `Failed to spawn ${shell}: ${err}`);
        this.emit('exit', 1);
        return;
      }
    }

    this.ptyProcess.onData((data: string) => {
      this.outputBuffer += data;
      this.emit('data', data);

      if (autoApprove) {
        this.handleAutoApprove(data);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.closed = true;
      console.log(`[RemoteSession] Exited with code ${exitCode}`);
      this.emit('exit', exitCode);
    });
  }

  write(input: string) {
    if (this.ptyProcess && !this.closed) {
      this.ptyProcess.write(input);
    }
  }

  resize(cols: number, rows: number) {
    if (this.ptyProcess && !this.closed) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill() {
    if (this.ptyProcess && !this.closed) {
      this.ptyProcess.kill();
      this.closed = true;
    }
  }

  private handleAutoApprove(data: string) {
    const combined = this.outputBuffer;

    const patterns = [
      /Allow\?\s*\[Y\/n\]\s*$/i,
      /\(y\/N\)\s*$/i,
      /\[Y\/n\]\s*$/i,
      /\(yes\/no\)\s*$/i,
      /approve.*\?\s*$/i,
      /allow.*\?\s*$/i,
      /proceed.*\?\s*$/i,
      /\(1\).*(?:Allow|Yes|Accept|Approve).*\n.*(?:choice|select|option)/i,
      /(?:1\.|1\)).*(?:Allow|Yes|Accept).*\n.*[:>]\s*$/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(combined.slice(-500))) {
        setTimeout(() => {
          if (!this.closed) {
            if (/\[Y\/n\]|y\/N|\(yes\/no\)/i.test(combined.slice(-500))) {
              this.write('y\n');
              console.log('[RemoteSession] Auto-approved with "y"');
            } else {
              this.write('1\n');
              console.log('[RemoteSession] Auto-approved with "1"');
            }
          }
        }, 300);
        this.outputBuffer = '';
        break;
      }
    }

    if (this.outputBuffer.length > 2000) {
      this.outputBuffer = this.outputBuffer.slice(-1000);
    }
  }
}
