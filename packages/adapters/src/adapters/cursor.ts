import { join } from 'node:path';
import { parseMemoryMarkdown, type McpServerRecord, type MemoryRecord, type PluginRecord, type ScanResult } from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness } from '../adapter.ts';
import { fileMtime, listDirs, listFiles, safeReadJson, safeReadText } from '../fs-utils.ts';

const KIND = 'cursor' as const;
const VERSION_SUFFIX_RE = /-(\d+\.\d+\.\d+)$/;

interface CursorMcpConfig {
  mcpServers?: Record<string, { command?: string; url?: string; type?: string }>;
}

export const cursorAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Cursor',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.cursor')];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings = ['cursor adapter is shallow (chat data is app-internal)'];

    const config = safeReadJson<CursorMcpConfig>(join(configPath, 'mcp.json'));
    const mcpServers: McpServerRecord[] = Object.entries(config?.mcpServers ?? {}).map(([name, server]) => ({
      harness: KIND, name,
      transport: server.type === 'sse' ? 'sse' : server.url ? 'http' : server.command ? 'stdio' : 'unknown',
      command: server.command ?? server.url ?? null,
    }));

    const plugins: PluginRecord[] = listDirs(join(configPath, 'extensions')).map((dirName) => {
      const versionMatch = dirName.match(VERSION_SUFFIX_RE);
      return {
        harness: KIND,
        name: versionMatch ? dirName.slice(0, -(versionMatch[0].length)) : dirName,
        version: versionMatch ? (versionMatch[1] as string) : null,
        enabled: true,
      };
    });

    const memories: MemoryRecord[] = [];
    const pushRule = (filePath: string): void => {
      const text = safeReadText(filePath);
      if (text === null) return;
      const record = parseMemoryMarkdown(text, { harness: KIND, file: filePath, mtime: fileMtime(filePath) });
      if (record) memories.push(record);
    };
    for (const file of listFiles(configPath)) {
      if (/\.(md|mdc)$/.test(file)) pushRule(join(configPath, file));
    }
    for (const file of listFiles(join(configPath, 'rules'))) {
      if (/\.(md|mdc)$/.test(file)) pushRule(join(configPath, 'rules', file));
    }

    const harness = makeHarness(KIND, 'Cursor', configPath, warnings, { kind: 'manual' });
    return { ...emptyScanResult(harness), mcpServers, plugins, memories };
  },
};
