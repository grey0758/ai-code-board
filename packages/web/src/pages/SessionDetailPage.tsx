import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Desktop,
  Star,
  Eye,
  PencilSimple,
  Check,
  X,
  PaperPlaneRight,
  CircleNotch,
} from '@phosphor-icons/react';
import { useMessages, updateSession, continueSession } from '@/hooks/useApi';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { MachineInfo, SessionInfo } from '@/types';

interface SessionDetailPageProps {
  machines: MachineInfo[];
  sessions: SessionInfo[];
  onSessionUpdated: () => void;
  wsOn?: (type: string, fn: (data: unknown) => void) => () => void;
}

export function SessionDetailPage({ machines, sessions, onSessionUpdated, wsOn }: SessionDetailPageProps) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const machineId = searchParams.get('machineId') || undefined;
  const { messages, loading, refresh: refreshMessages } = useMessages(sessionId!, machineId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const machine = machines.find((m) => m.id === machineId);
  const session = sessions.find(
    (s) => s.id === sessionId && (!machineId || s.machineId === machineId)
  );

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Auto-refresh messages when WebSocket receives new-messages for this session
  useEffect(() => {
    if (!wsOn) return;
    return wsOn('new-messages', (data: unknown) => {
      const msgs = data as Array<{ sessionId?: string }>;
      if (msgs?.some((m) => m.sessionId === sessionId)) {
        refreshMessages();
      }
    });
  }, [wsOn, sessionId, refreshMessages]);

  // Also refresh on session-exit (continue completed)
  useEffect(() => {
    if (!wsOn) return;
    return wsOn('session-exit', () => {
      // Small delay to let agent sync the file
      setTimeout(() => {
        refreshMessages();
        setSending(false);
      }, 3000);
    });
  }, [wsOn, refreshMessages]);

  useEffect(() => {
    if (!loading && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [loading, messages.length]);

  const sorted = [...messages].sort((a, b) => a.lineNumber - b.lineNumber);

  const title = session?.displayName || session?.firstMessage || sessionId?.slice(0, 12) + '...';

  const handleRename = async () => {
    if (!sessionId || !machineId) return;
    const val = editValue.trim();
    if (val) {
      await updateSession(sessionId, machineId, { displayName: val });
      onSessionUpdated();
    }
    setEditing(false);
  };

  const toggleStar = async () => {
    if (!session || !machineId) return;
    await updateSession(session.id, machineId, { isStarred: !session.isStarred });
    onSessionUpdated();
  };

  const toggleWatch = async () => {
    if (!session || !machineId) return;
    await updateSession(session.id, machineId, { isWatched: !session.isWatched });
    onSessionUpdated();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-bg-secondary px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/sessions">
            <Button variant="ghost" size="icon">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {editing ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    placeholder={title}
                    className="flex-1 min-w-0 text-base font-semibold bg-bg-primary border border-brand rounded px-2 py-0.5 text-text-high outline-none"
                  />
                  <button onClick={handleRename} className="p-1 rounded hover:bg-bg-hover text-success">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-bg-hover text-error">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-base font-semibold text-text-high truncate max-w-md" title={title}>
                    {title}
                  </h2>
                  <button
                    onClick={() => { setEditValue(session?.displayName || ''); setEditing(true); }}
                    className="p-1 rounded hover:bg-bg-hover text-text-low shrink-0"
                  >
                    <PencilSimple size={14} />
                  </button>
                </>
              )}

              <Badge variant="secondary" className="shrink-0">{sorted.length} msgs</Badge>

              {session && (
                <>
                  <button
                    onClick={toggleWatch}
                    className={cn('p-1 rounded hover:bg-bg-hover shrink-0', session.isWatched ? 'text-info' : 'text-text-low')}
                    title={session.isWatched ? 'Unwatch' : 'Watch'}
                  >
                    <Eye size={16} weight={session.isWatched ? 'fill' : 'regular'} />
                  </button>
                  <button
                    onClick={toggleStar}
                    className={cn('p-1 rounded hover:bg-bg-hover shrink-0', session.isStarred ? 'text-warning' : 'text-text-low')}
                    title={session.isStarred ? 'Unstar' : 'Star'}
                  >
                    <Star size={16} weight={session.isStarred ? 'fill' : 'regular'} />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-text-low">
              {machine && (
                <span className="flex items-center gap-1">
                  <Desktop size={13} />
                  {machine.displayName || machine.hostname}
                </span>
              )}
              {session && (
                <Badge
                  className={cn('text-[10px] capitalize',
                    session.source === 'claude' ? 'bg-[#D97706]/15 text-[#D97706]' :
                    'bg-[#10B981]/15 text-[#10B981]'
                  )}
                  variant="secondary"
                >
                  {session.source}
                </Badge>
              )}
              {sorted.length > 0 && sorted[0].timestamp && (
                <span className="flex items-center gap-1">
                  <Clock size={13} />
                  {new Date(sorted[0].timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-sm text-text-low text-center py-12">Loading messages...</div>
        ) : sorted.length === 0 ? (
          <div className="text-sm text-text-low text-center py-12">No messages in this session</div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {sorted.map((msg, i) => (
              <MessageBubble key={msg.id ?? i} message={msg} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-text-low py-2">
                <CircleNotch size={16} className="animate-spin" />
                <span>等待 AI 回复中...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Continue conversation input */}
      {session && machineId && (session.source === 'claude' || session.source === 'codex') && (
        <div className="border-t border-border bg-bg-secondary px-4 py-3 shrink-0">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const prompt = inputValue.trim();
              if (!prompt || sending) return;
              setSending(true);
              setSendError(null);
              try {
                await continueSession(machineId, sessionId!, session.source, prompt, session.projectPath);
                setInputValue('');
              } catch (err: any) {
                setSendError(err.message || 'Failed to send');
                setSending(false);
              }
            }}
            className="max-w-4xl mx-auto flex items-center gap-2"
          >
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`继续对话 (${session.source} resume)...`}
              disabled={sending}
              className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-high placeholder:text-text-low outline-none focus:border-brand disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !inputValue.trim()}
              className={cn(
                'p-2 rounded-lg transition-colors',
                sending || !inputValue.trim()
                  ? 'text-text-low bg-bg-panel cursor-not-allowed'
                  : 'text-white bg-brand hover:bg-brand/80'
              )}
            >
              {sending ? <CircleNotch size={18} className="animate-spin" /> : <PaperPlaneRight size={18} />}
            </button>
          </form>
          {sendError && (
            <p className="max-w-4xl mx-auto text-xs text-error mt-1">{sendError}</p>
          )}
        </div>
      )}
    </div>
  );
}
