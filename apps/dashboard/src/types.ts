/* Frontend mirror of @birdeye/core types (core imports node builtins, so it can't be bundled). */

export type HarnessKind =
  | 'claude-code' | 'claude-desktop' | 'codex' | 'opencode' | 'openclaw'
  | 'zcode' | 'gemini' | 'cursor' | 'continue' | 'generic';

export interface Harness {
  id: HarnessKind; name: string; configPath: string;
  detected: boolean; health: 'ok' | 'warnings' | 'error' | 'not-found';
  warnings: string[]; lastScanAt: string;
  dispatch?: { command: string; args: string[]; kind: 'cli' } | { kind: 'manual' };
}

export interface SessionRecord {
  harness: HarnessKind; id: string; title: string;
  startedAt: string | null; lastActiveAt: string | null;
  messageCount: number | null; project: string | null;
}

export interface MemoryRecord {
  id: string; title: string; body: string;
  type: 'user' | 'project' | 'feedback' | 'reference' | 'instruction' | 'note';
  sourceHarness: HarnessKind; sourceFile: string; createdAt: string | null;
  tags: string[]; links: string[]; contentHash: string;
}

export interface SkillRecord { harness: HarnessKind; name: string; description: string; path: string; }
export interface PluginRecord { harness: HarnessKind; name: string; version: string | null; enabled: boolean; }
export interface McpServerRecord { harness: HarnessKind; name: string; transport: string; command: string | null; }
export interface AgentRecord { harness: HarnessKind; name: string; description: string; }
export interface EnvKeyRecord { harness: HarnessKind; key: string; sourceFile: string; }

export interface UsageRecord {
  harness: HarnessKind; period: 'all-time';
  inputTokens: number | null; outputTokens: number | null; costUsd: number | null;
  sessions: number | null; source: 'logged' | 'estimated' | 'unknown';
}

export interface TaskRun {
  id: string; startedAt: string; endedAt: string | null;
  status: 'running' | 'succeeded' | 'failed'; exitCode: number | null; output: string;
}
export interface TaskRecord {
  id: string; title: string; briefing: string;
  status: 'todo' | 'claimed' | 'running' | 'done' | 'failed';
  assignedHarness: HarnessKind | null; createdAt: string; updatedAt: string; runs: TaskRun[];
}

export interface ScanResult {
  harness: Harness;
  sessions: SessionRecord[]; memories: MemoryRecord[]; skills: SkillRecord[];
  plugins: PluginRecord[]; mcpServers: McpServerRecord[]; agents: AgentRecord[];
  envKeys: EnvKeyRecord[]; usage: UsageRecord;
}

export interface GraphNode {
  id: string; kind: 'memory' | 'entity' | 'tag' | 'harness';
  label: string; harness?: HarnessKind; weight: number; memoryId?: string;
}
export interface GraphEdge { source: string; target: string; kind: 'link' | 'mentions' | 'topic' | 'source'; }
export interface MemoryGraph { nodes: GraphNode[]; edges: GraphEdge[]; }

export interface Overview {
  harnesses: Harness[];
  totals: {
    harnessesDetected: number; sessions: number; memories: number; skills: number;
    plugins: number; mcpServers: number; agents: number; envKeys: number; costUsd: number;
  };
}

export const HARNESS_COLOR: Record<HarnessKind, string> = {
  'claude-code': 'var(--h-claude-code)',
  'claude-desktop': 'var(--h-claude-desktop)',
  codex: 'var(--h-codex)',
  opencode: 'var(--h-opencode)',
  openclaw: 'var(--h-openclaw)',
  zcode: 'var(--h-zcode)',
  gemini: 'var(--h-gemini)',
  cursor: 'var(--h-cursor)',
  continue: 'var(--h-continue)',
  generic: 'var(--h-generic)',
};

/** Raw hex values for canvas drawing (CSS vars don't resolve in canvas). */
export const HARNESS_HEX: Record<HarnessKind, string> = {
  'claude-code': '#f5a524',
  'claude-desktop': '#ef8354',
  codex: '#5aa9e6',
  opencode: '#35d0ba',
  openclaw: '#f26d6d',
  zcode: '#a06be0',
  gemini: '#55c1e8',
  cursor: '#7fd069',
  continue: '#ef7fa9',
  generic: '#8a97a8',
};
