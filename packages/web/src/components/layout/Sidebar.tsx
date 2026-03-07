import { useState, useMemo } from 'react';
import {
  Desktop,
  CaretRight,
  Circle,
  Folder,
  ChatCircleDots,
  PencilSimple,
  Check,
  X,
  Star,
  Eye,
  House,
} from '@phosphor-icons/react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { renameMachine } from '@/hooks/useApi';
import type { MachineInfo, SessionInfo } from '@/types';

interface SidebarProps {
  machines: MachineInfo[];
  sessions: SessionInfo[];
  onMachineRenamed: () => void;
  onSessionUpdated: () => void;
}

const sourceConfig: Record<string, { label: string; color: string }> = {
  claude: { label: 'Claude', color: 'text-[#D97706]' },
  codex: { label: 'Codex', color: 'text-[#10B981]' },
  openclaw: { label: 'OpenClaw', color: 'text-[#8B5CF6]' },
};

function getSessionLabel(s: SessionInfo): string {
  if (s.displayName) return s.displayName;
  if (s.firstMessage) return s.firstMessage;
  return s.id.slice(0, 8) + '...';
}

function MachineItem({
  machine,
  sessions,
  onRenamed,
}: {
  machine: MachineInfo;
  sessions: SessionInfo[];
  onRenamed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayName = machine.displayName || machine.hostname;

  // Group by source
  const bySource = useMemo(() => {
    const map: Record<string, SessionInfo[]> = {};
    for (const s of sessions) {
      if (!map[s.source]) map[s.source] = [];
      map[s.source].push(s);
    }
    return map;
  }, [sessions]);

  const handleRename = async () => {
    if (editValue.trim() && editValue.trim() !== displayName) {
      await renameMachine(machine.id, editValue.trim());
      onRenamed();
    }
    setEditing(false);
  };

  return (
    <div>
      <div className="flex items-center gap-0.5 group">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
        >
          <CaretRight
            size={12}
            className={cn('shrink-0 text-text-low transition-transform', expanded && 'rotate-90')}
          />
          <Circle
            size={8}
            weight="fill"
            className={cn('shrink-0', machine.isOnline ? 'text-success' : 'text-text-low/30')}
          />
          {editing ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setEditing(false);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-bg-primary border border-brand rounded px-1 text-sm text-text-high outline-none"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-text-high font-medium text-left">
              {displayName}
            </span>
          )}
          <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
            {sessions.length}
          </Badge>
        </button>
        {editing ? (
          <div className="flex items-center shrink-0">
            <button onClick={handleRename} className="p-0.5 rounded hover:bg-bg-hover text-success"><Check size={13} /></button>
            <button onClick={() => setEditing(false)} className="p-0.5 rounded hover:bg-bg-hover text-error"><X size={13} /></button>
          </div>
        ) : (
          <button
            onClick={() => { setEditValue(displayName); setEditing(true); }}
            className="p-1 rounded hover:bg-bg-hover text-text-low opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <PencilSimple size={12} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="ml-3 border-l border-border pl-2 mt-0.5">
          {Object.entries(bySource)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([source, srcSessions]) => (
              <SourceGroup key={source} source={source} sessions={srcSessions} machineId={machine.id} />
            ))}
          {sessions.length === 0 && <p className="text-xs text-text-low px-2 py-1">No sessions</p>}
        </div>
      )}
    </div>
  );
}

