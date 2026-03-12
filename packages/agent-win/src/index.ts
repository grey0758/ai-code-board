#!/usr/bin/env node
import { homedir, hostname, platform } from 'os';
import { join } from 'path';
import { getMachineId, getLocalIP, getOsInfo } from './machine-id.js';
import { OffsetStore } from './offset-store.js';
import { IncrementalReader } from './reader.js';
import { Uploader } from './uploader.js';
import { FileWatcher } from './watcher.js';
import { Heartbeat } from './heartbeat.js';
import { CommandChannel } from './command-channel.js';
import type { MachineInfo } from '@ai-code-board/shared';

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const SERVER_URL = getArg('server', process.env.SYNC_SERVER || 'http://localhost:3000');
const SYNC_INTERVAL = parseInt(getArg('interval', '3000'));
const HEARTBEAT_INTERVAL = parseInt(getArg('heartbeat', '30000'));
const SSH_PORT = parseInt(getArg('ssh-port', '22'));
const SSH_USER = getArg('ssh-user', process.env.USER || process.env.USERNAME || 'user');

// Custom watch dirs or defaults
const customDirs = getArg('dirs', '');
const home = homedir();
const DEFAULT_WATCH_DIRS = [
  join(home, '.claude', 'projects'),
  join(home, '.codex', 'sessions'),
];
const watchDirs = customDirs ? customDirs.split(',') : DEFAULT_WATCH_DIRS;

const machineId = getMachineId();
const ip = getLocalIP();
const isWin = platform() === 'win32';

console.log(`[Agent-Win] Platform: ${platform()}`);
console.log(`[Agent-Win] Machine ID: ${machineId}`);
console.log(`[Agent-Win] IP: ${ip}`);
console.log(`[Agent-Win] Server: ${SERVER_URL}`);
console.log(`[Agent-Win] Watch dirs: ${watchDirs.join(', ')}`);

// Register with server
async function register() {
  const info: MachineInfo = {
    id: machineId,
    hostname: hostname(),
    ipAddress: ip,
    osInfo: getOsInfo(),
    sshPort: SSH_PORT,
    sshUser: SSH_USER,
    watchDirs,
    agentVersion: '1.0.0-win',
    isOnline: true,
    lastHeartbeat: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    });
    if (res.ok) {
      console.log('[Agent-Win] Registered with server.');
    } else {
      console.error(`[Agent-Win] Registration failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[Agent-Win] Registration failed:', err);
    console.log('[Agent-Win] Will retry on next heartbeat...');
  }
}

async function main() {
  await register();

  const offsetStore = new OffsetStore();
  const reader = new IncrementalReader(machineId, offsetStore);
  const uploader = new Uploader(SERVER_URL, machineId, offsetStore, SYNC_INTERVAL);
  const watcher = new FileWatcher(watchDirs, reader, uploader);
  const heartbeat = new Heartbeat(SERVER_URL, machineId, HEARTBEAT_INTERVAL);

  const commandChannel = new CommandChannel(SERVER_URL, machineId);

  uploader.start();
  heartbeat.start();
  commandChannel.start();
  await watcher.start();

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Agent-Win] Shutting down...');
    watcher.stop();
    commandChannel.stop();
    uploader.flush().then(() => {
      uploader.stop();
      heartbeat.stop();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Windows: SIGBREAK for Ctrl+Break
  if (isWin) {
    process.on('SIGBREAK', shutdown);
  }
}

main().catch(console.error);
