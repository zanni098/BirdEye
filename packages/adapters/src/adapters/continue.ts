import { join } from 'node:path';
import {
  parseMemoryMarkdown,
  type AgentRecord, type EnvKeyRecord, type McpServerRecord, type MemoryRecord, type ScanResult, type SessionRecord,
} from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness, unknownUsage } from '../adapter.ts';
import { fileMtime, listFiles, safeReadJson, safeReadText } from '../fs-utils.ts';

const KIND = 'continue' as const;
const ENV_REF_RE = /^\$\{?([A-Z0-9_]+)\}?$/;

interface ContinueMcpEntry { name?: string; command?: string; args?: string[]; url?: string; }
interface ContinueConfig {
  models?: { title?: string; model?: string; provider?: string; apiKey?: string }[];
  mcpServers?: ContinueMcpEntry[];
  experimental?: { modelContextProtocolServers?: { transport?: { type?: string; command?: string; args?: string[]; url?: string } }[] };
}

export const continueAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Continue',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.continue')];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings: string[] = [];
    const configFile = join(configPath, 'config.json');
    const config = safeReadJson<ContinueConfig>(configFile);
    if (!config && safeReadText(join(configPath, 'config.yaml')) !== null) {
      warnings.push('config.yaml present but not parsed (JSON config only in v1)');
    }

    const mcpServers: McpServerRecord[] = [];
    for (const entry of config?.mcpServers ?? []) {
      mcpServers.push({
        harness: KIND, name: entry.name ?? entry.command ?? 'mcp',
        transport: entry.url ? 'http' : entry.command ? 'stdio' : 'unknown',
        command: entry.command ? [entry.command, ...(entry.args ?? [])].join(' ') : entry.url ?? null,
      });
    }
    for (const entry of config?.experimental?.modelContextProtocolServers ?? []) {
      const transport = entry.transport;
      mcpServers.push({
        harness: KIND, name: transport?.command ?? transport?.url ?? 'mcp',
        transport: transport?.type === 'sse' ? 'sse' : transport?.url ? 'http' : transport?.command ? 'stdio' : 'unknown',
        command: transport?.command ? [transport.command, ...(transport.args ?? [])].join(' ') : transport?.url ?? null,
      });
    }

    const agents: AgentRecord[] = (config?.models ?? []).map((model) => ({
      harness: KIND,
      name: model.title ?? model.model ?? 'model',
      description: model.provider ? `model: ${model.provider}` : 'model',
    }));

    const envKeys: EnvKeyRecord[] = [];
    for (const model of config?.models ?? []) {
      const match = model.apiKey?.match(ENV_REF_RE);
      if (match) envKeys.push({ harness: KIND, key: match[1] as string, sourceFile: configFile });
      else if (model.apiKey) warnings.push(`model "${model.title ?? model.model}" has a literal apiKey in config.json — move it to an env var`);
    }

    const memories: MemoryRecord[] = [];
    const pushRule = (filePath: string): void => {
      const text = safeReadText(filePath);
      if (text === null) return;
      const record = parseMemoryMarkdown(text, { harness: KIND, file: filePath, mtime: fileMtime(filePath) });
      if (record) memories.push(record);
    };
    pushRule(join(configPath, '.continuerules'));
    for (const file of listFiles(join(configPath, 'rules'), '.md')) pushRule(join(configPath, 'rules', file));

    const sessionsIndex = safeReadJson<{ sessionId?: string; title?: string; dateCreated?: string }[]>(
      join(configPath, 'sessions', 'sessions.json'),
    );
    const sessions: SessionRecord[] = (sessionsIndex ?? []).map((entry, index) => ({
      harness: KIND,
      id: entry.sessionId ?? `session-${index}`,
      title: entry.title ?? `Continue session ${index}`,
      startedAt: entry.dateCreated ?? null,
      lastActiveAt: entry.dateCreated ?? null,
      messageCount: null, project: null,
    }));

    const usage = sessions.length > 0
      ? { harness: KIND, period: 'all-time' as const, inputTokens: null, outputTokens: null, costUsd: null, sessions: sessions.length, source: 'logged' as const }
      : unknownUsage(KIND);

    const harness = makeHarness(KIND, 'Continue', configPath, warnings, { kind: 'manual' });
    return { ...emptyScanResult(harness), mcpServers, agents, envKeys, memories, sessions, usage };
  },
};
