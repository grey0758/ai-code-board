import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { networkInterfaces, hostname, platform, release } from 'os';

export function getMachineId(): string {
  try {
    // Linux: /etc/machine-id
    return readFileSync('/etc/machine-id', 'utf-8').trim();
  } catch {
    try {
      // macOS: IOPlatformUUID
      const result = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/{print $3}'"
      ).toString().trim().replace(/"/g, '');
      return result;
    } catch {
      // Fallback: generate from hostname
      const h = hostname();
      let hash = 0;
      for (let i = 0; i < h.length; i++) {
        hash = ((hash << 5) - hash) + h.charCodeAt(i);
        hash |= 0;
      }
      return `fallback-${Math.abs(hash).toString(16)}`;
    }
  }
}

export function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

export function getOsInfo(): string {
  return `${platform()} ${release()}`;
}

export { hostname };
