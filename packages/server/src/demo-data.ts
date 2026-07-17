import { contentHashOf } from '@birdeye/core';
import type {
  Harness, HarnessKind, MemoryRecord, MemoryType, ScanResult, SessionRecord, TaskRecord, UsageRecord,
} from '@birdeye/core';

/** Stable demo clock so screenshots and tests are reproducible. */
const BASE = Date.UTC(2026, 6, 17, 12, 0, 0);

function iso(daysAgo: number, hour = 9): string {
  return new Date(BASE - daysAgo * 86_400_000 + hour * 3_600_000 - 9 * 3_600_000).toISOString();
}

function memory(
  sourceHarness: HarnessKind, type: MemoryType, title: string, body: string,
  daysAgo: number, tags: string[] = [], links: string[] = [],
): MemoryRecord {
  const hash = contentHashOf(body);
  return {
    id: `${sourceHarness}:${hash.slice(0, 12)}`,
    title, body, type, sourceHarness,
    sourceFile: `demo://${sourceHarness}/${title.toLowerCase().replace(/\s+/g, '-')}.md`,
    createdAt: iso(daysAgo), tags, links, contentHash: hash,
  };
}

function sessions(harness: HarnessKind, specs: [string, string, number, number | null][]): SessionRecord[] {
  return specs.map(([id, title, daysAgo, messageCount]) => ({
    harness, id, title,
    startedAt: iso(daysAgo, 9), lastActiveAt: iso(daysAgo, 18),
    messageCount, project: null,
  }));
}

function usage(harness: HarnessKind, partial?: Partial<UsageRecord>): UsageRecord {
  return {
    harness, period: 'all-time',
    inputTokens: null, outputTokens: null, costUsd: null, sessions: null,
    source: 'unknown', ...partial,
  };
}

function harness(
  id: HarnessKind, name: string, configPath: string,
  health: Harness['health'], warnings: string[], dispatch?: Harness['dispatch'],
): Harness {
  return { id, name, configPath, detected: health !== 'not-found', health, warnings, lastScanAt: iso(0, 11), dispatch };
}

const MEMORIES: MemoryRecord[] = [
  memory('claude-code', 'user', 'Prefers dark, dense UIs', 'Likes dark themes with high information density. The Aurora Design System dark palette is the reference.', 21, ['ui']),
  memory('claude-code', 'user', 'Name and handle', 'Goes by Ash. Handle @ashbuilds on GitHub and X.', 40),
  memory('claude-code', 'project', 'Project Nebula', 'Project Nebula is the API platform launching in August: multi-tenant, usage-billed, built on the Aurora Design System for its console. Billing flows through the Stripe migration.', 14, ['api', 'launch'], ['aurora-design-system', 'stripe-billing-migration']),
  memory('claude-code', 'project', 'Aurora Design System', 'Aurora Design System: tokens, dark-first component set, powers the Project Nebula console and the marketing site.', 30, ['ui', 'design']),
  memory('claude-code', 'feedback', 'Always run tests before pushing', 'Broke staging twice by skipping the suite. Tests first, push second — no exceptions.', 12, ['workflow']),
  memory('claude-code', 'reference', 'Staging dashboard URL', 'Staging Grafana lives at staging-metrics.internal:3000, login via SSO.', 9, ['infra']),
  memory('claude-code', 'note', 'Incident postmortem 2026-07-08', 'Deploy went out with a red suite. Root cause: manual push. See [[always-run-tests-before-pushing]].', 9, ['infra'], ['always-run-tests-before-pushing']),
  memory('claude-desktop', 'note', 'Meeting notes: launch review', 'Launch review for Project Nebula: pricing page needs the Aurora Design System header; billing copy pending.', 6, ['launch'], ['project-nebula']),
  memory('claude-desktop', 'note', 'Desktop extensions wishlist', 'Want a desktop extension for quick memory capture and one for screenshot-to-issue.', 17, ['mcp']),
  memory('codex', 'instruction', 'Codex house rules', 'Be brief. Prefer diffs over prose. Never touch generated files.', 33, ['workflow']),
  memory('codex', 'project', 'Stripe Billing Migration', 'Moving Project Nebula billing from homegrown invoices to Stripe metered billing. Cutover target: end of July.', 11, ['billing'], ['project-nebula']),
  memory('codex', 'note', 'Perf: N+1 in invoices', 'Invoice list does one query per line item. Batch it before the Stripe cutover. See [[stripe-billing-migration]].', 8, ['perf'], ['stripe-billing-migration']),
  memory('codex', 'note', 'Release checklist', 'Tag, changelog, canary 10%, then full. Applies to [[project-nebula]] services.', 5, ['launch'], ['project-nebula']),
  memory('opencode', 'project', 'CLI Refactor', 'Splitting the monolith CLI into subcommand packages; opencode drives the mechanical edits.', 13, ['cli']),
  memory('opencode', 'feedback', 'Small diffs win', 'Review throughput doubled when PRs stayed under 300 lines. Keep diffs small.', 19, ['workflow']),
  memory('opencode', 'note', 'Bench results: local runners', 'Local eval runners: 42s median on the M-class laptop, 71s in CI. Cache the model weights.', 4, ['perf']),
  memory('openclaw', 'user', 'Timezone and schedule', 'Works PKT, deep-work mornings. Avoid scheduling agent runs 09:00-12:00 PKT.', 26),
  memory('openclaw', 'project', 'Support Bot Flows', 'OpenClaw flows answer tier-1 support using the Project Nebula API sandbox.', 10, ['agents'], ['project-nebula']),
  memory('openclaw', 'feedback', 'Confirm before deploying', 'Agent once deployed a flow mid-demo. Always confirm before any deploy action.', 16, ['workflow', 'agents']),
  memory('zcode', 'note', 'Zcode experiments', 'Using Zcode for skill-graph experiments; promising for repo-wide codemods.', 7, ['agents']),
  memory('gemini', 'instruction', 'Gemini research rules', 'Cite sources with links. Prefer primary docs. Flag anything older than 12 months.', 28, ['research']),
  memory('gemini', 'reference', 'Paper stash', 'Reading list for retrieval + memory papers lives in the shared Zotero folder "agent-memory".', 22, ['research']),
  memory('gemini', 'note', 'Competitive scan: agent hubs', 'Surveyed agent-hub tools; none unify memory across harnesses — the gap BirdEye fills.', 3, ['research']),
  memory('cursor', 'instruction', 'TypeScript style rules', 'Strict mode always. No enums. Named exports only. Aurora Design System tokens for all colors.', 24, ['ts', 'ui']),
  memory('continue', 'instruction', 'Continue rules', 'Review everything before apply. Never auto-commit.', 27, ['workflow']),
  memory('continue', 'note', 'Model roster', 'Sonnet for coding, Haiku for triage, local Qwen for offline experiments.', 15, ['models']),
];

