import chokidar from 'chokidar';
import { IncrementalReader } from './reader.js';
import { Uploader } from './uploader.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

export class FileWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;

  constructor(
    private watchDirs: string[],
    private reader: IncrementalReader,
    private uploader: Uploader
  ) {}

  async start() {
    // First, do initial scan of existing files
    console.log('[Watcher] Initial scan...');
    const jsonlFiles = this.findAllJsonlFiles();
    console.log(`[Watcher] Found ${jsonlFiles.length} JSONL files`);

    for (const file of jsonlFiles) {
      await this.processFile(file);
    }

    // Watch directories (not globs — chokidar v4 needs dir paths)
    const existingDirs = this.watchDirs.filter(d => existsSync(d));
    this.watcher = chokidar.watch(existingDirs, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 2000,
      ignored: [
        /memory\//,
        /node_modules/,
      ],
    });

    this.watcher.on('change', (path) => {
      if (!path.endsWith('.jsonl')) return;
      console.log(`[Watcher] Changed: ${path}`);
      this.processFile(path);
    });

    this.watcher.on('add', (path) => {
      if (!path.endsWith('.jsonl')) return;
      console.log(`[Watcher] New file: ${path}`);
      this.processFile(path);
    });

    this.watcher.on('error', (err) => {
      console.error(`[Watcher] Error:`, err);
    });

    console.log('[Watcher] Watching for changes...');
  }

  stop() {
    this.watcher?.close();
  }

  private findAllJsonlFiles(): string[] {
    const files: string[] = [];
    for (const dir of this.watchDirs) {
      if (!existsSync(dir)) continue;
      this.walkDir(dir, files);
    }
    return files;
  }

  private walkDir(dir: string, files: string[]) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'memory' || entry.name === 'node_modules') continue;
          this.walkDir(fullPath, files);
        } else if (entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      }
    } catch {}
  }

  private async processFile(filePath: string) {
    const result = await this.reader.readFile(filePath);
    if (!result || result.messages.length === 0) return;

    // Queue for upload
    this.uploader.push(
      result.messages,
      {
        sessionId: result.sessionId,
        projectPath: result.projectPath,
        source: result.source,
        filePath,
      },
      {
        filePath,
        byteOffset: result.newOffset,
        lineCount: result.newLineCount,
      }
    );
  }
}
