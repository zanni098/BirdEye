import { basename, join } from 'node:path';
import {
  parseMemoryMarkdown,
  type McpServerRecord, type MemoryRecord, type ScanResult, type SessionRecord,
  type SkillRecord, type PluginRecord, type AgentRecord, type EnvKeyRecord,
} from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness } from '../adapter.ts';
import {
  countLines, dirExists, fileBirthtime, fileMtime, listDirs, listFiles,
  safeReadJson, safeReadText,
} from '../fs-utils.ts';

const KIND = 'claude-code' as const;
const MAX_SESSIONS = 500;

interface SettingsJson {
  mcpServers?: Record<string, { command?: string; url?: string; type?: string }>;
  env?: Record<string, unknown>;
}

function frontmatterField(md: string, field: string): string | null {
  const m = md.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? (m[1] as string).trim() : null;
}

function mcpTransport(server: { command?: string; url?: string; type?: string }): McpServerRecord['transport'] {
  if (server.type === 'sse') return 'sse';
  if (server.url) return 'http';
  if (server.command) return 'stdio';
  return 'unknown';
}

function scanSessions(configPath: string, warnings: string[]): SessionRecord[] {
  const projectsDir = join(configPath, 'projects');
  const sessions: SessionRecord[] = [];
  for (const projectSlug of listDirs(projectsDir)) {
    const projectDir = join(projectsDir, projectSlug);
    for (const file of listFiles(projectDir, '.jsonl')) {
      if (sessions.length >= MAX_SESSIONS) {
        warnings.push(`session list capped at ${MAX_SESSIONS}`);
        return sessions;
      }
      const filePath = join(projectDir, file);
      sessions.push({
        harness: KIND,
        id: basename(file, '.jsonl'),
        title: `${projectSlug.replace(/^C--/, '').replace(/-/g, '/')} session`,
        startedAt: fileBirthtime(filePath)?.toISOString() ?? null,
        lastActiveAt: fileMtime(filePath)?.toISOString() ?? null,
        messageCount: countLines(filePath),
        project: projectSlug,
      });
    }
  }
  return sessions;
}

function scanMemories(configPath: string): MemoryRecord[] {
  const memories: MemoryRecord[] = [];
  const push = (filePath: string): void => {
    const text = safeReadText(filePath);
    if (text === null) return;
    const record = parseMemoryMarkdown(text, { harness: KIND, file: filePath, mtime: fileMtime(filePath) });
    if (record) memories.push(record);
  };
  const projectsDir = join(configPath, 'projects');
  for (const projectSlug of listDirs(projectsDir)) {
    const memoryDir = join(projectsDir, projectSlug, 'memory');
    for (const file of listFiles(memoryDir, '.md')) push(join(memoryDir, file));
  }
  push(join(configPath, 'CLAUDE.md'));
  return memories;
}

function scanSkills(configPath: string): SkillRecord[] {
  const skillsDir = join(configPath, 'skills');
  const skills: SkillRecord[] = [];
  for (const name of listDirs(skillsDir)) {
    const skillFile = join(skillsDir, name, 'SKILL.md');
    const text = safeReadText(skillFile);
    if (text === null) continue;
    skills.push({
      harness: KIND, name,
      description: frontmatterField(text, 'description') ?? '',
      path: skillFile,
    });
  }
  return skills;
}

function scanPlugins(configPath: string): PluginRecord[] {
  const plugins: PluginRecord[] = [];
  const cacheDir = join(configPath, 'plugins', 'cache');
  for (const marketplace of listDirs(cacheDir)) {
    for (const plugin of listDirs(join(cacheDir, marketplace))) {
      const versions = listDirs(join(cacheDir, marketplace, plugin));
      plugins.push({
        harness: KIND,
        name: `${plugin} (${marketplace})`,
        version: versions[0] ?? null,
        enabled: true,
      });
    }
  }
  return plugins;
}

function scanAgents(configPath: string): AgentRecord[] {
  const agentsDir = join(configPath, 'agents');
  const agents: AgentRecord[] = [];
  for (const file of listFiles(agentsDir, '.md')) {
    const text = safeReadText(join(agentsDir, file)) ?? '';
    agents.push({
      harness: KIND,
      name: basename(file, '.md'),
      description: frontmatterField(text, 'description') ?? '',
    });
  }
  return agents;
}

function scanUsage(configPath: string, sessions: SessionRecord[]): ScanResult['usage'] {
  const costLog = safeReadText(join(configPath, 'cost-tracker.log'));
  let costUsd: number | null = null;
  if (costLog) {
    let total = 0;
    let found = false;
    for (const line of costLog.split('\n')) {
      try {
        const entry = JSON.parse(line) as { costUSD?: number; cost?: number };
        const value = entry.costUSD ?? entry.cost;
        if (typeof value === 'number') { total += value; found = true; }
      } catch { /* non-JSON line — skip */ }
    }
    if (found) costUsd = Math.round(total * 100) / 100;
  }
  return {
    harness: KIND, period: 'all-time',
    inputTokens: null, outputTokens: null,
    costUsd,
    sessions: sessions.length,
    source: costUsd !== null || sessions.length > 0 ? 'logged' : 'unknown',
  };
}

export const claudeCodeAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Claude Code',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.claude')];
  },

  async scan(ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];
    const sessions = scanSessions(configPath, warnings);

    const mcpServers: McpServerRecord[] = [];
    const envKeys: EnvKeyRecord[] = [];
    for (const settingsFile of [join(configPath, 'settings.json'), join(ctx.home, '.claude.json')]) {
      const settings = safeReadJson<SettingsJson>(settingsFile);
      if (!settings) continue;
      for (const [name, server] of Object.entries(settings.mcpServers ?? {})) {
        mcpServers.push({ harness: KIND, name, transport: mcpTransport(server), command: server.command ?? server.url ?? null });
      }
      for (const key of Object.keys(settings.env ?? {})) {
        envKeys.push({ harness: KIND, key, sourceFile: settingsFile });
      }
    }
    if (!dirExists(join(configPath, 'projects'))) warnings.push('no projects directory found');

    const harness = makeHarness(KIND, 'Claude Code', configPath, warnings, {
      command: 'claude', args: ['-p'], kind: 'cli',
    });
    return {
      ...emptyScanResult(harness),
      sessions,
      memories: scanMemories(configPath),
      skills: scanSkills(configPath),
      plugins: scanPlugins(configPath),
      mcpServers,
      agents: scanAgents(configPath),
      envKeys,
      usage: scanUsage(configPath, sessions),
    };
  },
};
