import { useState } from 'react';
import {
  ChatCircleDots,
  Clock,
  Desktop,
  Star,
  Eye,
  PencilSimple,
  Check,
  X,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { updateSession } from '@/hooks/useApi';
import type { SessionInfo } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface SessionCardProps {
  session: SessionInfo;
  machineName?: string;
  className?: string;
  onUpdated?: () => void;
}

const sourceColors: Record<string, string> = {
  claude: 'bg-[#D97706]/15 text-[#D97706]',
  codex: 'bg-[#10B981]/15 text-[#10B981]',
};

export function SessionCard({ session, machineName, className, onUpdated }: SessionCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const lastActive = session.lastMessageAt
    ? formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true })
    : 'unknown';

  const title = session.displayName
    || session.firstMessage
    || session.id.slice(0, 12) + '...';

  const handleRename = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const val = editValue.trim();
    if (val && val !== title) {
      await updateSession(session.id, session.machineId, { displayName: val });
      onUpdated?.();
    }
    setEditing(false);
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setEditing(false);
  };

  const toggleStar = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await updateSession(session.id, session.machineId, { isStarred: !session.isStarred });
    onUpdated?.();
  };

  const toggleWatch = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await updateSession(session.id, session.machineId, { isWatched: !session.isWatched });
    onUpdated?.();
  };

  const startEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(session.displayName || '');
    setEditing(true);
  };

  if (editing) {
    return (
      <div
        className={cn(
          'border border-brand rounded-xl p-4 bg-bg-secondary',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <ChatCircleDots size={16} weight="duotone" className="text-brand shrink-0" />
          <span className="text-xs text-text-low">Rename session</span>
        </div>
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') cancelEdit();
          }}
          placeholder={title}
          className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-high outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-text-normal hover:bg-bg-hover transition-colors"
          >
            <X size={14} />
            Cancel
          </button>
          <button
            onClick={handleRename}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-brand text-white hover:bg-brand-hover transition-colors"
          >
            <Check size={14} />
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border border-border rounded-xl p-4 bg-bg-secondary hover:bg-bg-hover transition-colors group relative',
        className
      )}
    >
      {/* Action buttons - top right, shown on hover */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={startEdit}
          className="p-1.5 rounded-md hover:bg-bg-active text-text-low"
          title="Rename"
        >
          <PencilSimple size={13} />
        </button>
        <button
          onClick={toggleWatch}
          className={cn('p-1.5 rounded-md hover:bg-bg-active', session.isWatched ? 'text-info' : 'text-text-low')}
          title={session.isWatched ? 'Unwatch' : 'Watch'}
        >
          <Eye size={13} weight={session.isWatched ? 'fill' : 'regular'} />
        </button>
        <button
          onClick={toggleStar}
          className={cn('p-1.5 rounded-md hover:bg-bg-active', session.isStarred ? 'text-warning' : 'text-text-low')}
          title={session.isStarred ? 'Unstar' : 'Star'}
        >
          <Star size={13} weight={session.isStarred ? 'fill' : 'regular'} />
        </button>
      </div>

      {/* Persistent star/watch indicators - hidden on hover when action buttons show */}
      {(session.isStarred || session.isWatched) && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 group-hover:opacity-0 transition-opacity pointer-events-none">
          {session.isWatched && <Eye size={12} weight="fill" className="text-info" />}
          {session.isStarred && <Star size={12} weight="fill" className="text-warning" />}
        </div>
      )}

      <Link to={`/sessions/${session.id}?machineId=${session.machineId}`} className="block">
        <div className="flex items-start gap-2 pr-16">
          <ChatCircleDots size={16} weight="duotone" className="text-brand shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-text-high line-clamp-2 leading-snug flex-1 min-w-0">
            {title}
          </p>
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge
            className={cn('text-[10px] capitalize', sourceColors[session.source] || '')}
            variant="secondary"
          >
            {session.source}
          </Badge>
          {machineName && (
            <span className="flex items-center gap-1 text-xs text-text-low">
              <Desktop size={11} />
              <span className="truncate max-w-[100px]">{machineName}</span>
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-text-low">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {lastActive}
          </span>
          <span>{session.messageCount} msgs</span>
        </div>
      </Link>
    </div>
  );
}
