import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { Hono } from 'hono';
import {
  BirdEyeStore, Vault, buildMemoryGraph, dedupMemories,
  type Harness, type HarnessKind, type MemoryRecord, type ScanResult, type TaskRecord,
} from '@birdeye/core';
import { DEMO_SCAN, DEMO_TASKS } from './demo-data.ts';
import { startRun } from './dispatcher.ts';

export interface AppDeps {
  store: BirdEyeStore;
  vault: Vault;
  demo: boolean;
  home: string;
  broadcast: (message: unknown) => void;
  scanFn?: (ctx: { home: string }) => Promise<ScanResult[]>;
  distDir?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.map': 'application/json', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // Demo tasks live in memory so demo mode never touches ~/.birdeye.
  const demoTasks: TaskRecord[] = deps.demo ? structuredClone(DEMO_TASKS) : [];
  const loadTasks = (): TaskRecord[] => (deps.demo ? demoTasks : deps.store.loadTasks());
  const saveTasks = (tasks: TaskRecord[]): void => {
    if (deps.demo) {
      const snapshot = [...tasks]; // `tasks` may BE demoTasks — snapshot before clearing
      demoTasks.length = 0;
      demoTasks.push(...snapshot);
    } else {
      deps.store.saveTasks(tasks);
    }
  };
  const getScan = (): ScanResult[] => (deps.demo ? DEMO_SCAN : deps.store.loadScan() ?? []);
  const getMemories = (): MemoryRecord[] =>
    deps.demo
      ? dedupMemories(DEMO_SCAN.flatMap((result) => result.memories))
      : deps.store.canonicalMemories();

  app.get('/api/overview', (c) => {
    const scan = getScan();
    const totals = {
      harnessesDetected: scan.filter((result) => result.harness.detected).length,
      sessions: scan.reduce((sum, result) => sum + result.sessions.length, 0),
      memories: getMemories().length,
      skills: scan.reduce((sum, result) => sum + result.skills.length, 0),
      plugins: scan.reduce((sum, result) => sum + result.plugins.length, 0),
      mcpServers: scan.reduce((sum, result) => sum + result.mcpServers.length, 0),
      agents: scan.reduce((sum, result) => sum + result.agents.length, 0),
      envKeys: scan.reduce((sum, result) => sum + result.envKeys.length, 0),
      costUsd: scan.reduce((sum, result) => sum + (result.usage.costUsd ?? 0), 0),
    };
    return c.json({ harnesses: scan.map((result) => result.harness), totals });
  });

  app.get('/api/scan', (c) => c.json(getScan()));

  app.post('/api/scan', async (c) => {
    if (deps.demo) return c.json(getScan());
    const scanFn = deps.scanFn;
    if (!scanFn) return c.json({ error: 'scanning unavailable' }, 500);
    const results = await scanFn({ home: deps.home });
    deps.store.saveScan(results);
    deps.broadcast({ type: 'scan-updated' });
    return c.json(results);
  });

  app.get('/api/memories', (c) => c.json(getMemories()));
  app.get('/api/graph', (c) => c.json(buildMemoryGraph(getMemories())));

  app.get('/api/tasks', (c) => c.json(loadTasks()));

  app.post('/api/tasks', async (c) => {
    const body = await c.req.json<{ title?: string; briefing?: string }>().catch(() => null);
    if (!body?.title?.trim() || !body.briefing?.trim()) {
      return c.json({ error: 'title and briefing are required' }, 400);
    }
    const task: TaskRecord = {
      id: `t-${crypto.randomUUID()}`,
      title: body.title.trim(), briefing: body.briefing.trim(),
      status: 'todo', assignedHarness: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      runs: [],
    };
    saveTasks([...loadTasks(), task]);
    deps.broadcast({ type: 'task-updated', task });
    return c.json(task, 201);
  });

  app.post('/api/tasks/:id/dispatch', async (c) => {
    const body = await c.req.json<{ harness?: HarnessKind }>().catch(() => null);
    const tasks = loadTasks();
    const task = tasks.find((candidate) => candidate.id === c.req.param('id'));
    if (!task) return c.json({ error: 'task not found' }, 404);
    const harness: Harness | undefined = getScan()
      .map((result) => result.harness)
      .find((candidate) => candidate.id === body?.harness);
    if (!harness) return c.json({ error: 'unknown harness' }, 400);
    if (harness.dispatch?.kind !== 'cli' && !deps.demo) {
      return c.json({ error: `${harness.name} has no headless CLI — copy the briefing into it manually` }, 400);
    }

    const persist = (): void => {
      task.updatedAt = new Date().toISOString();
      saveTasks(tasks);
    };
    const run = startRun(task, harness, {
      onChunk: (chunk) => {
        persist();
        deps.broadcast({ type: 'task-output', taskId: task.id, chunk });
      },
      onDone: (finishedRun) => {
        task.status = finishedRun.status === 'succeeded' ? 'done' : 'failed';
        persist();
        deps.broadcast({ type: 'task-updated', task });
      },
    }, { fake: deps.demo });

    task.runs.push(run);
    task.status = 'running';
    task.assignedHarness = harness.id;
    persist();
    deps.broadcast({ type: 'task-updated', task });
    return c.json(task);
  });

  app.get('/api/vault', (c) => c.json({ keys: deps.vault.list() }));
  app.post('/api/vault', async (c) => {
    const body = await c.req.json<{ key?: string; value?: string }>().catch(() => null);
    if (!body?.key?.trim() || typeof body.value !== 'string' || body.value === '') {
      return c.json({ error: 'key and value are required' }, 400);
    }
    deps.vault.set(body.key.trim(), body.value);
    return c.json({ ok: true, keys: deps.vault.list() });
  });
  app.delete('/api/vault/:key', (c) => {
    const removed = deps.vault.delete(c.req.param('key'));
    return c.json({ ok: removed, keys: deps.vault.list() });
  });

  // Static dashboard (built SPA) with index.html fallback.
  app.get('*', (c) => {
    const distDir = deps.distDir;
    if (!distDir) return c.text('BirdEye daemon is running. Dashboard not built — run: npm run build', 200);
    const requested = normalize(join(distDir, c.req.path === '/' ? 'index.html' : c.req.path));
    if (!requested.startsWith(normalize(distDir))) return c.text('forbidden', 403);
    const filePath = (() => {
      try {
        return statSync(requested).isFile() ? requested : join(distDir, 'index.html');
      } catch {
        return join(distDir, 'index.html');
      }
    })();
    try {
      const body = readFileSync(filePath);
      return c.body(new Uint8Array(body).buffer, 200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      });
    } catch {
      return c.text('BirdEye daemon is running. Dashboard not built — run: npm run build', 200);
    }
  });

  return app;
}
