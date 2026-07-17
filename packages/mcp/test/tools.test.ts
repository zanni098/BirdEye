import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { BirdEyeStore, Vault, type HarnessKind, type TaskRecord } from '@birdeye/core';
import { createTools, type BirdEyeTools } from '../src/tools.ts';
import { registrationSnippet } from '../src/register-snippets.ts';

const ALL_KINDS: HarnessKind[] = [
  'claude-code', 'claude-desktop', 'codex', 'opencode', 'openclaw',
  'zcode', 'gemini', 'cursor', 'continue', 'generic',
];

describe('createTools', () => {
  let dir: string;
  let store: BirdEyeStore;
  let tools: BirdEyeTools;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'birdeye-mcp-'));
    store = new BirdEyeStore(dir);
    tools = createTools({ store, vault: new Vault({ filePath: join(dir, 'vault.enc'), passphrase: 'test' }) });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('memory_save then memory_search round-trips across the shared store', () => {
    const saved = tools.memory_save({ title: 'Deploy window', body: 'Deploys happen Tuesdays. #ops [[release-checklist]]' });
    expect(saved.id).toMatch(/^generic:/);
    const found = tools.memory_search({ query: 'tuesdays' });
    expect(found).toHaveLength(1);
    expect(found[0]!.tags).toContain('ops');
    expect(found[0]!.links).toEqual(['release-checklist']);
    expect(tools.memory_search({ query: 'nonexistent-needle' })).toHaveLength(0);
  });

  test('task lifecycle: claim then update with note', () => {
    const task: TaskRecord = {
      id: 't-1', title: 'Do thing', briefing: 'Details', status: 'todo', assignedHarness: null,
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      runs: [{ id: 'r-1', startedAt: '2026-07-01T01:00:00.000Z', endedAt: null, status: 'running', exitCode: null, output: 'working' }],
    };
    store.saveTasks([task]);

    const claimed = tools.task_claim({ taskId: 't-1', harness: 'codex' });
    expect(claimed.status).toBe('claimed');
    expect(claimed.assignedHarness).toBe('codex');

    const updated = tools.task_update({ taskId: 't-1', status: 'done', note: 'shipped' });
    expect(updated.status).toBe('done');
    expect(updated.runs[0]!.output).toContain('[update] shipped');

    expect(() => tools.task_update({ taskId: 't-1', status: 'bogus' })).toThrow(/invalid status/);
    expect(() => tools.task_claim({ taskId: 'missing', harness: 'codex' })).toThrow(/not found/);
  });

  test('vault_get returns stored secrets and errors on missing keys', () => {
    const vault = new Vault({ filePath: join(dir, 'vault.enc'), passphrase: 'test' });
    vault.set('GITHUB_TOKEN', 'gho_abc');
    expect(tools.vault_get({ key: 'GITHUB_TOKEN' })).toBe('gho_abc');
    expect(() => tools.vault_get({ key: 'NOPE' })).toThrow(/no secret/);
  });
});

describe('registrationSnippet', () => {
  test('every harness kind gets a birdeye registration', () => {
    for (const kind of ALL_KINDS) {
      const snippet = registrationSnippet(kind);
      expect(snippet.snippet.toLowerCase()).toContain('birdeye');
      expect(['json', 'toml', 'text']).toContain(snippet.format);
      if (snippet.format === 'json') expect(snippet.jsonPath).toBeTruthy();
    }
  });
});
