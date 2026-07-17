import { basename, join } from 'node:path';
import {
  parseMemoryMarkdown,
  type EnvKeyRecord, type McpServerRecord, type ScanResult, type SessionRecord, type SkillRecord,
} from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness, unknownUsage } from '../adapter.ts';
import { fileBirthtime, fileMtime, listDirs, listFiles, safeReadJson, safeReadText } from '../fs-utils.ts';

const KIND = 'opencode' as const;
const MAX_SESSIONS = 500;
const ENV_PLACEHOLDER_RE = /\{env:([A-Z0-9_]+)\}/g;

interface OpencodeConfig {
  mcp?: Record<string, { type?: string; command?: string[] | string; url?: string }>;
  plugin?: string[];
  plugins?: string[];
}

function frontmatterField(md: string, field: string): string | null {
  const m = md.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? (m[1] as string).trim() : null;
}

/** ~/.local/share/opencode/project/<slug>/storage/session/info/ses_*.json */
function scanSessions(home: string): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  const projectRoot = join(home, '.local', 'share', 'opencode', 'project');
  for (const projectSlug of listDirs(projectRoot)) {
    const infoDir = join(projectRoot, projectSlug, 'storage', 'session', 'info');
    for (const file of listFiles(infoDir, '.json')) {
      if (sessions.length >= MAX_SESSIONS) return sessions;
      const filePath = join(infoDir, file);
      const info = safeReadJson<{ id?: string; title?: string }>(filePath);
      sessions.push({
        harness: KIND,
        id: info?.id ?? basename(file, '.json'),
        title: info?.title ?? `opencode session ${basename(file, '.json')}`,
        startedAt: fileBirthtime(filePath)?.toISOString() ?? null,
        lastActiveAt: fileMtime(filePath)?.toISOString() ?? null,
        messageCount: null,
        project: projectSlug,
      });
    }
  }
  return sessions;
}

export const opencodeAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'opencode',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.config', 'opencode'), join(ctx.home, '.opencode')];
  },

  async scan(ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];

    const configFile = ['opencode.jsonc', 'opencode.json']
      .map((name) => join(configPath, name))
      .find((filePath) => safeReadText(filePath) !== null);
    const config = configFile ? safeReadJson<OpencodeConfig>(configFile) : null;
    const rawConfigText = configFile ? safeReadText(configFile) ?? '' : '';

    const mcpServers: McpServerRecord[] = Object.entries(config?.mcp ?? {}).map(([name, server]) => {
      const command = Array.isArray(server.command) ? server.command.join(' ') : server.command ?? null;
      return {
        harness: KIND, name,
        transport: server.type === 'remote' || server.url ? 'http' as const : command ? 'stdio' as const : 'unknown' as const,
        command: command ?? server.url ?? null,
      };
    });

    const plugins = [...(config?.plugin ?? []), ...(config?.plugins ?? [])].map((name) => ({
      harness: KIND, name, version: null, enabled: true,
    }));

    const envKeys: EnvKeyRecord[] = [];
    if (configFile) {
      const seen = new Set<string>();
      for (const match of rawConfigText.matchAll(ENV_PLACEHOLDER_RE)) {
        const key = match[1] as string;
        if (seen.has(key)) continue;
        seen.add(key);
        envKeys.push({ harness: KIND, key, sourceFile: configFile });
      }
    }

    const skills: SkillRecord[] = [];
    for (const name of listDirs(join(configPath, 'skills'))) {
      const skillFile = join(configPath, 'skills', name, 'SKILL.md');
      const text = safeReadText(skillFile);
      if (text === null) continue;
      skills.push({ harness: KIND, name, description: frontmatterField(text, 'description') ?? '', path: skillFile });
    }

    const memories = [];
    const agentsFile = join(configPath, 'AGENTS.md');
    const agentsMd = safeReadText(agentsFile);
    if (agentsMd) {
      const record = parseMemoryMarkdown(agentsMd, { harness: KIND, file: agentsFile, mtime: fileMtime(agentsFile) });
      if (record) memories.push(record);
    }

    const sessions = scanSessions(ctx.home);
    const usage = sessions.length > 0
      ? { harness: KIND, period: 'all-time' as const, inputTokens: null, outputTokens: null, costUsd: null, sessions: sessions.length, source: 'logged' as const }
      : unknownUsage(KIND);

    const harness = makeHarness(KIND, 'opencode', configPath, warnings, {
      command: 'opencode', args: ['run'], kind: 'cli',
    });
    return { ...emptyScanResult(harness), sessions, memories, skills, plugins, mcpServers, envKeys, usage };
  },
};
