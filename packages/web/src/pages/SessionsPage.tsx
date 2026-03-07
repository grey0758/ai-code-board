import { useState, useMemo, useCallback } from 'react';
import { MagnifyingGlass, Folder, CaretRight } from '@phosphor-icons/react';
import { useSessions } from '@/hooks/useApi';
import { SessionCard } from '@/components/chat/SessionCard';
import { Badge } from '@/components/ui/Badge';
import type { MachineInfo } from '@/types';
import { cn } from '@/lib/cn';

interface SessionsPageProps {
  machines: MachineInfo[];
  onSessionUpdated: () => void;
}

const sourceConfig: Record<string, { label: string; color: string; activeClass: string }> = {
  all: { label: 'All', color: '', activeClass: 'bg-brand/10 text-brand' },
  claude: { label: 'Claude', color: 'text-[#D97706]', activeClass: 'bg-[#D97706]/15 text-[#D97706]' },
  codex: { label: 'Codex', color: 'text-[#10B981]', activeClass: 'bg-[#10B981]/15 text-[#10B981]' },
  openclaw: { label: 'OpenClaw', color: 'text-[#8B5CF6]', activeClass: 'bg-[#8B5CF6]/15 text-[#8B5CF6]' },
};

export function SessionsPage({ machines, onSessionUpdated }: SessionsPageProps) {
  const { sessions, loading } = useSessions();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('all');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const sources = useMemo(() => [...new Set(sessions.map((s) => s.source))], [sessions]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
      if (machineFilter !== 'all' && s.machineId !== machineFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchId = s.id.toLowerCase().includes(q);
        const matchProject = s.projectPath?.toLowerCase().includes(q);
        const matchFile = s.filePath?.toLowerCase().includes(q);
        const matchMachine = machines
          .find((m) => m.id === s.machineId)
          ?.hostname.toLowerCase()
          .includes(q);
        if (!matchId && !matchProject && !matchFile && !matchMachine) return false;
      }
      return true;
    });
  }, [sessions, search, sourceFilter, machineFilter, machines]);

  // Group filtered sessions by project path
  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const s of filtered) {
      let key: string;
      if (s.source === 'codex') {
        const match = s.filePath.match(/sessions\/(\d{4}\/\d{2}\/\d{2})\//);
        key = match ? `codex/${match[1]}` : 'codex/other';
      } else if (s.source === 'openclaw') {
        const match = s.filePath.match(/agents\/([^/]+)\//);
        key = match ? `openclaw/${match[1]}` : 'openclaw/other';
      } else {
        key = s.projectPath || 'unknown';
      }
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    // Sort sessions within each group
    for (const key of Object.keys(map)) {
      map[key].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
    }
    return map;
  }, [filtered]);

  const sortedGroups = useMemo(
    () =>
      Object.entries(grouped).sort(([, a], [, b]) => {
        const aTime = Math.max(...a.map((s) => new Date(s.lastMessageAt).getTime() || 0));
        const bTime = Math.max(...b.map((s) => new Date(s.lastMessageAt).getTime() || 0));
        return bTime - aTime;
      }),
    [grouped]
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-high">Sessions</h2>
        <p className="text-sm text-text-low mt-1">
          {sessions.length} total sessions across all machines
        </p>
      </div>

      {/* Source tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', ...sources].map((src) => {
          const cfg = sourceConfig[src] || { label: src, color: '', activeClass: 'bg-brand/10 text-brand' };
          const count = src === 'all' ? sessions.length : sessions.filter((s) => s.source === src).length;
          return (
            <button
              key={src}
              onClick={() => setSourceFilter(src)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                sourceFilter === src ? cfg.activeClass : 'text-text-low hover:bg-bg-hover'
              )}
            >
              {cfg.label}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + machine filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-low" />
          <input
            type="text"
            placeholder="Search by session ID, project path, file path..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-bg-primary text-sm text-text-normal placeholder:text-text-low focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
        <select
          value={machineFilter}
          onChange={(e) => setMachineFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-border bg-bg-primary text-sm text-text-normal focus:outline-none focus:ring-2 focus:ring-brand appearance-none cursor-pointer"
        >
          <option value="all">All Machines</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.hostname}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped sessions */}
      {loading ? (
        <div className="text-sm text-text-low text-center py-12">Loading sessions...</div>
      ) : sortedGroups.length === 0 ? (
        <div className="text-sm text-text-low text-center py-12">
          {search || sourceFilter !== 'all' || machineFilter !== 'all'
            ? 'No sessions match your filters'
            : 'No sessions found'}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedGroups.map(([folder, folderSessions]) => {
            const isCollapsed = collapsedFolders.has(folder);
            return (
              <div key={folder} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleFolder(folder)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 bg-bg-secondary hover:bg-bg-hover transition-colors text-left"
                >
                  <CaretRight
                    size={14}
                    className={cn(
                      'shrink-0 text-text-low transition-transform',
                      !isCollapsed && 'rotate-90'
                    )}
                  />
                  <Folder size={16} className="text-text-low shrink-0" />
                  <h3 className="text-sm font-medium text-text-high truncate flex-1" title={folder}>
                    {folder}
                  </h3>
                  <Badge variant="secondary" className="shrink-0">{folderSessions.length}</Badge>
                </button>
                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {folderSessions.map((session) => (
                      <SessionCard
                        key={`${session.machineId}-${session.id}`}
                        session={session}
                        machineName={
                          machines.find((m) => m.id === session.machineId)?.displayName ||
                          machines.find((m) => m.id === session.machineId)?.hostname
                        }
                        onUpdated={onSessionUpdated}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
