import { useMemo } from 'react';
import {
  Desktop,
  ChatsCircle,
  ChatCircleDots,
  ArrowRight,
  Circle,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { MachineInfo, SessionInfo } from '@/types';
import { cn } from '@/lib/cn';

interface DashboardPageProps {
  machines: MachineInfo[];
  sessions: SessionInfo[];
}

const sourceConfig: Record<string, { label: string; color: string; badgeCls: string }> = {
  claude: { label: 'Claude', color: 'text-[#D97706]', badgeCls: 'bg-[#D97706]/15 text-[#D97706]' },
  codex: { label: 'Codex', color: 'text-[#10B981]', badgeCls: 'bg-[#10B981]/15 text-[#10B981]' },
};

export function DashboardPage({ machines, sessions }: DashboardPageProps) {
  const onlineMachines = machines.filter((m) => m.isOnline);
  const totalMessages = sessions.reduce((s, sess) => s + sess.messageCount, 0);

  const sourceStats = useMemo(() => {
    const map: Record<string, { count: number; messages: number }> = {};
    for (const s of sessions) {
      if (!map[s.source]) map[s.source] = { count: 0, messages: 0 };
      map[s.source].count++;
      map[s.source].messages += s.messageCount;
    }
    return map;
  }, [sessions]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-high">Dashboard</h2>
        <p className="text-sm text-text-low mt-1">
          Overview of synchronized conversations
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-low uppercase tracking-wider">Machines</p>
            <p className="text-2xl font-bold text-text-high mt-1">{machines.length}</p>
            <p className="text-xs text-text-low mt-0.5">{onlineMachines.length} online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-low uppercase tracking-wider">Sessions</p>
            <p className="text-2xl font-bold text-text-high mt-1">{sessions.length}</p>
            <p className="text-xs text-text-low mt-0.5">total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-low uppercase tracking-wider">Messages</p>
            <p className="text-2xl font-bold text-text-high mt-1">{totalMessages.toLocaleString()}</p>
            <p className="text-xs text-text-low mt-0.5">synced</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-text-low uppercase tracking-wider">Sources</p>
            <p className="text-2xl font-bold text-text-high mt-1">{Object.keys(sourceStats).length}</p>
            <p className="text-xs text-text-low mt-0.5">active</p>
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>By Source</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(sourceStats).sort(([a],[b]) => a.localeCompare(b)).map(([source, stats]) => {
              const cfg = sourceConfig[source] || { label: source, color: 'text-text-normal', badgeCls: '' };
              return (
                <div key={source} className="flex items-center gap-3 p-3 rounded-lg bg-bg-primary border border-border">
                  <div className={cn('text-lg font-bold', cfg.color)}>{cfg.label}</div>
                  <div className="ml-auto text-right">
                    <p className="text-sm font-semibold text-text-high">{stats.count} sessions</p>
                    <p className="text-xs text-text-low">{stats.messages.toLocaleString()} msgs</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Machines */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Machines</CardTitle>
          <Badge variant="secondary">{onlineMachines.length} online</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {machines.map((machine) => {
              const machSessions = sessions.filter((s) => s.machineId === machine.id);
              const machSources = [...new Set(machSessions.map((s) => s.source))];
              return (
                <Link
                  key={machine.id}
                  to={`/machines/${machine.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-bg-hover transition-colors"
                >
                  <Circle
                    size={8}
                    weight="fill"
                    className={cn(
                      'shrink-0',
                      machine.isOnline ? 'text-success' : 'text-text-low/30'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-high">
                      {machine.displayName || machine.hostname}
                    </p>
                    <p className="text-xs text-text-low truncate">
                      {machine.ipAddress} &middot; {machine.osInfo}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {machSources.map((src) => {
                      const cfg = sourceConfig[src];
                      return cfg ? (
                        <span key={src} className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cfg.badgeCls)}>
                          {cfg.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <span className="text-xs text-text-low shrink-0">{machSessions.length} sessions</span>
                  <ArrowRight size={14} className="text-text-low shrink-0" />
                </Link>
              );
            })}
            {machines.length === 0 && (
              <p className="text-sm text-text-low text-center py-4">No machines registered yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
