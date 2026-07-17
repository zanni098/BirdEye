import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MARKER_START, Vault, type MemoryRecord } from '@birdeye/core';
import { registrationSnippet } from '@birdeye/mcp';
import { applyRegistration, syncEnvTargets, syncMemoryPack } from '../src/file-ops.ts';

let home: string;

beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'birdeye-cli-')); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('applyRegistration', () => {
  test('json: preserves existing servers, adds birdeye, creates backup', () => {
    const target = join(home, '.claude.json');
    writeFileSync(target, JSON.stringify({ mcpServers: { github: { command: 'npx mcp-github' } }, other: 1 }), 'utf8');

    const change = applyRegistration(registrationSnippet('claude-code'), home);
    expect(change.action).toBe('updated');
    expect(change.backup).toBeTruthy();
    expect(existsSync(change.backup!)).toBe(true);

    const written = JSON.parse(readFileSync(target, 'utf8')) as { mcpServers: Record<string, unknown>; other: number };
    expect(Object.keys(written.mcpServers).sort()).toEqual(['birdeye', 'github']);
    expect(written.other).toBe(1);
  });

  test('json: creates the file when missing', () => {
    const change = applyRegistration(registrationSnippet('cursor'), home);
    expect(change.action).toBe('created');
    const written = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(written.mcpServers['birdeye']).toBeDefined();
  });

  test('toml: appends once, second run skips', () => {
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(join(home, '.codex', 'config.toml'), 'model = "gpt-5"\n', 'utf8');
    expect(applyRegistration(registrationSnippet('codex'), home).action).toBe('updated');
    expect(applyRegistration(registrationSnippet('codex'), home).action).toBe('skipped');
    const text = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
    expect(text).toContain('model = "gpt-5"');
    expect(text.match(/\[mcp_servers\.birdeye\]/g)).toHaveLength(1);
  });

  test('text format prints instructions without touching disk', () => {
    const change = applyRegistration(registrationSnippet('openclaw'), home);
    expect(change.action).toBe('printed');
    expect(change.detail).toContain('birdeye');
  });
});

describe('syncEnvTargets', () => {
  test('writes mapped secrets, replaces on second run, never duplicates', () => {
    const vault = new Vault({ filePath: join(home, 'vault.enc'), passphrase: 'test' });
    vault.set('github-token', 'gho_first');
    const envPath = join(home, 'app', '.env');
    const map = { [envPath]: { GITHUB_TOKEN: 'github-token', MISSING: 'nope' } };

    const first = syncEnvTargets(map, vault, home);
    expect(first[0]!.action).toBe('created');
    expect(readFileSync(envPath, 'utf8')).toContain('GITHUB_TOKEN=gho_first');

    vault.set('github-token', 'gho_second');
    syncEnvTargets(map, vault, home);
    const text = readFileSync(envPath, 'utf8');
    expect(text).toContain('GITHUB_TOKEN=gho_second');
    expect(text.match(/GITHUB_TOKEN=/g)).toHaveLength(1);
  });
});

describe('syncMemoryPack', () => {
  const memories: MemoryRecord[] = [{
    id: 'a', title: 'Deploy window', body: 'Deploys happen Tuesdays.', type: 'note',
    sourceHarness: 'claude-code', sourceFile: '/x', createdAt: null, tags: [], links: [], contentHash: 'h',
  }];

  test('injects the marker block preserving user content, skips missing files', () => {
    const claudeMd = join(home, '.claude', 'CLAUDE.md');
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(claudeMd, '# Mine\n\nHands off.\n', 'utf8');

    const changes = syncMemoryPack(['~/.claude/CLAUDE.md', '~/.gemini/GEMINI.md'], memories, home);
    expect(changes.find((change) => change.file === claudeMd)!.action).toBe('updated');
    expect(changes.find((change) => change.file.endsWith('GEMINI.md'))!.action).toBe('skipped');

    const text = readFileSync(claudeMd, 'utf8');
    expect(text.startsWith('# Mine\n\nHands off.\n')).toBe(true);
    expect(text).toContain(MARKER_START);
    expect(text).toContain('Deploy window');

    // Second run with identical memories is a no-op.
    expect(syncMemoryPack(['~/.claude/CLAUDE.md'], memories, home)[0]!.action).toBe('skipped');
  });
});
