export type HarnessKind =
  | 'claude-code' | 'claude-desktop' | 'codex' | 'opencode' | 'openclaw'
  | 'zcode' | 'gemini' | 'cursor' | 'continue' | 'generic';

export interface Harness {
  id: HarnessKind;
  name: string;
  configPath: string;
  detected: boolean;
  health: 'ok' | 'warnings' | 'error' | 'not-found';
  warnings: string[];
  lastScanAt: string;
  dispatch?: { command: string; args: string[]; kind: 'cli' } | { kind: 'manual' };
}

export interface SessionRecord {
  harness: HarnessKind; id: string; title: string;
  startedAt: string | null; lastActiveAt: string | null;
  messageCount: number | null; project: string | null;
}

export type MemoryType = 'user' | 'project' | 'feedback' | 'reference' | 'instruction' | 'note';

export interface MemoryRecord {
  id: string;
  title: string; body: string; type: MemoryType;
  sourceHarness: HarnessKind; sourceFile: string;
  createdAt: string | null; tags: string[]; links: string[];
  contentHash: string;
}

export interface SkillRecord  { harness: HarnessKind; name: string; description: string; path: string; }
export interface PluginRecord { harness: HarnessKind; name: string; version: string | null; enabled: boolean; }
export interface McpServerRecord {
  harness: HarnessKind; name: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown'; command: string | null;
}
export interface AgentRecord  { harness: HarnessKind; name: string; description: string; }
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
