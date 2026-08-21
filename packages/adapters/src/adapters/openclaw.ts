import { basename, join } from 'node:path';
import {
  frontmatterField, parseMemoryMarkdown,
  type AgentRecord, type EnvKeyRecord, type MemoryRecord, type ScanResult, type SessionRecord, type SkillRecord,
} from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness } from '../adapter.ts';
import { dirExists, fileBirthtime, fileMtime, listDirs, listFiles, safeReadText } from '../fs-utils.ts';

const KIND = 'openclaw' as const;
const MAX_SESSIONS = 500;

function scanMemories(configPath: string): MemoryRecord[] {
  const memories: MemoryRecord[] = [];
  const memoryDir = join(configPath, 'memory');
  const push = (filePath: string): void => {
    const text = safeReadText(filePath);
    if (text === null) return;
    const record = parseMemoryMarkdown(text, { harness: KIND, file: filePath, mtime: fileMtime(filePath) });
    if (record) memories.push(record);
  };
  for (const file of listFiles(memoryDir, '.md')) push(join(memoryDir, file));
  for (const sub of listDirs(memoryDir)) {
    for (const file of listFiles(join(memoryDir, sub), '.md')) push(join(memoryDir, sub, file));
  }
  return memories;
}

function scanAgents(configPath: string): { agents: AgentRecord[]; sessions: SessionRecord[] } {
  const agents: AgentRecord[] = [];
  const sessions: SessionRecord[] = [];
  const agentsDir = join(configPath, 'agents');
  for (const name of listDirs(agentsDir)) {
    const agentMd = safeReadText(join(agentsDir, name, 'agent.md'));
    agents.push({
      harness: KIND, name,
      description: agentMd ? frontmatterField(agentMd, 'description') ?? '' : '',
    });
    const sessionsDir = join(agentsDir, name, 'sessions');
    for (const file of listFiles(sessionsDir, '.jsonl')) {
      if (sessions.length >= MAX_SESSIONS) break;
      const filePath = join(sessionsDir, file);
      sessions.push({
        harness: KIND, id: basename(file, '.jsonl'), title: `OpenClaw ${name} session`,
        startedAt: fileBirthtime(filePath)?.toISOString() ?? null,
        lastActiveAt: fileMtime(filePath)?.toISOString() ?? null,
        messageCount: null, project: name,
      });
    }
  }
  for (const file of listFiles(agentsDir, '.md')) {
    const text = safeReadText(join(agentsDir, file)) ?? '';
    agents.push({ harness: KIND, name: basename(file, '.md'), description: frontmatterField(text, 'description') ?? '' });
  }
  return { agents, sessions };
}

export const openclawAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'OpenClaw',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.openclaw')];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];
    const { agents, sessions } = scanAgents(configPath);

    const plugins = listDirs(join(configPath, 'extensions')).map((name) => ({
      harness: KIND, name, version: null, enabled: true,
    }));

    // Credential FILE NAMES only — contents are never opened.
    const credentialsDir = join(configPath, 'credentials');
    const envKeys: EnvKeyRecord[] = [...listFiles(credentialsDir), ...listDirs(credentialsDir)].map((name) => ({
      harness: KIND, key: name.replace(/\.[^.]+$/, ''), sourceFile: credentialsDir,
    }));

    const flowsDir = join(configPath, 'flows');
    const skills: SkillRecord[] = [...listDirs(flowsDir), ...listFiles(flowsDir)].map((name) => ({
      harness: KIND, name: name.replace(/\.[^.]+$/, ''), description: 'OpenClaw flow', path: join(flowsDir, name),
    }));

    if (!dirExists(join(configPath, 'memory'))) warnings.push('no memory directory found');
    const harness = makeHarness(KIND, 'OpenClaw', configPath, warnings, { kind: 'manual' });
    return {
      ...emptyScanResult(harness),
      sessions, agents, plugins, envKeys, skills,
      memories: scanMemories(configPath),
    };
  },
};