const RESULTS: ScanResult[] = [
  {
    harness: harness('claude-code', 'Claude Code', '~/.claude', 'ok', [], { command: 'claude', args: ['-p'], kind: 'cli' }),
    sessions: sessions('claude-code', [
      ['s-101', 'nebula-api: rate limiter', 1, 84], ['s-102', 'aurora: dark tokens pass', 1, 52],
      ['s-103', 'billing cutover plan', 2, 129], ['s-104', 'fix flaky e2e', 3, 41],
      ['s-105', 'console: usage charts', 4, 77], ['s-106', 'infra: canary deploys', 6, 63],
      ['s-107', 'postmortem writeup', 9, 25], ['s-108', 'sdk codegen', 12, 96],
    ]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'claude-code'),
    skills: [
      { harness: 'claude-code', name: 'frontend-design', description: 'Distinctive production UI', path: '~/.claude/skills/frontend-design' },
      { harness: 'claude-code', name: 'tdd-workflow', description: 'Tests-first development loop', path: '~/.claude/skills/tdd-workflow' },
      { harness: 'claude-code', name: 'release-train', description: 'Tag, changelog, canary, ship', path: '~/.claude/skills/release-train' },
    ],
    plugins: [
      { harness: 'claude-code', name: 'design-pack (official)', version: '1.4.0', enabled: true },
      { harness: 'claude-code', name: 'ecc (ecc)', version: '5.1.0', enabled: true },
    ],
    mcpServers: [
      { harness: 'claude-code', name: 'github', transport: 'stdio', command: 'npx mcp-github' },
      { harness: 'claude-code', name: 'supabase', transport: 'http', command: 'https://mcp.supabase.com' },
      { harness: 'claude-code', name: 'playwright', transport: 'stdio', command: 'npx playwright-mcp' },
      { harness: 'claude-code', name: 'birdeye', transport: 'stdio', command: 'node birdeye-mcp' },
    ],
    agents: [
      { harness: 'claude-code', name: 'code-reviewer', description: 'Reviews diffs for correctness' },
      { harness: 'claude-code', name: 'security-reviewer', description: 'OWASP-focused review' },
    ],
    envKeys: [
      { harness: 'claude-code', key: 'ANTHROPIC_API_KEY', sourceFile: '~/.claude/settings.json' },
      { harness: 'claude-code', key: 'GITHUB_TOKEN', sourceFile: '~/.claude/settings.json' },
    ],
    usage: usage('claude-code', { inputTokens: 4_210_000, outputTokens: 892_000, costUsd: 61.4, sessions: 8, source: 'logged' }),
  },
  {
    harness: harness('claude-desktop', 'Claude Desktop', '~/AppData/Roaming/Claude', 'warnings', ['chat history is app-internal'], { kind: 'manual' }),
    sessions: sessions('claude-desktop', [['d-1', 'Launch review chat', 6, null], ['d-2', 'Copy pass on pricing', 8, null]]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'claude-desktop'),
    skills: [],
    plugins: [
      { harness: 'claude-desktop', name: 'browser-tools', version: null, enabled: true },
      { harness: 'claude-desktop', name: 'imessage.mcpb', version: null, enabled: true },
    ],
    mcpServers: [
      { harness: 'claude-desktop', name: 'filesystem', transport: 'stdio', command: 'npx mcp-fs' },
      { harness: 'claude-desktop', name: 'notion', transport: 'sse', command: 'https://mcp.notion.so' },
    ],
    agents: [], envKeys: [],
    usage: usage('claude-desktop'),
  },
  {
    harness: harness('codex', 'Codex', '~/.codex', 'ok', [], { command: 'codex', args: ['exec'], kind: 'cli' }),
    sessions: sessions('codex', [
      ['c-11', 'invoice batching', 2, 61], ['c-12', 'stripe webhooks', 3, 48],
      ['c-13', 'metered usage events', 5, 83], ['c-14', 'migration dry-run', 8, 37],
    ]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'codex'),
    skills: [],
    plugins: [],
    mcpServers: [{ harness: 'codex', name: 'github', transport: 'stdio', command: 'npx -y mcp-github' }],
    agents: [],
    envKeys: [{ harness: 'codex', key: 'OPENAI_API_KEY', sourceFile: '~/.codex/auth.json' }],
    usage: usage('codex', { inputTokens: 2_930_000, outputTokens: 512_000, costUsd: 38.2, sessions: 4, source: 'logged' }),
  },
  {
    harness: harness('opencode', 'opencode', '~/.config/opencode', 'ok', [], { command: 'opencode', args: ['run'], kind: 'cli' }),
    sessions: sessions('opencode', [
      ['o-1', 'split subcommands', 4, 29], ['o-2', 'runner cache', 4, 33], ['o-3', 'flag parser port', 13, 51],
    ]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'opencode'),
    skills: [{ harness: 'opencode', name: 'codemod', description: 'Repo-wide mechanical edits', path: '~/.config/opencode/skills/codemod' }],
    plugins: [{ harness: 'opencode', name: 'notify', version: null, enabled: true }],
    mcpServers: [{ harness: 'opencode', name: 'playwright', transport: 'stdio', command: 'npx playwright-mcp' }],
    agents: [],
    envKeys: [{ harness: 'opencode', key: 'OPENROUTER_API_KEY', sourceFile: '~/.config/opencode/opencode.jsonc' }],
    usage: usage('opencode', { sessions: 3, source: 'logged' }),
  },
  {
    harness: harness('openclaw', 'OpenClaw', '~/.openclaw', 'ok', [], { kind: 'manual' }),
    sessions: sessions('openclaw', [['w-1', 'support flow tuning', 5, null], ['w-2', 'sandbox smoke', 10, null]]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'openclaw'),
    skills: [
      { harness: 'openclaw', name: 'daily-report', description: 'OpenClaw flow', path: '~/.openclaw/flows/daily-report' },
      { harness: 'openclaw', name: 'ticket-triage', description: 'OpenClaw flow', path: '~/.openclaw/flows/ticket-triage' },
    ],
    plugins: [{ harness: 'openclaw', name: 'webhooks', version: null, enabled: true }],
    mcpServers: [],
    agents: [
      { harness: 'openclaw', name: 'main', description: 'Primary agent' },
      { harness: 'openclaw', name: 'support-bot', description: 'Tier-1 support answers' },
    ],
    envKeys: [{ harness: 'openclaw', key: 'github-token', sourceFile: '~/.openclaw/credentials' }],
    usage: usage('openclaw'),
  },
  {
    harness: harness('zcode', 'Zcode', '~/.zcode', 'warnings', ['zcode adapter is shallow (undocumented layout)'], { kind: 'manual' }),
    sessions: sessions('zcode', [['z-1', 'skill graph spike', 7, null]]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'zcode'),
    skills: [{ harness: 'zcode', name: 'refactor', description: 'Refactors safely', path: '~/.zcode/skills/refactor' }],
    plugins: [{ harness: 'zcode', name: 'linter', version: null, enabled: true }],
    mcpServers: [], agents: [], envKeys: [],
    usage: usage('zcode'),
  },
  {
    harness: harness('gemini', 'Gemini CLI', '~/.gemini', 'ok', [], { command: 'gemini', args: ['-p'], kind: 'cli' }),
    sessions: sessions('gemini', [
      ['g-1', 'agent-hub survey', 3, null], ['g-2', 'memory papers pass', 22, null],
    ]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'gemini'),
    skills: [],
    plugins: [],
    mcpServers: [{ harness: 'gemini', name: 'maps', transport: 'stdio', command: 'npx mcp-maps' }],
    agents: [],
    envKeys: [{ harness: 'gemini', key: 'GOOGLE_ACCOUNT', sourceFile: '~/.gemini/google_accounts.json' }],
    usage: usage('gemini', { sessions: 2, source: 'logged' }),
  },
  {
    harness: harness('cursor', 'Cursor', '~/.cursor', 'warnings', ['cursor adapter is shallow (chat data is app-internal)'], { kind: 'manual' }),
    sessions: [],
    memories: MEMORIES.filter((m) => m.sourceHarness === 'cursor'),
    skills: [],
    plugins: [{ harness: 'cursor', name: 'vendor.prettier', version: '10.4.0', enabled: true }],
    mcpServers: [{ harness: 'cursor', name: 'sentry', transport: 'http', command: 'https://mcp.sentry.io' }],
    agents: [], envKeys: [],
    usage: usage('cursor'),
  },
  {
    harness: harness('continue', 'Continue', '~/.continue', 'ok', [], { kind: 'manual' }),
    sessions: sessions('continue', [['n-1', 'Add tests', 16, null], ['n-2', 'Refactor auth', 15, null]]),
    memories: MEMORIES.filter((m) => m.sourceHarness === 'continue'),
    skills: [],
    plugins: [],
    mcpServers: [{ harness: 'continue', name: 'github', transport: 'stdio', command: 'npx mcp-github' }],
    agents: [{ harness: 'continue', name: 'Sonnet', description: 'model: anthropic' }],
    envKeys: [{ harness: 'continue', key: 'ANTHROPIC_API_KEY', sourceFile: '~/.continue/config.json' }],
    usage: usage('continue', { sessions: 2, source: 'logged' }),
  },
];

