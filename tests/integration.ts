/**
 * Integration test for ai-code-board
 *
 * Tests directory browsing, new session creation, and continue session
 * across all connected machines (Linux & Windows).
 *
 * Usage:
 *   npx tsx tests/integration.ts                        # test all online machines
 *   npx tsx tests/integration.ts --server http://host:port
 *   npx tsx tests/integration.ts --machine <machineId>  # test specific machine
 *   npx tsx tests/integration.ts --skip-session          # skip slow session tests
 */

const DEFAULT_SERVER = 'http://117.72.151.207:23595';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Machine {
  id: string;
  hostname: string;
  isOnline: boolean;
  osInfo: string;
  ipAddress: string;
}

interface TestResult {
  name: string;
  machine: string;
  pass: boolean;
  detail: string;
  durationMs: number;
}

const results: TestResult[] = [];

function parseArgs() {
  const args = process.argv.slice(2);
  let server = DEFAULT_SERVER;
  let machineFilter: string | null = null;
  let skipSession = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) server = args[++i];
    if (args[i] === '--machine' && args[i + 1]) machineFilter = args[++i];
    if (args[i] === '--skip-session') skipSession = true;
  }

  return { server, machineFilter, skipSession };
}

async function api<T>(server: string, path: string, body?: any): Promise<{ status: number; data: T }> {
  const opts: RequestInit = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(`${server}${path}`, opts);
  const json = await res.json() as any;
  return { status: res.status, data: json };
}

