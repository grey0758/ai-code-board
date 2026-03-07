import { ChatCircleDots, GearSix, Moon, Sun } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';
import { useEffect, useState } from 'react';

interface AppBarProps {
  wsConnected: boolean;
}

export function AppBar({ wsConnected }: AppBarProps) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <header className="h-12 border-b border-border bg-bg-secondary flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <ChatCircleDots size={22} weight="duotone" className="text-brand" />
        <h1 className="text-base font-semibold text-text-high">Chat Sync</h1>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-text-low">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              wsConnected ? 'status-online' : 'status-offline'
            )}
          />
          {wsConnected ? 'Live' : 'Disconnected'}
        </div>

        <button
          onClick={() => setDark(!dark)}
          className="p-1.5 rounded-md hover:bg-bg-hover text-text-low transition-colors"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
