import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import type { WSContext } from 'hono/ws';
import { BirdEyeStore, Vault } from '@birdeye/core';
import { scanAll } from '@birdeye/adapters';
import { createApp, type AppDeps } from './app.ts';

export { createApp, type AppDeps } from './app.ts';
export { startRun } from './dispatcher.ts';
export { DEMO_SCAN, DEMO_TASKS } from './demo-data.ts';

export interface ServerOptions {
  port?: number;
  demo?: boolean;
  store?: BirdEyeStore;
  vault?: Vault;
}

const DEFAULT_PORT = 4477;

export async function startServer(opts?: ServerOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const port = opts?.port ?? DEFAULT_PORT;
  const demo = opts?.demo ?? false;
  const store = opts?.store ?? new BirdEyeStore();
  const vault = opts?.vault ?? new Vault();
  const home = homedir();

  if (!demo) {
    // Fresh scan on startup so the dashboard opens with live data.
    store.saveScan(await scanAll({ home }));
  }

  const clients = new Set<WSContext>();
  const broadcast = (message: unknown): void => {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      try {
        client.send(payload);
      } catch { /* client gone — cleaned up on close */ }
    }
  };

  const distDir = join(import.meta.dirname, '..', '..', '..', 'apps', 'dashboard', 'dist');
  const deps: AppDeps = {
    store, vault, demo, home, broadcast,
    scanFn: scanAll,
    distDir: existsSync(distDir) ? distDir : undefined,
  };
  const app = createApp(deps);

  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  app.get('/ws', upgradeWebSocket(() => ({
    onOpen: (_event, ws) => { clients.add(ws); },
    onClose: (_event, ws) => { clients.delete(ws); },
  })));

  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  injectWebSocket(server);

  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    close: () => new Promise((resolve) => { server.close(() => resolve()); }),
  };
}
