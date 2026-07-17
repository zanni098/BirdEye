import { basename, join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parseMemoryMarkdown, type EnvKeyRecord, type McpServerRecord, type ScanResult, type SessionRecord } from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness, unknownUsage } from '../adapter.ts';
import { countLines, fileBirthtime, fileMtime, listDirs, listFiles, safeReadJson, safeReadText } from '../fs-utils.ts';

const KIND = 'codex' as const;
const MAX_SESSIONS = 500;

function scanTomlMcp(configPath: string, warnings: string[]): McpServerRecord[] {
  const text = safeReadText(join(configPath, 'config.toml'));
  if (text === null) return [];
  try {
    const parsed = parseToml(text) as { mcp_servers?: Record<string, { command?: string; args?: string[]; url?: string }> };
    return Object.entries(parsed.mcp_servers ?? {}).map(([name, server]) => ({
      harness: KIND, name,
      transport: server.url ? 'http' as const : server.command ? 'stdio' as const : 'unknown' as const,
      command: server.command
        ? [server.command, ...(server.args ?? [])].join(' ')
        : server.url ?? null,
    }));
  } catch {
    warnings.push('config.toml could not be parsed');
    return [];
  }
}

/** sessions/YYYY/MM/DD/rollout-*.jsonl */
function scanSessions(configPath: string): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  const root = join(configPath, 'sessions');
  for (const year of listDirs(root)) {
    for (const month of listDirs(join(root, year))) {
      for (const day of listDirs(join(root, year, month))) {
        for (const file of listFiles(join(root, year, month, day), '.jsonl')) {
          if (sessions.length >= MAX_SESSIONS) return sessions;
          const filePath = join(root, year, month, day, file);
          sessions.push({
            harness: KIND, id: basename(file, '.jsonl'),
            title: `Codex session ${year}-${month}-${day}`,
            startedAt: fileBirthtime(filePath)?.toISOString() ?? null,
            lastActiveAt: fileMtime(filePath)?.toISOString() ?? null,
            messageCount: countLines(filePath), project: null,
          });
        }
      }
    }
  }
  return sessions;
}

function findTokenNumbers(value: unknown, depth: number, out: number[]): void {
  if (depth > 2 || value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === 'number' && /token/i.test(key)) out.push(child);
    else findTokenNumbers(child, depth + 1, out);
  }
}

export const codexAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Codex',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.codex')];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];
    const memories = [];
    const agentsMd = safeReadText(join(configPath, 'AGENTS.md'));
    if (agentsMd) {
      const record = parseMemoryMarkdown(agentsMd, {
        harness: KIND, file: join(configPath, 'AGENTS.md'), mtime: fileMtime(join(configPath, 'AGENTS.md')),
      });
      if (record) memories.push(record);
    }

    const auth = safeReadJson<Record<string, unknown>>(join(configPath, 'auth.json'));
    const envKeys: EnvKeyRecord[] = Object.keys(auth ?? {}).map((key) => ({
      harness: KIND, key, sourceFile: join(configPath, 'auth.json'),
    }));

    const sessions = scanSessions(configPath);

    const tokenNumbers: number[] = [];
    findTokenNumbers(safeReadJson(join(configPath, '.codex-global-state.json')), 0, tokenNumbers);
    const totalTokens = tokenNumbers.reduce((sum, value) => sum + value, 0);
    const usage = totalTokens > 0 || sessions.length > 0
      ? {
          harness: KIND, period: 'all-time' as const,
          inputTokens: totalTokens > 0 ? totalTokens : null, outputTokens: null, costUsd: null,
          sessions: sessions.length, source: 'logged' as const,
        }
      : unknownUsage(KIND);

    const harness = makeHarness(KIND, 'Codex', configPath, warnings, {
      command: 'codex', args: ['exec'], kind: 'cli',
    });
    return {
      ...emptyScanResult(harness),
      sessions, memories, envKeys,
      mcpServers: scanTomlMcp(configPath, warnings),
      usage,
    };
  },
};
