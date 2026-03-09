import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Desktop,
  Globe,
  Clock,
  HardDrives,
  PencilSimple,
  Check,
  X,
  Folder,
  CaretRight,
  Plus,
} from '@phosphor-icons/react';
import { useSessions, renameMachine } from '@/hooks/useApi';
import { SessionCard } from '@/components/chat/SessionCard';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { MachineInfo } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { NewConversationDialog } from '@/components/chat/NewConversationDialog';

interface MachineDetailPageProps {
  machines: MachineInfo[];
  onSessionUpdated: () => void;
}

const sourceConfig: Record<string, { label: string; activeClass: string }> = {
  all: { label: 'All', activeClass: 'bg-brand/10 text-brand' },
  claude: { label: 'Claude', activeClass: 'bg-[#D97706]/15 text-[#D97706]' },
  codex: { label: 'Codex', activeClass: 'bg-[#10B981]/15 text-[#10B981]' },
};

export function MachineDetailPage({ machines, onSessionUpdated }: MachineDetailPageProps) {
  const { machineId } = useParams<{ machineId: string }>();
  const machine = machines.find((m) => m.id === machineId);
  const { sessions, loading } = useSessions(machineId);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);

  if (!machine) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-low">Machine not found</p>
      </div>
    );
  }

  const displayName = machine.displayName || machine.hostname;
  const sources = [...new Set(sessions.map((s) => s.source))];

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const filtered = sourceFilter === 'all'
    ? sessions
    : sessions.filter((s) => s.source === sourceFilter);

  // Group filtered sessions by folder
  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const s of filtered) {
      let key: string;
      if (s.source === 'codex') {
        const match = s.filePath.match(/sessions\/(\\d{4}\/\\d{2}\/\\d{2})\//);
        key = match ? `codex/${match[1]}` : 'codex/other';
      } else {
        key = s.projectPath || 'unknown';
      }
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
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

  const handleRename = async () => {
    if (editValue.trim() && editValue.trim() !== displayName) {
      await renameMachine(machine.id, editValue.trim());
      window.location.reload();
    }
    setEditing(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <Desktop size={22} weight="duotone" className="text-brand" />

        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="text-xl font-semibold bg-bg-primary border border-brand rounded px-2 py-0.5 text-text-high outline-none"
            />
            <button onClick={handleRename} className="p-1 rounded hover:bg-bg-hover text-success">
              <Check size={18} />
            </button>
            <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-bg-hover text-error">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-text-high">{displayName}</h2>
            <button
              onClick={() => { setEditValue(displayName); setEditing(true); }}
              className="p-1 rounded hover:bg-bg-hover text-text-low"
              title="Rename"
            >
              <PencilSimple size={16} />
            </button>
          </div>
        )}

        <div
          className={cn(
            'w-2.5 h-2.5 rounded-full',
            machine.isOnline ? 'status-online' : 'status-offline'
          )}
        />

        {machine.isOnline && (
          <button
            onClick={() => setShowNewConversation(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand/80 transition-colors"
          >
            <Plus size={14} weight="bold" />
            New Conversation
          </button>
        )}
      </div>

      {/* Machine Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-text-low" />
              <div>
                <p className="text-xs text-text-low">IP Address</p>
                <p className="text-sm text-text-high">{machine.ipAddress}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HardDrives size={16} className="text-text-low" />
              <div>
                <p className="text-xs text-text-low">OS</p>
                <p className="text-sm text-text-high truncate">{machine.osInfo}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-text-low" />
              <div>
                <p className="text-xs text-text-low">Last Heartbeat</p>
                <p className="text-sm text-text-high">
                  {machine.lastHeartbeat
                    ? formatDistanceToNow(new Date(machine.lastHeartbeat), { addSuffix: true })
                    : 'Never'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-text-low">Hostname</p>
              <p className="text-sm text-text-high">{machine.hostname}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Source tabs */}
      <div className="flex items-center gap-2">
        {['all', ...sources].map((src) => {
          const cfg = sourceConfig[src] || { label: src, activeClass: 'bg-brand/10 text-brand' };
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

      {/* Sessions grouped by folder */}
      <div>
        <h3 className="text-base font-semibold text-text-high mb-3">
          Sessions ({filtered.length})
        </h3>
        {loading ? (
          <p className="text-sm text-text-low text-center py-8">Loading...</p>
        ) : sortedGroups.length === 0 ? (
          <p className="text-sm text-text-low text-center py-8">
            No sessions {sourceFilter !== 'all' ? `for ${sourceFilter}` : 'from this machine'}
          </p>
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

      {showNewConversation && machineId && (
        <NewConversationDialog
          machineId={machineId}
          machineName={displayName}
          onClose={() => setShowNewConversation(false)}
          onStarted={() => {
            // Refresh sessions multiple times to catch sync completion
            setTimeout(onSessionUpdated, 3000);
            setTimeout(onSessionUpdated, 8000);
            setTimeout(onSessionUpdated, 15000);
            setTimeout(onSessionUpdated, 25000);
          }}
        />
      )}
    </div>
  );
}
