import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { platform } from 'os';

const isWin = platform() === 'win32';

export interface SessionRequest {
  requestId: string;
  tool: 'claude' | 'codex';
  sessionId: string;
  cwd: string;
  autoApprove?: boolean;  // auto-respond to auth prompts
}

export class RemoteSession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private outputBuffer = '';
  private closed = false;

  constructor(
    private request: SessionRequest,
    private machineId: string
  ) {
    super();
  }

  start() {
    const { tool, sessionId, cwd, autoApprove } = this.request;

    // Build command based on tool
    let shell: string;
    let args: string[];

    if (isWin) {
      // On Windows, use .cmd extensions if tools are installed via npm
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
      // Fallback: try without .cmd extension on Windows
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

      // Auto-approve: detect permission/auth prompts
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

    // Common permission prompt patterns
    // Claude: "Allow? [Y/n]", "Do you want to proceed? (y/N)"
    // Also handles numbered selections like "(1) Allow (2) Deny"
    const patterns = [
      /Allow\?\s*\[Y\/n\]\s*$/i,
      /\(y\/N\)\s*$/i,
      /\[Y\/n\]\s*$/i,
      /\(yes\/no\)\s*$/i,
      /approve.*\?\s*$/i,
      /allow.*\?\s*$/i,
      /proceed.*\?\s*$/i,
      // Numbered options: select 1 (usually "Allow" / "Yes")
      /\(1\).*(?:Allow|Yes|Accept|Approve).*\n.*(?:choice|select|option)/i,
      /(?:1\.|1\)).*(?:Allow|Yes|Accept).*\n.*[:>]\s*$/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(combined.slice(-500))) {
        // Clear the buffer portion we matched against
        setTimeout(() => {
          if (!this.closed) {
            // Try "y" first, fallback to "1"
            if (/\[Y\/n\]|y\/N|\(yes\/no\)/i.test(combined.slice(-500))) {
              this.write('y\n');
              console.log('[RemoteSession] Auto-approved with "y"');
            } else {
              this.write('1\n');
              console.log('[RemoteSession] Auto-approved with "1"');
            }
          }
        }, 300);
        // Reset buffer to avoid re-matching
        this.outputBuffer = '';
        break;
      }
    }

    // Keep buffer manageable
    if (this.outputBuffer.length > 2000) {
      this.outputBuffer = this.outputBuffer.slice(-1000);
    }
  }
}
