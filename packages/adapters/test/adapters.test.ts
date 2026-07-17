import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { claudeDesktopAdapter } from '../src/adapters/claude-desktop.ts';
import { codexAdapter } from '../src/adapters/codex.ts';
import { opencodeAdapter } from '../src/adapters/opencode.ts';
import { openclawAdapter } from '../src/adapters/openclaw.ts';
import { zcodeAdapter } from '../src/adapters/zcode.ts';
import { geminiAdapter } from '../src/adapters/gemini.ts';
import { cursorAdapter } from '../src/adapters/cursor.ts';
import { continueAdapter } from '../src/adapters/continue.ts';
import { scanAll, allAdapters } from '../src/index.ts';

const fixtureHome = (name: string): string => join(import.meta.dirname, 'fixtures', name, 'home');

async function scanFixture(adapter: typeof claudeDesktopAdapter, name: string) {
  const home = fixtureHome(name);
  const configPath = adapter.candidatePaths({ home }).find(Boolean)!;
  return adapter.scan({ home }, configPath);
}

describe('claudeDesktopAdapter', () => {
  test('extracts mcp servers, extensions, bridge sessions', async () => {
    const home = fixtureHome('claude-desktop');
    const configPath = join(home, 'AppData', 'Roaming', 'Claude');
    const result = await claudeDesktopAdapter.scan({ home }, configPath);
    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers.find((server) => server.name === 'notion')!.transport).toBe('sse');
    expect(result.plugins.map((plugin) => plugin.name)).toEqual(
      expect.arrayContaining(['browser-tools', 'context-helper.mcpb']),
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.harness.dispatch).toEqual({ kind: 'manual' });
  });
});

describe('codexAdapter', () => {
  test('extracts AGENTS.md memory, toml mcp, auth key names, sessions, token usage', async () => {
    const result = await scanFixture(codexAdapter, 'codex');
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]!.type).toBe('instruction');
    expect(result.mcpServers).toEqual([
      { harness: 'codex', name: 'github', transport: 'stdio', command: 'npx -y mcp-github' },
    ]);
    expect(result.envKeys.map((entry) => entry.key)).toContain('OPENAI_API_KEY');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.messageCount).toBe(2);
    expect(result.usage.inputTokens).toBe(12345);
    expect(result.usage.source).toBe('logged');
  });
});

describe('opencodeAdapter', () => {
  test('parses jsonc config, env placeholders, skills, sessions from data dir', async () => {
    const result = await scanFixture(opencodeAdapter, 'opencode');
    expect(result.mcpServers).toEqual([
      { harness: 'opencode', name: 'playwright', transport: 'stdio', command: 'npx playwright-mcp' },
    ]);
    expect(result.plugins.map((plugin) => plugin.name)).toEqual(['notify']);
    expect(result.envKeys.map((entry) => entry.key)).toEqual(['OPENROUTER_API_KEY']);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.description).toBe('Greets people');
    expect(result.memories).toHaveLength(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.title).toBe('Fix login bug');
  });
});

describe('openclawAdapter', () => {
  test('extracts agents, memories, extensions, flows; credential values never leak', async () => {
    const result = await scanFixture(openclawAdapter, 'openclaw');
    expect(result.agents.map((agent) => agent.name)).toContain('main');
    expect(result.agents.find((agent) => agent.name === 'main')!.description).toBe('Primary agent');
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]!.type).toBe('feedback');
    expect(result.plugins.map((plugin) => plugin.name)).toEqual(['webhooks']);
    expect(result.envKeys).toEqual([
      expect.objectContaining({ key: 'github-token' }),
    ]);
    expect(result.skills.map((skill) => skill.name)).toEqual(['daily-report']);
    expect(result.sessions).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('SECRET-VALUE-SHOULD-NEVER-APPEAR');
  });
});

describe('zcodeAdapter', () => {
  test('extracts skills, plugins, best-effort sessions with shallow warning', async () => {
    const result = await scanFixture(zcodeAdapter, 'zcode');
    expect(result.skills.map((skill) => skill.name)).toEqual(['refactor']);
    expect(result.plugins.map((plugin) => plugin.name)).toEqual(['linter']);
    expect(result.sessions.map((session) => session.id)).toEqual(['session-abc']);
    expect(result.harness.health).toBe('warnings');
  });
});

describe('geminiAdapter', () => {
  test('extracts GEMINI.md, mcp, history sessions, presence-only env markers', async () => {
    const result = await scanFixture(geminiAdapter, 'gemini');
    expect(result.memories[0]!.title).toBe('Gemini rules');
    expect(result.mcpServers).toHaveLength(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.envKeys.map((entry) => entry.key)).toEqual(['GOOGLE_ACCOUNT']);
    expect(JSON.stringify(result)).not.toContain('REDACTED');
  });
});

describe('cursorAdapter', () => {
  test('extracts mcp.json, versioned extensions, rule memories', async () => {
    const result = await scanFixture(cursorAdapter, 'cursor');
    expect(result.mcpServers[0]!.transport).toBe('http');
    expect(result.plugins).toEqual([
      { harness: 'cursor', name: 'vendor.tool', version: '1.2.3', enabled: true },
    ]);
    expect(result.memories[0]!.title).toBe('Style rules');
    expect(result.harness.health).toBe('warnings');
  });
});

describe('continueAdapter', () => {
  test('extracts mcp list, models as agents, env refs, rules, session index', async () => {
    const result = await scanFixture(continueAdapter, 'continue');
    expect(result.mcpServers[0]!.command).toBe('npx mcp-github');
    expect(result.agents).toEqual([
      { harness: 'continue', name: 'Sonnet', description: 'model: anthropic' },
    ]);
    expect(result.envKeys.map((entry) => entry.key)).toEqual(['ANTHROPIC_API_KEY']);
    expect(result.memories[0]!.title).toBe('Team rules');
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]!.title).toBe('Add tests');
  });
});

describe('scanAll registry', () => {
  test('covers all 10 kinds minus generic and never throws on an empty home', async () => {
    expect(allAdapters).toHaveLength(9);
    const results = await scanAll({ home: join(import.meta.dirname, 'fixtures', 'does-not-exist') });
    expect(results).toHaveLength(9);
    for (const result of results) {
      expect(result.harness.detected).toBe(false);
      expect(result.harness.health).toBe('not-found');
    }
  });

  test('detects a harness when its fixture home is used', async () => {
    const results = await scanAll({ home: fixtureHome('codex') });
    const codex = results.find((result) => result.harness.id === 'codex')!;
    expect(codex.harness.detected).toBe(true);
    expect(codex.memories).toHaveLength(1);
  });
});