function record(name: string, machine: string, pass: boolean, detail: string, startMs: number) {
  const dur = Date.now() - startMs;
  results.push({ name, machine, pass, detail, durationMs: dur });
  const icon = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${icon}] ${name} (${dur}ms) — ${detail}`);
}

// ─── Test cases ─────────────────────────────────────────────────────────────

async function testBrowseRoot(server: string, m: Machine) {
  const t = Date.now();
  try {
    const { status, data } = await api<any>(server, '/api/remote/browse', { machineId: m.id });
    if (status !== 200) {
      record('browse-root', m.hostname, false, `HTTP ${status}: ${JSON.stringify(data)}`, t);
      return;
    }
    const items = data.data?.items || [];
    const isWin = data.data?.isWindows || false;
    const path = data.data?.path || '';
    record('browse-root', m.hostname, items.length > 0,
      `path=${path} items=${items.length} isWindows=${isWin} first=${items[0]?.name || 'none'}`, t);
  } catch (e: any) {
    record('browse-root', m.hostname, false, e.message, t);
  }
}

async function testBrowseSubdir(server: string, m: Machine, isWindows: boolean) {
  const t = Date.now();
  // Pick a path: on Windows try C:\, on Linux try /home
  const testPath = isWindows ? 'C:\\' : '/home';
  try {
    const { status, data } = await api<any>(server, '/api/remote/browse', { machineId: m.id, path: testPath });
    if (status !== 200) {
      record('browse-subdir', m.hostname, false, `HTTP ${status} for ${testPath}`, t);
      return;
    }
    const items = data.data?.items || [];
    record('browse-subdir', m.hostname, true,
      `path=${testPath} items=${items.length}`, t);
  } catch (e: any) {
    record('browse-subdir', m.hostname, false, e.message, t);
  }
}

async function testBrowseChinesePath(server: string, m: Machine) {
  const t = Date.now();
  // Only relevant for Windows machines with known Chinese dirs
  try {
    const { data: browseData } = await api<any>(server, '/api/remote/browse', { machineId: m.id, path: 'E:\\' });
    const items = browseData.data?.items || [];
    const chineseDir = items.find((i: any) => i.isDirectory && /[\u4e00-\u9fff]/.test(i.name));
    if (!chineseDir) {
      record('browse-chinese', m.hostname, true, 'no Chinese directories found on E:\\, skipped', t);
      return;
    }
    const { status, data } = await api<any>(server, '/api/remote/browse', { machineId: m.id, path: chineseDir.path });
    if (status !== 200) {
      record('browse-chinese', m.hostname, false, `HTTP ${status} browsing ${chineseDir.path}`, t);
      return;
    }
    record('browse-chinese', m.hostname, true,
      `browsed ${chineseDir.path}, items=${data.data?.items?.length || 0}`, t);
  } catch (e: any) {
    record('browse-chinese', m.hostname, false, e.message, t);
  }
}

async function testNewSession(server: string, m: Machine, isWindows: boolean) {
  const t = Date.now();
  // Use a safe cwd
  const cwd = isWindows ? 'C:\\Users' : '/tmp';
  try {
    const { status, data } = await api<any>(server, '/api/remote/new-session', {
      machineId: m.id,
      source: 'claude',
      prompt: 'Say exactly: INTEGRATION_TEST_OK. Nothing else.',
      cwd,
    });
    if (status !== 200) {
      const err = (data as any).error || JSON.stringify(data);
      record('new-session', m.hostname, false, `HTTP ${status}: ${err}`, t);
      return;
    }
    const requestId = (data as any).requestId;
    record('new-session', m.hostname, true,
      `requestId=${requestId} cwd=${cwd}`, t);
  } catch (e: any) {
    record('new-session', m.hostname, false, e.message, t);
  }
}

async function testNewSessionChineseCwd(server: string, m: Machine) {
  const t = Date.now();
  try {
    // First find a Chinese dir
    const { data: browseData } = await api<any>(server, '/api/remote/browse', { machineId: m.id, path: 'E:\\' });
    const items = browseData.data?.items || [];
    const chineseDir = items.find((i: any) => i.isDirectory && /[\u4e00-\u9fff]/.test(i.name));
    if (!chineseDir) {
      record('new-session-chinese-cwd', m.hostname, true, 'no Chinese directory on E:\\, skipped', t);
      return;
    }

    const { status, data } = await api<any>(server, '/api/remote/new-session', {
      machineId: m.id,
      source: 'claude',
      prompt: 'Say exactly: CHINESE_CWD_TEST_OK. Nothing else.',
      cwd: chineseDir.path,
    });
    if (status !== 200) {
      const err = (data as any).error || JSON.stringify(data);
      record('new-session-chinese-cwd', m.hostname, false, `HTTP ${status}: ${err}`, t);
      return;
    }
    record('new-session-chinese-cwd', m.hostname, true,
      `requestId=${(data as any).requestId} cwd=${chineseDir.path}`, t);
  } catch (e: any) {
    record('new-session-chinese-cwd', m.hostname, false, e.message, t);
  }
}

async function testContinueSession(server: string, m: Machine) {
  const t = Date.now();
  try {
    // Get the most recent session
    const { data: sessData } = await api<any>(server, `/api/machines/${m.id}/sessions`);
    const sessions = (sessData as any).data || sessData;
    if (!sessions || sessions.length === 0) {
      record('continue-session', m.hostname, true, 'no sessions to continue, skipped', t);
      return;
    }
    // Sort by lastMessageAt desc, pick most recent claude session
    const sorted = sessions
      .filter((s: any) => s.source === 'claude')
      .sort((a: any, b: any) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    if (sorted.length === 0) {
      record('continue-session', m.hostname, true, 'no claude sessions, skipped', t);
      return;
    }
    const session = sorted[0];

    const { status, data } = await api<any>(server, '/api/remote/continue', {
      machineId: m.id,
      sessionId: session.id,
      source: 'claude',
      prompt: 'Say exactly: CONTINUE_TEST_OK. Nothing else.',
    });
    if (status !== 200) {
      const err = (data as any).error || JSON.stringify(data);
      record('continue-session', m.hostname, false, `HTTP ${status}: ${err}`, t);
      return;
    }
    record('continue-session', m.hostname, true,
      `requestId=${(data as any).requestId} resumed=${session.id.slice(0, 8)}`, t);
  } catch (e: any) {
    record('continue-session', m.hostname, false, e.message, t);
  }
}

async function testWaitForOutput(server: string, m: Machine, timeoutSec = 120) {
  const t = Date.now();
  // Check if latest session gets new messages within timeout
  try {
    const { data: before } = await api<any>(server, `/api/machines/${m.id}/sessions`);
    const sessions = ((before as any).data || before) as any[];
    if (!sessions || sessions.length === 0) {
      record('wait-for-output', m.hostname, true, 'no sessions, skipped', t);
      return;
    }
    const latest = sessions.sort((a: any, b: any) =>
      (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))[0];
    const initialCount = latest.messageCount || 0;
    const initialTime = latest.lastMessageAt || '';

    // Poll for changes
    const deadline = Date.now() + timeoutSec * 1000;
    let newCount = initialCount;
    let newTime = initialTime;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      const { data: after } = await api<any>(server, `/api/machines/${m.id}/sessions`);
      const refreshed = ((after as any).data || after) as any[];
      const found = refreshed.find((s: any) => s.id === latest.id);
      if (found && ((found.messageCount || 0) > initialCount || (found.lastMessageAt || '') > initialTime)) {
        newCount = found.messageCount || 0;
        newTime = found.lastMessageAt || '';
        break;
      }
    }

    if (newCount > initialCount || newTime > initialTime) {
      record('wait-for-output', m.hostname, true,
        `messages ${initialCount}→${newCount} session=${latest.id.slice(0, 8)}`, t);
    } else {
      record('wait-for-output', m.hostname, false,
        `no new messages after ${timeoutSec}s for session=${latest.id.slice(0, 8)}`, t);
    }
  } catch (e: any) {
    record('wait-for-output', m.hostname, false, e.message, t);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { server, machineFilter, skipSession } = parseArgs();
  console.log(`\n  Server: ${server}`);
  console.log(`  Filter: ${machineFilter || 'all'}`);
  console.log(`  Skip session tests: ${skipSession}\n`);

  // 1. Get all machines
  const { data: machinesData } = await api<any>(server, '/api/machines');
  const allMachines: Machine[] = (machinesData as any).data || machinesData;

  // 2. Get connected agents
  const { data: agentsData } = await api<any>(server, '/api/remote/agents');
  const connectedIds = new Set(
    ((agentsData as any).data || [])
      .filter((a: any) => a.connected)
      .map((a: any) => a.machineId)
  );

  // 3. Filter machines
  let machines = allMachines.filter(m => m.isOnline && connectedIds.has(m.id));
  if (machineFilter) {
    machines = machines.filter(m => m.id === machineFilter || m.hostname.includes(machineFilter));
  }

  console.log(`  Found ${machines.length} online machine(s) with agent connected:\n`);
  for (const m of machines) {
    const isWin = m.osInfo.startsWith('win');
    console.log(`    ${m.hostname} (${m.id.slice(0, 8)}) — ${m.osInfo} ${isWin ? '[Windows]' : '[Linux]'}`);
  }
  console.log();

  // 4. Run tests per machine
  for (const m of machines) {
    const isWin = m.osInfo.startsWith('win');
    console.log(`\n─── ${m.hostname} (${isWin ? 'Windows' : 'Linux'}) ───`);

    // Browse tests (always run)
    await testBrowseRoot(server, m);
    await testBrowseSubdir(server, m, isWin);

    if (isWin) {
      await testBrowseChinesePath(server, m);
    }

    if (!skipSession) {
      // Session tests
      await testNewSession(server, m, isWin);

      if (isWin) {
        await testNewSessionChineseCwd(server, m);
      }

      await testContinueSession(server, m);

      // Wait for output (only if we started sessions)
      await testWaitForOutput(server, m, 90);
    }
  }

  // 5. Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);

  if (failed > 0) {
    console.log(`\n  \x1b[31mFailed tests:\x1b[0m`);
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ${r.machine} / ${r.name}: ${r.detail}`);
    }
  }

  console.log(`${'═'.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(2);
});
