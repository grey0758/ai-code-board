import { useMemo } from 'react';
import { Star, Eye } from '@phosphor-icons/react';
import { SessionCard } from '@/components/chat/SessionCard';
import type { MachineInfo, SessionInfo } from '@/types';

interface CollectionPageProps {
  type: 'starred' | 'watched';
  machines: MachineInfo[];
  sessions: SessionInfo[];
  onSessionUpdated: () => void;
}

export function CollectionPage({ type, machines, sessions, onSessionUpdated }: CollectionPageProps) {
  const filtered = useMemo(
    () =>
      sessions
        .filter((s) => (type === 'starred' ? s.isStarred : s.isWatched))
        .sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        ),
    [sessions, type]
  );

  const Icon = type === 'starred' ? Star : Eye;
  const title = type === 'starred' ? 'Starred' : 'Watched';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icon size={22} weight="duotone" className={type === 'starred' ? 'text-warning' : 'text-info'} />
        <h2 className="text-xl font-semibold text-text-high">{title} Sessions</h2>
      </div>
      <p className="text-sm text-text-low">
        {filtered.length} {title.toLowerCase()} session{filtered.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="text-sm text-text-low text-center py-16">
          No {title.toLowerCase()} sessions yet. Click the {type === 'starred' ? 'star' : 'eye'} icon on a session to add it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((session) => (
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
}
