import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

interface OffsetData {
  [filePath: string]: {
    byteOffset: number;
    lineCount: number;
  };
}

const STORE_PATH = join(homedir(), '.chat-sync', 'offsets.json');

export class OffsetStore {
  private data: OffsetData = {};

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = readFileSync(STORE_PATH, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  get(filePath: string): { byteOffset: number; lineCount: number } {
    return this.data[filePath] || { byteOffset: 0, lineCount: 0 };
  }

  set(filePath: string, byteOffset: number, lineCount: number) {
    this.data[filePath] = { byteOffset, lineCount };
    this.save();
  }

  private save() {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2));
  }
}
