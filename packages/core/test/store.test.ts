import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { BirdEyeStore, dedupMemories } from '../src/store.ts';
import type { MemoryRecord, ScanResult } from '../src/types.ts';

function memory(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: 'claude-code:abc',
    title: 'Fact',
    body: 'The user prefers dark mode.',
    type: 'user',
    sourceHarness: 'claude-code',
    sourceFile: '/x/fact.md',
    createdAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    links: [],
    contentHash: 'hash-a',
    ...overrides,
  };
}

describe('dedupMemories', () => {
  test('identical contentHash across harnesses merges into one with union tags', () => {
    const a = memory({ tags: ['ui'] });
    const b = memory({ id: 'gemini:abc', sourceHarness: 'gemini', tags: ['theme'] });
    const result = dedupMemories([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]!.tags.sort()).toEqual(['theme', 'ui']);
  });

  test('same title with near-identical body merges (fuzzy)', () => {
    const a = memory({ contentHash: 'h1', body: 'The user prefers dark mode always.' });
    const b = memory({ id: 'codex:x', sourceHarness: 'codex', contentHash: 'h2', body: 'The user prefers dark mode alway.' });
    expect(dedupMemories([a, b])).toHaveLength(1);
  });

  test('same title with different body stays separate', () => {
    const a = memory({ contentHash: 'h1', body: 'Likes coffee in the morning.' });
    const b = memory({ id: 'codex:x', contentHash: 'h2', body: 'Deploys are done via Vercel with a custom pipeline.' });
    expect(dedupMemories([a, b])).toHaveLength(2);
  });
});

describe('BirdEyeStore', () => {
  let dir: string;
  let store: BirdEyeStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'birdeye-test-'));
    store = new BirdEyeStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('scan round-trips', () => {
    const scan = [{ harness: { id: 'zcode', name: 'Zcode', configPath: '/x', detected: true, health: 'ok', warnings: [], lastScanAt: 'now' }, sessions: [], memories: [], skills: [], plugins: [], mcpServers: [], agents: [], envKeys: [], usage: { harness: 'zcode', period: 'all-time', inputTokens: null, outputTokens: null, costUsd: null, sessions: null, source: 'unknown' } }] satisfies ScanResult[];
    store.saveScan(scan);
    expect(store.loadScan()).toEqual(scan);
  });

  test('loadScan returns null when nothing saved', () => {
    expect(store.loadScan()).toBeNull();
  });

  test('tasks default to empty list', () => {
    expect(store.loadTasks()).toEqual([]);
  });

  test('canonicalMemories combines scan + gateway memories deduped', () => {
    const shared = memory({});
    store.saveScan([{ harness: { id: 'claude-code', name: 'Claude Code', configPath: '/x', detected: true, health: 'ok', warnings: [], lastScanAt: 'now' }, sessions: [], memories: [shared], skills: [], plugins: [], mcpServers: [], agents: [], envKeys: [], usage: { harness: 'claude-code', period: 'all-time', inputTokens: null, outputTokens: null, costUsd: null, sessions: null, source: 'unknown' } }]);
    store.addMemory(memory({ id: 'gemini:abc', sourceHarness: 'gemini' }));
    store.addMemory(memory({ id: 'x:new', contentHash: 'other', title: 'Different', body: 'Completely different fact.' }));
    expect(store.canonicalMemories()).toHaveLength(2);
  });
});