export const DEMO_SCAN: ScanResult[] = RESULTS;

export const DEMO_TASKS: TaskRecord[] = [
  {
    id: 't-demo-1', title: 'Batch invoice queries before Stripe cutover',
    briefing: 'Fix the N+1 in the invoice list (one query per line item). Add a regression test.',
    status: 'done', assignedHarness: 'codex', createdAt: iso(8), updatedAt: iso(7),
    runs: [{
      id: 'r-1', startedAt: iso(7, 10), endedAt: iso(7, 11), status: 'succeeded', exitCode: 0,
      output: '> codex exec "Fix the N+1 in the invoice list..."\n\nScanning packages/billing...\nFound invoice_lines loop at invoices.ts:214\nRewrote to a single IN() batch query\nAdded regression test: invoices.batch.test.ts\nAll 47 tests pass\nDone in 3m12s',
    }],
  },
  {
    id: 't-demo-2', title: 'Dark-mode pass on pricing page',
    briefing: 'Apply Aurora Design System dark tokens to the pricing page hero and tier cards.',
    status: 'running', assignedHarness: 'claude-code', createdAt: iso(1), updatedAt: iso(0),
    runs: [{ id: 'r-2', startedAt: iso(0, 10), endedAt: null, status: 'running', exitCode: null, output: '> claude -p "Apply Aurora dark tokens..."\n\nReading design tokens...\nEditing pricing/hero.tsx...' }],
  },
  {
    id: 't-demo-3', title: 'Survey: how do rivals sync agent memory?',
    briefing: 'Research how other multi-agent tools share memory between harnesses. Cite sources.',
    status: 'claimed', assignedHarness: 'gemini', createdAt: iso(2), updatedAt: iso(1), runs: [],
  },
  {
    id: 't-demo-4', title: 'Port flag parser to subcommand package',
    briefing: 'Move the flag parser into packages/cli-flags with tests. Keep the diff under 300 lines.',
    status: 'todo', assignedHarness: null, createdAt: iso(1), updatedAt: iso(1), runs: [],
  },
  {
    id: 't-demo-5', title: 'Support bot: add refund flow',
    briefing: 'Draft an OpenClaw flow for refund requests; require human confirm before any action.',
    status: 'todo', assignedHarness: 'openclaw', createdAt: iso(0), updatedAt: iso(0), runs: [],
  },
];