function SourceGroup({ source, sessions, machineId }: { source: string; sessions: SessionInfo[]; machineId: string }) {
  const [expanded, setExpanded] = useState(false);
  const config = sourceConfig[source] || { label: source, color: 'text-text-normal' };

  const folderTree = useMemo(() => {
    const tree: Record<string, SessionInfo[]> = {};
    for (const s of sessions) {
      let folder: string;
      if (source === 'codex') {
        const match = s.filePath.match(/sessions\/(\d{4}\/\d{2}\/\d{2})\//);
        folder = match ? match[1] : 'other';
      } else if (source === 'openclaw') {
        const match = s.filePath.match(/agents\/([^/]+)\//);
        folder = match ? match[1] : 'other';
      } else {
        folder = s.projectPath || 'unknown';
      }
      if (!tree[folder]) tree[folder] = [];
      tree[folder].push(s);
    }
    return tree;
  }, [sessions, source]);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs hover:bg-bg-hover transition-colors"
      >
        <CaretRight size={10} className={cn('shrink-0 text-text-low transition-transform', expanded && 'rotate-90')} />
        <span className={cn('font-semibold', config.color)}>{config.label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1 py-0">{sessions.length}</Badge>
      </button>
      {expanded && (
        <div className="ml-2 border-l border-border/50 pl-1.5">
          {Object.entries(folderTree).sort(([a], [b]) => a.localeCompare(b)).map(([folder, folderSessions]) => (
            <FolderItem key={folder} folder={folder} sessions={folderSessions} machineId={machineId} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderItem({ folder, sessions, machineId, source }: { folder: string; sessions: SessionInfo[]; machineId: string; source: string }) {
  const [expanded, setExpanded] = useState(false);

  const shortName = useMemo(() => {
    if (source === 'codex' || source === 'openclaw') return folder;
    const parts = folder.split('/').filter(Boolean);
    return parts.length > 2 ? parts.slice(-2).join('/') : folder;
  }, [folder, source]);

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()),
    [sessions]
  );

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-1.5 py-0.5 rounded text-xs hover:bg-bg-hover transition-colors text-text-normal"
      >
        <CaretRight size={10} className={cn('shrink-0 text-text-low transition-transform', expanded && 'rotate-90')} />
        <Folder size={12} className="shrink-0 text-text-low" />
        <span className="flex-1 min-w-0 truncate text-left" title={folder}>{shortName}</span>
        <span className="text-text-low text-[10px] shrink-0">{sessions.length}</span>
      </button>
      {expanded && (
        <div className="ml-4 space-y-0.5 mt-0.5">
          {sorted.map((session) => (
            <NavLink
              key={session.id}
              to={`/sessions/${session.id}?machineId=${machineId}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs transition-colors group/item',
                  isActive ? 'bg-brand/10 text-brand' : 'text-text-low hover:bg-bg-hover hover:text-text-normal'
                )
              }
            >
              <ChatCircleDots size={11} className="shrink-0" />
              <span className="flex-1 min-w-0 truncate" title={getSessionLabel(session)}>
                {getSessionLabel(session)}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {session.isStarred && <Star size={10} weight="fill" className="text-warning" />}
                {session.isWatched && <Eye size={10} weight="fill" className="text-info" />}
              </div>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ machines, sessions, onMachineRenamed, onSessionUpdated }: SidebarProps) {
  const onlineMachines = machines.filter((m) => m.isOnline);
  const starredCount = sessions.filter((s) => s.isStarred).length;
  const watchedCount = sessions.filter((s) => s.isWatched).length;

  return (
    <aside className="w-64 border-r border-border bg-bg-secondary flex flex-col shrink-0 overflow-hidden">
      {/* Nav links */}
      <div className="p-2 border-b border-border space-y-0.5">
        <NavLink
          to="/" end
          className={({ isActive }) => cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-brand/10 text-brand font-medium' : 'text-text-normal hover:bg-bg-hover')}
        >
          <House size={15} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/starred"
          className={({ isActive }) => cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-warning/10 text-warning font-medium' : 'text-text-normal hover:bg-bg-hover')}
        >
          <Star size={15} weight={starredCount > 0 ? 'fill' : 'regular'} className={starredCount > 0 ? 'text-warning' : ''} />
          <span>Starred</span>
          {starredCount > 0 && <Badge variant="warning" className="ml-auto text-[10px] px-1 py-0">{starredCount}</Badge>}
        </NavLink>
        <NavLink
          to="/watched"
          className={({ isActive }) => cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors', isActive ? 'bg-info/10 text-info font-medium' : 'text-text-normal hover:bg-bg-hover')}
        >
          <Eye size={15} weight={watchedCount > 0 ? 'fill' : 'regular'} className={watchedCount > 0 ? 'text-info' : ''} />
          <span>Watched</span>
          {watchedCount > 0 && <Badge variant="default" className="ml-auto text-[10px] px-1 py-0">{watchedCount}</Badge>}
        </NavLink>
      </div>

      {/* Machines header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-text-low uppercase tracking-wider">Machines</span>
        <Badge variant="secondary" className="text-[10px]">{onlineMachines.length}/{machines.length}</Badge>
      </div>

      {/* Machines tree */}
      <nav className="flex-1 overflow-y-auto px-1 pb-2 space-y-0.5">
        {machines.map((machine) => (
          <MachineItem
            key={machine.id}
            machine={machine}
            sessions={sessions.filter((s) => s.machineId === machine.id)}
            onRenamed={onMachineRenamed}
          />
        ))}
        {machines.length === 0 && <p className="text-xs text-text-low text-center py-4">No machines registered</p>}
      </nav>

      <div className="p-2 border-t border-border">
        <p className="text-[10px] text-text-low text-center">{sessions.length} sessions across {machines.length} machines</p>
      </div>
    </aside>
  );
}
