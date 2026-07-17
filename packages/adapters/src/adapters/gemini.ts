import { join } from 'node:path';
import { parseMemoryMarkdown, type EnvKeyRecord, type McpServerRecord, type ScanResult, type SessionRecord } from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness, unknownUsage } from '../adapter.ts';
import { fileBirthtime, fileMtime, listDirs, listFiles, safeReadJson, safeReadText } from '../fs-utils.ts';

const KIND = 'gemini' as const;
const MAX_SESSIONS = 500;

interface GeminiSettings {
  mcpServers?: Record<string, { command?: string; url?: string; type?: string }>;
}

export const geminiAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Gemini CLI',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.gemini')];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];

    const memories = [];
    const geminiMdPath = join(configPath, 'GEMINI.md');
    const geminiMd = safeReadText(geminiMdPath);
    if (geminiMd) {
      const record = parseMemoryMarkdown(geminiMd, { harness: KIND, file: geminiMdPath, mtime: fileMtime(geminiMdPath) });
      if (record) memories.push(record);
    }

    const settings = safeReadJson<GeminiSettings>(join(configPath, 'settings.json'));
    const mcpServers: McpServerRecord[] = Object.entries(settings?.mcpServers ?? {}).map(([name, server]) => ({
      harness: KIND, name,
      transport: server.type === 'sse' ? 'sse' : server.url ? 'http' : server.command ? 'stdio' : 'unknown',
      command: server.command ?? server.url ?? null,
    }));

    const historyDir = join(configPath, 'history');
    const sessions: SessionRecord[] = [...listDirs(historyDir), ...listFiles(historyDir)]
      .slice(0, MAX_SESSIONS)
      .map((name) => {
        const entryPath = join(historyDir, name);
        return {
          harness: KIND, id: name, title: `Gemini session ${name}`,
          startedAt: fileBirthtime(entryPath)?.toISOString() ?? null,
          lastActiveAt: fileMtime(entryPath)?.toISOString() ?? null,
          messageCount: null, project: null,
        };
      });

    // Presence markers only — these files are never opened.
    const envKeys: EnvKeyRecord[] = [];
    for (const [file, key] of [['google_accounts.json', 'GOOGLE_ACCOUNT'], ['oauth_creds.json', 'GOOGLE_OAUTH_CREDS']] as const) {
      if (safeReadText(join(configPath, file)) !== null || listFiles(configPath).includes(file)) {
        envKeys.push({ harness: KIND, key, sourceFile: join(configPath, file) });
      }
    }

    const usage = sessions.length > 0
      ? { harness: KIND, period: 'all-time' as const, inputTokens: null, outputTokens: null, costUsd: null, sessions: sessions.length, source: 'logged' as const }
      : unknownUsage(KIND);

    const harness = makeHarness(KIND, 'Gemini CLI', configPath, warnings, {
      command: 'gemini', args: ['-p'], kind: 'cli',
    });
    return { ...emptyScanResult(harness), memories, mcpServers, sessions, envKeys, usage };
  },
};
