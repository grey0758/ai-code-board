import { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  File,
  ArrowLeft,
  PaperPlaneRight,
  CircleNotch,
  House,
} from '@phosphor-icons/react';
import { browseDirectory, newSession, type DirEntry } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

interface NewConversationDialogProps {
  machineId: string;
  machineName: string;
  onClose: () => void;
  onStarted: () => void;
}

/** Check if a path looks like a Windows drive root (e.g. "C:\") */
function isDriveRoot(path: string): boolean {
  return /^[A-Za-z]:\\?$/.test(path);
}

/** Check if we're at the virtual root (drive selector level on Windows, or "/" on Unix) */
function isAtRoot(path: string, isWindows: boolean): boolean {
  if (isWindows) return path === '/';
  return path === '/';
}

/** Split a path into breadcrumb segments, handling both Unix and Windows */
function getPathSegments(path: string, isWindows: boolean): { name: string; path: string }[] {
  if (isWindows) {
    if (path === '/') return []; // drive selector level
    // Windows path like C:\Users\foo
    const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
    const parts = normalized.split('/').filter(Boolean);
    const segments: { name: string; path: string }[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        // Drive letter: "C:" → "C:\"
        segments.push({ name: parts[0], path: parts[0] + '\\' });
      } else {
        // Reconstruct Windows path
        segments.push({
          name: parts[i],
          path: parts[0] + '\\' + parts.slice(1, i + 1).join('\\'),
        });
      }
    }
    return segments;
  }
  // Unix
  const parts = path.split('/').filter(Boolean);
  return parts.map((seg, i) => ({
    name: seg,
    path: '/' + parts.slice(0, i + 1).join('/'),
  }));
}

/** Get parent path */
function getParentPath(path: string, isWindows: boolean): string {
  if (isWindows) {
    // Drive root (C:\) → go to drive selector
    if (isDriveRoot(path)) return '/';
    // Remove last segment
    const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 0) return '/';
    const parent = normalized.substring(0, lastSlash);
    // If parent is just "C:", make it "C:\"
    if (/^[A-Za-z]:$/.test(parent)) return parent + '\\';
    // Convert back to Windows separators
    return parent.replace(/\//g, '\\');
  }
  // Unix
  const parent = path.replace(/\/[^/]+\/?$/, '') || '/';
  return parent;
}

export function NewConversationDialog({
  machineId,
  machineName,
  onClose,
  onStarted,
}: NewConversationDialogProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [source, setSource] = useState<'claude' | 'codex'>('claude');
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isWindowsAgent, setIsWindowsAgent] = useState(false);

  const loadDirectory = async (path?: string) => {
    setLoading(true);
    setBrowseError(null);
    try {
      const result = await browseDirectory(machineId, path);
      setCurrentPath(result.path);
      setItems(result.items);
      if (result.isWindows !== undefined) {
        setIsWindowsAgent(result.isWindows);
      }
    } catch (err: any) {
      setBrowseError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, [machineId]);

  const navigateTo = (path: string) => {
    loadDirectory(path);
  };

  const goUp = () => {
    const parent = getParentPath(currentPath, isWindowsAgent);
    loadDirectory(parent);
  };

  const goHome = () => {
    // Navigate to root: "/" for Unix, or "/" which agent interprets as drive selector on Windows
    loadDirectory('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError(null);
    try {
      await newSession(machineId, source, text, currentPath);
      onStarted();
      onClose();
    } catch (err: any) {
      setSendError(err.message || 'Failed to start session');
      setSending(false);
    }
  };

  const pathSegments = getPathSegments(currentPath, isWindowsAgent);
  const atRoot = isAtRoot(currentPath, isWindowsAgent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-base font-semibold text-text-high">New Conversation</h3>
            <p className="text-xs text-text-low mt-0.5">on {machineName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-low">
            <X size={18} />
          </button>
        </div>

        {/* Tool selector */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-2 shrink-0">
          <span className="text-xs text-text-low mr-1">Tool:</span>
          <button
            onClick={() => setSource('claude')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              source === 'claude' ? 'bg-[#D97706]/15 text-[#D97706]' : 'text-text-low hover:bg-bg-hover'
            )}
          >
            Claude
          </button>
          <button
            onClick={() => setSource('codex')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              source === 'codex' ? 'bg-[#10B981]/15 text-[#10B981]' : 'text-text-low hover:bg-bg-hover'
            )}
          >
            Codex
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-5 py-2 flex items-center gap-1 text-xs text-text-low shrink-0 overflow-x-auto">
          <button
            onClick={goHome}
            className="hover:text-brand shrink-0 p-0.5"
            title={isWindowsAgent ? 'Drives' : 'Root'}
          >
            <House size={14} />
          </button>
          {pathSegments.map((seg) => (
            <span key={seg.path} className="flex items-center gap-1 shrink-0">
              <span className="text-text-low">{isWindowsAgent ? '\\' : '/'}</span>
              <button
                onClick={() => navigateTo(seg.path)}
                className="hover:text-brand hover:underline"
              >
                {seg.name}
              </button>
            </span>
          ))}
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-low text-sm">
              <CircleNotch size={16} className="animate-spin mr-2" />
              Loading...
            </div>
          ) : browseError ? (
            <div className="text-sm text-error text-center py-8">{browseError}</div>
          ) : (
            <div className="space-y-0.5">
              {/* Go up */}
              {!atRoot && (
                <button
                  onClick={goUp}
                  className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors text-text-normal"
                >
                  <ArrowLeft size={14} className="text-text-low" />
                  <span>..</span>
                </button>
              )}
              {items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => item.isDirectory && navigateTo(item.path)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm transition-colors text-left',
                    item.isDirectory
                      ? 'hover:bg-bg-hover text-text-high cursor-pointer'
                      : 'text-text-low cursor-default opacity-50'
                  )}
                  disabled={!item.isDirectory}
                >
                  {item.isDirectory ? (
                    <Folder size={16} className="text-[#D97706] shrink-0" />
                  ) : (
                    <File size={16} className="text-text-low shrink-0" />
                  )}
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-text-low text-center py-4">Empty directory</p>
              )}
            </div>
          )}
        </div>

        {/* Selected path + prompt input */}
        <div className="border-t border-border px-5 py-4 shrink-0 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <FolderOpen size={14} className="text-brand shrink-0" />
            <span className="text-text-low">Working directory:</span>
            <code className="text-text-high bg-bg-secondary px-2 py-0.5 rounded truncate flex-1">
              {currentPath || '~'}
            </code>
          </div>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt..."
              disabled={sending}
              className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-high placeholder:text-text-low outline-none focus:border-brand disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={sending || !prompt.trim()}
              className={cn(
                'p-2.5 rounded-lg transition-colors',
                sending || !prompt.trim()
                  ? 'text-text-low bg-bg-secondary cursor-not-allowed'
                  : 'text-white bg-brand hover:bg-brand/80'
              )}
            >
              {sending ? <CircleNotch size={18} className="animate-spin" /> : <PaperPlaneRight size={18} />}
            </button>
          </form>
          {sendError && <p className="text-xs text-error">{sendError}</p>}
        </div>
      </div>
    </div>
  );
}
