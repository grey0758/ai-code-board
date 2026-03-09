import { User, Robot, Info } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/types';
import { format } from 'date-fns';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isAssistant = message.type === 'assistant';
  const isSystem = message.type === 'system';

  const timestamp = message.timestamp
    ? format(new Date(message.timestamp), 'HH:mm:ss')
    : '';

  if (!message.content?.trim()) return null;

  // Hide system-injected codex messages (AGENTS.md, permissions, skills, session_meta)
  if (message.type === 'session_meta') return null;
  if (isUser && message.content) {
    const c = message.content.trim();
    if (c.startsWith('# AGENTS.md')) return null;
    if (c.startsWith('<permissions instructions>')) return null;
    if (c.startsWith('# Instructions')) return null;
  }

  return (
    <div
      className={cn(
        'flex gap-3 max-w-3xl',
        isUser && 'ml-auto flex-row-reverse'
      )}
    >
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1',
          isUser && 'bg-brand/15 text-brand',
          isAssistant && 'bg-bg-panel text-text-normal',
          isSystem && 'bg-warning/15 text-warning'
        )}
      >
        {isUser && <User size={16} weight="bold" />}
        {isAssistant && <Robot size={16} weight="bold" />}
        {isSystem && <Info size={16} weight="bold" />}
        {!isUser && !isAssistant && !isSystem && (
          <Info size={16} weight="bold" />
        )}
      </div>

      <div className="flex flex-col gap-1 min-w-0 max-w-[85%]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-high capitalize">
            {message.type}
          </span>
          {timestamp && (
            <span className="text-xs text-text-low">{timestamp}</span>
          )}
        </div>
        <div
          className={cn(
            'px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
            isUser && 'chat-bubble-user',
            isAssistant && 'chat-bubble-assistant',
            isSystem && 'chat-bubble-system',
            !isUser && !isAssistant && !isSystem && 'chat-bubble-assistant'
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
