import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { BirdEyeStore, Vault } from '@birdeye/core';
import { createApp, startServer } from '../src/index.ts';
import { DEMO_SCAN, DEMO_TASKS } from '../src/demo-data.ts';

function demoApp(broadcasts: unknown[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'birdeye-server-'));
  const app = createApp({
    store: new BirdEyeStore(dir),
    vault: new Vault({ filePath: join(dir, 'vault.enc'), passphrase: 'test' }),
    demo: true,
    home: dir,
    broadcast: (message) => broadcasts.push(message),
  });
  return { app, dir };
}

describe('API (demo mode)', () => {
  let dir: string;
  let app: ReturnType<typeof demoApp>['app'];

  beforeEach(() => {
    const built = demoApp();
    app = built.app;
    dir = built.dir;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('overview reports totals matching demo data', async () => {
    const response = await app.request('/api/overview');
    expect(response.status).toBe(200);
    const body = await response.json() as { harnesses: unknown[]; totals: { sessions: number; costUsd: number } };
    expect(body.harnesses).toHaveLength(DEMO_SCAN.length);
    expect(body.totals.sessions).toBe(DEMO_SCAN.reduce((sum, result) => sum + result.sessions.length, 0));
    expect(body.totals.costUsd).toBeCloseTo(61.4 + 38.2);
  });

  test('memories are deduped and graph has nodes and edges', async () => {
    const memories = await (await app.request('/api/memories')).json() as unknown[];
    expect(memories.length).toBeGreaterThan(20);
    const graph = await (await app.request('/api/graph')).json() as { nodes: unknown[]; edges: { kind: string }[] };
    expect(graph.nodes.length).toBeGreaterThan(memories.length);
    expect(graph.edges.length).toBeGreaterThan(20);
    expect(graph.edges.some((edge: { kind: string }) => edge.kind === 'link')).toBe(true);
  });

  test('tasks: demo seed present, POST creates, validation rejects empty', async () => {
    const tasks = await (await app.request('/api/tasks')).json() as unknown[];
    expect(tasks).toHaveLength(DEMO_TASKS.length);

    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New task', briefing: 'Do it well' }),
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { status: string }).status).toBe('todo');

    const rejected = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: ' ' }),
    });
    expect(rejected.status).toBe(400);
  });

  test('vault stores keys, lists names only, never echoes values', async () => {
    const set = await app.request('/api/vault', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'GITHUB_TOKEN', value: 'gho_supersecret' }),
    });
    expect(set.status).toBe(200);
    const setBody = JSON.stringify(await set.json());
    expect(setBody).not.toContain('gho_supersecret');

    const list = await (await app.request('/api/vault')).json() as { keys: string[] };
    expect(list.keys).toContain('GITHUB_TOKEN');

    const removed = await (await app.request('/api/vault/GITHUB_TOKEN', { method: 'DELETE' })).json() as { ok: boolean; keys: string[] };
    expect(removed.ok).toBe(true);
    expect(removed.keys).not.toContain('GITHUB_TOKEN');
  });

  test('unknown API-less path serves fallback text when dashboard not built', async () => {
    const response = await app.request('/aviary');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('daemon is running');
  });
});

describe('dispatch (demo mode fake runs)', () => {
  test('dispatching a task streams fake output and completes', async () => {
    const broadcasts: { type?: string }[] = [];
    const { app, dir } = demoApp(broadcasts);
    try {
      const response = await app.request(`/api/tasks/${DEMO_TASKS[3]!.id}/dispatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ harness: 'claude-code' }),
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { status: string }).status).toBe('running');

      // Fake run: 6 lines at ~450ms then done — wait up to 6s.
      let finalStatus = 'running';
      for (let i = 0; i < 24 && finalStatus === 'running'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const tasks = await (await app.request('/api/tasks')).json() as { id: string; status: string }[];
        finalStatus = tasks.find((task) => task.id === DEMO_TASKS[3]!.id)!.status;
      }
      expect(finalStatus).toBe('done');
      expect(broadcasts.some((message) => message.type === 'task-output')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dispatching to an unknown harness 400s', async () => {
    const { app, dir } = demoApp();
    try {
      const response = await app.request(`/api/tasks/${DEMO_TASKS[3]!.id}/dispatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ harness: 'nope' }),
      });
      expect(response.status).toBe(400);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('server startup', () => {
  test('reports a friendly error when the requested port is already in use', async () => {
    const occupyingServer = createServer();
    await new Promise<void>((resolve) => occupyingServer.listen(0, '127.0.0.1', resolve));
    const port = (occupyingServer.address() as AddressInfo).port;
    const dir = mkdtempSync(join(tmpdir(), 'birdeye-server-'));

    try {
      await expect(startServer({
        port,
        demo: true,
        store: new BirdEyeStore(dir),
        vault: new Vault({ filePath: join(dir, 'vault.enc'), passphrase: 'test' }),
      })).rejects.toThrow(`Port ${port} is already in use. Is another BirdEye instance already running? Use --port to pick a different port.`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        occupyingServer.close((error) => { if (error) reject(error); else resolve(); });
      });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
