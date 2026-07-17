import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { claudeCodeAdapter } from '../src/adapters/claude-code.ts';

const FIXTURE_HOME = join(import.meta.dirname, 'fixtures', 'claude-code', 'home');

describe('claudeCodeAdapter', () => {
  test('candidatePaths points at ~/.claude', () => {
    expect(claudeCodeAdapter.candidatePaths({ home: FIXTURE_HOME })).toEqual([join(FIXTURE_HOME, '.claude')]);
  });

  test('scan extracts sessions, memories, skills, plugins, mcp, agents, env, usage', async () => {
    const configPath = join(FIXTURE_HOME, '.claude');
    const result = await claudeCodeAdapter.scan({ home: FIXTURE_HOME }, configPath);

    expect(result.harness.id).toBe('claude-code');
    expect(result.harness.detected).toBe(true);
    expect(result.harness.dispatch).toEqual({ command: 'claude', args: ['-p'], kind: 'cli' });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.id).toBe('abc-123');
    expect(result.sessions[0]!.messageCount).toBe(3);
    expect(result.sessions[0]!.project).toBe('C--Users-test-proj');

    expect(result.memories).toHaveLength(2);
    const memoryTitles = result.memories.map((memory) => memory.title);
    expect(memoryTitles).toEqual(expect.arrayContaining(['dark-mode-preference', 'Global rules']));
    const darkMode = result.memories.find((memory) => memory.title === 'dark-mode-preference')!;
    expect(darkMode.type).toBe('user');
    expect(darkMode.links).toEqual(['ui-preferences']);

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.description).toBe('A demo skill for testing');

    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.name).toBe('design-pack (official)');
    expect(result.plugins[0]!.version).toBe('1.0.0');

    expect(result.mcpServers).toHaveLength(2);
    expect(result.mcpServers.find((server) => server.name === 'github')!.transport).toBe('stdio');
    expect(result.mcpServers.find((server) => server.name === 'linear')!.transport).toBe('sse');

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]!.description).toBe('Reviews code carefully');

    expect(result.envKeys.map((entry) => entry.key)).toEqual(expect.arrayContaining(['ANTHROPIC_API_KEY', 'MY_FLAG']));

    expect(result.usage.costUsd).toBeCloseTo(0.09);
    expect(result.usage.sessions).toBe(1);
    expect(result.usage.source).toBe('logged');
  });
});
