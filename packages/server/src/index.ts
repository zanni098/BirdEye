import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
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

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
}

function waitForServer(server: ServerType, port: number): Promise<void> {
  if (server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      if (isAddressInUseError(error)) {
        reject(new Error(`Port ${port} is already in use. Is another BirdEye instance already running? Use --port to pick a different port.`));
        return;
      }
      reject(error);
    };

    server.once('error', onError);
    server.once('listening', onListening);
  });
}

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
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  const deps: AppDeps = {
    store, vault, demo, home, broadcast,
    scanFn: scanAll,
    distDir: existsSync(distDir) ? distDir : undefined,
    // Registered inside createApp BEFORE the static catch-all, or GET /ws never upgrades.
    registerWs: (routedApp) => routedApp.get('/ws', upgradeWebSocket(() => ({
      onOpen: (_event, ws) => { clients.add(ws); },
      onClose: (_event, ws) => { clients.delete(ws); },
    }))),
  };
  createApp(deps, app);

  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  injectWebSocket(server);
  await waitForServer(server, port);

  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    close: () => new Promise((resolve) => { server.close(() => resolve()); }),
  };
}
