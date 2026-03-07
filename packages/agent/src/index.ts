#!/usr/bin/env node
import { homedir, hostname } from 'os';
import { join } from 'path';
import { getMachineId, getLocalIP, getOsInfo } from './machine-id.js';
import { OffsetStore } from './offset-store.js';
import { IncrementalReader } from './reader.js';
import { Uploader } from './uploader.js';
import { FileWatcher } from './watcher.js';
import { Heartbeat } from './heartbeat.js';
import { CommandChannel } from './command-channel.js';
import type { MachineInfo } from '@chat-sync/shared';

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
const SSH_USER = getArg('ssh-user', process.env.USER || 'root');

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

console.log(`[Agent] Machine ID: ${machineId}`);
console.log(`[Agent] IP: ${ip}`);
console.log(`[Agent] Server: ${SERVER_URL}`);
console.log(`[Agent] Watch dirs: ${watchDirs.join(', ')}`);

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
    agentVersion: '1.0.0',
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
      console.log('[Agent] Registered with server.');
    } else {
      console.error(`[Agent] Registration failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[Agent] Registration failed:', err);
    console.log('[Agent] Will retry on next heartbeat...');
  }
}

async function main() {
  await register();

  const offsetStore = new OffsetStore();
  const reader = new IncrementalReader(machineId, offsetStore);
  const uploader = new Uploader(SERVER_URL, machineId, SYNC_INTERVAL);
  const watcher = new FileWatcher(watchDirs, reader, uploader, offsetStore);
  const heartbeat = new Heartbeat(SERVER_URL, machineId, HEARTBEAT_INTERVAL);

  const commandChannel = new CommandChannel(SERVER_URL, machineId);

  uploader.start();
  heartbeat.start();
  commandChannel.start();
  await watcher.start();

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Agent] Shutting down...');
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
}

main().catch(console.error);
