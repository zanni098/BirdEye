import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { levenshtein, normalizeBody } from './hash.ts';
import type { MemoryRecord, ScanResult, TaskRecord } from './types.ts';

const FUZZY_BODY_THRESHOLD = 0.15;

export function defaultBaseDir(): string {
  return process.env.BIRDEYE_HOME ?? join(homedir(), '.birdeye');
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Math.floor(Math.random() * 1e9)}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, filePath);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function mergeInto(base: MemoryRecord, extra: MemoryRecord): MemoryRecord {
  return {
    ...base,
    tags: [...new Set([...base.tags, ...extra.tags])],
    links: [...new Set([...base.links, ...extra.links])],
    createdAt:
      base.createdAt && extra.createdAt
        ? (base.createdAt <= extra.createdAt ? base.createdAt : extra.createdAt)
        : base.createdAt ?? extra.createdAt,
  };
}

/** Exact (contentHash) then fuzzy (same title, near-identical body) dedup across harnesses. */
export function dedupMemories(records: MemoryRecord[]): MemoryRecord[] {
  const byHash = new Map<string, MemoryRecord>();
  for (const record of records) {
    const existing = byHash.get(record.contentHash);
    byHash.set(record.contentHash, existing ? mergeInto(existing, record) : record);
  }
  const byTitle = new Map<string, MemoryRecord[]>();
  const result: MemoryRecord[] = [];
  for (const record of byHash.values()) {
    const titleKey = normalizeBody(record.title);
    const group = byTitle.get(titleKey) ?? [];
    const match = group.find((candidate) => {
      const a = normalizeBody(candidate.body);
      const b = normalizeBody(record.body);
      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) return true;
      return levenshtein(a, b) / maxLen < FUZZY_BODY_THRESHOLD;
    });
    if (match) {
      const merged = mergeInto(match, record);
      group[group.indexOf(match)] = merged;
      result[result.indexOf(match)] = merged;
    } else {
      group.push(record);
      result.push(record);
    }
    byTitle.set(titleKey, group);
  }
  return result;
}

export class BirdEyeStore {
  readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? defaultBaseDir();
    mkdirSync(this.baseDir, { recursive: true });
  }

  private file(name: string): string {
    return join(this.baseDir, name);
  }

  saveScan(results: ScanResult[]): void {
    atomicWriteJson(this.file('scan.json'), results);
  }

  loadScan(): ScanResult[] | null {
    return readJson<ScanResult[]>(this.file('scan.json'));
  }

  saveTasks(tasks: TaskRecord[]): void {
    atomicWriteJson(this.file('tasks.json'), tasks);
  }

  loadTasks(): TaskRecord[] {
    return readJson<TaskRecord[]>(this.file('tasks.json')) ?? [];
  }

  /** Memories saved directly via the MCP gateway (outside any harness scan). */
  addMemory(record: MemoryRecord): void {
    const all = readJson<MemoryRecord[]>(this.file('memories.json')) ?? [];
    all.push(record);
    atomicWriteJson(this.file('memories.json'), all);
  }

  loadExtraMemories(): MemoryRecord[] {
    return readJson<MemoryRecord[]>(this.file('memories.json')) ?? [];
  }

  /** All memories across every scanned harness plus gateway-saved ones, deduped. */
  canonicalMemories(): MemoryRecord[] {
    const scan = this.loadScan() ?? [];
    const fromScan = scan.flatMap((result) => result.memories);
    return dedupMemories([...fromScan, ...this.loadExtraMemories()]);
  }
}
