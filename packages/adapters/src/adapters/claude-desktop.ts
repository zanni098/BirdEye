import { join } from 'node:path';
import type { McpServerRecord, PluginRecord, ScanResult, SessionRecord } from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness } from '../adapter.ts';
import { fileBirthtime, fileMtime, listDirs, listFiles, safeReadJson } from '../fs-utils.ts';

const KIND = 'claude-desktop' as const;

interface DesktopConfig {
  mcpServers?: Record<string, { command?: string; url?: string; type?: string }>;
}

export const claudeDesktopAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Claude Desktop',

  candidatePaths(ctx: AdapterContext): string[] {
    return [
      join(ctx.home, 'AppData', 'Roaming', 'Claude'),
      join(ctx.home, 'Library', 'Application Support', 'Claude'),
      join(ctx.home, '.config', 'Claude'),
    ];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];

    const mcpServers: McpServerRecord[] = [];
    const config = safeReadJson<DesktopConfig>(join(configPath, 'claude_desktop_config.json'));
    for (const [name, server] of Object.entries(config?.mcpServers ?? {})) {
      mcpServers.push({
        harness: KIND, name,
        transport: server.type === 'sse' ? 'sse' : server.url ? 'http' : server.command ? 'stdio' : 'unknown',
        command: server.command ?? server.url ?? null,
      });
    }

    const extensionsDir = join(configPath, 'Claude Extensions');
    const plugins: PluginRecord[] = [
      ...listDirs(extensionsDir),
      ...listFiles(extensionsDir),
    ].map((name) => ({ harness: KIND, name, version: null, enabled: true }));

    const sessionsDir = join(configPath, 'claude-code-sessions');
    const sessions: SessionRecord[] = [...listDirs(sessionsDir), ...listFiles(sessionsDir)].map((name) => {
      const entryPath = join(sessionsDir, name);
      return {
        harness: KIND, id: name, title: `Claude Desktop session ${name}`,
        startedAt: fileBirthtime(entryPath)?.toISOString() ?? null,
        lastActiveAt: fileMtime(entryPath)?.toISOString() ?? null,
        messageCount: null, project: null,
      };
    });

    warnings.push('chat history is app-internal; sessions shown are Claude Code bridge sessions only');
    const harness = makeHarness(KIND, 'Claude Desktop', configPath, warnings, { kind: 'manual' });
    return { ...emptyScanResult(harness), sessions, plugins, mcpServers };
  },
};
