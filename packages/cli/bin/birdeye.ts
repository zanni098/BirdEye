#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { BirdEyeStore, Vault, defaultBaseDir } from '@birdeye/core';
import type { HarnessKind } from '@birdeye/core';
import { scanAll } from '@birdeye/adapters';
import { registrationSnippet } from '@birdeye/mcp';
import {
  MEMORY_SYNC_TARGETS, applyRegistration, syncEnvTargets, syncMemoryPack, type EnvMap,
} from '../src/file-ops.ts';

const program = new Command();
program.name('birdeye').description('One hub, every bird — mission control for your AI agent harnesses').version('0.1.0');

function openBrowser(url: string): void {
  const command = process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
    : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
  spawn(command[0] as string, command.slice(1), { stdio: 'ignore', detached: true }).unref();
}

program.command('up')
  .description('start the BirdEye daemon + dashboard')
  .option('-p, --port <port>', 'port to listen on', '4477')
  .option('--demo', 'serve rich demo data instead of scanning this machine')
  .option('--no-open', 'do not open the browser')
  .action(async (opts: { port: string; demo?: boolean; open: boolean }) => {
    const { startServer } = await import('@birdeye/server');
    const { url } = await startServer({ port: Number(opts.port), demo: opts.demo ?? false });
    console.log(`\n  🦅 BirdEye is up: ${url}${opts.demo ? '  (demo data)' : ''}\n`);
    if (opts.open) openBrowser(url);
  });

program.command('scan')
  .description('scan every harness on this machine into ~/.birdeye')
  .action(async () => {
    const results = await scanAll({ home: homedir() });
    new BirdEyeStore().saveScan(results);
    for (const result of results) {
      const h = result.harness;
      const mark = h.detected ? (h.health === 'ok' ? '✓' : '!') : '·';
      console.log(
        `${mark} ${h.name.padEnd(16)} sessions:${String(result.sessions.length).padEnd(5)} memories:${String(result.memories.length).padEnd(4)} skills:${String(result.skills.length).padEnd(4)} mcp:${String(result.mcpServers.length).padEnd(3)} ${h.warnings[0] ?? ''}`,
      );
    }
  });

program.command('register <harness>')
  .description('register the BirdEye MCP gateway with a harness (writes its config, with backup)')
  .action((harness: string) => {
    const change = applyRegistration(registrationSnippet(harness as HarnessKind), homedir());
    if (change.action === 'printed') console.log(change.detail);
    else console.log(`${change.action}: ${change.file}${change.backup ? `\n  backup: ${change.backup}` : ''}${change.detail ? `\n  ${change.detail}` : ''}`);
  });

program.command('sync-env')
  .description('write vault secrets into mapped .env files (map: ~/.birdeye/env-map.json)')
  .action(() => {
    const mapPath = join(defaultBaseDir(), 'env-map.json');
    if (!existsSync(mapPath)) {
      console.log(`No map at ${mapPath}. Example:\n` + JSON.stringify(
        { '~/projects/app/.env': { GITHUB_TOKEN: 'github-token' } }, null, 2));
      return;
    }
    const map = JSON.parse(readFileSync(mapPath, 'utf8')) as EnvMap;
    for (const change of syncEnvTargets(map, new Vault(), homedir())) {
      console.log(`${change.action}: ${change.file} ${change.detail ?? ''}`);
    }
  });

program.command('memory')
  .argument('<action>', 'sync-back')
  .description('memory sync-back: inject the shared memory pack into each harness context file')
  .action((action: string) => {
    if (action !== 'sync-back') {
      console.error(`unknown memory action "${action}" — did you mean: birdeye memory sync-back`);
      process.exitCode = 1;
      return;
    }
    const memories = new BirdEyeStore().canonicalMemories();
    if (memories.length === 0) console.log('no memories yet — run: birdeye scan');
    for (const change of syncMemoryPack(MEMORY_SYNC_TARGETS, memories, homedir())) {
      console.log(`${change.action}: ${change.file} ${change.detail ?? ''}`);
    }
  });

program.command('vault')
  .argument('<action>', 'set | list | delete')
  .argument('[key]')
  .argument('[value]')
  .description('manage the encrypted secret vault')
  .action((action: string, key?: string, value?: string) => {
    const vault = new Vault();
    if (action === 'list') { console.log(vault.list().join('\n') || '(empty)'); return; }
    if (action === 'set' && key && value !== undefined) { vault.set(key, value); console.log(`stored: ${key}`); return; }
    if (action === 'delete' && key) { console.log(vault.delete(key) ? `deleted: ${key}` : `not found: ${key}`); return; }
    console.error('usage: birdeye vault set <key> <value> | list | delete <key>');
    process.exitCode = 1;
  });

program.command('dispatch <taskId> <harness>')
  .description('dispatch a task on the board to a harness via the running daemon')
  .option('-p, --port <port>', 'daemon port', '4477')
  .action(async (taskId: string, harness: string, opts: { port: string }) => {
    const base = `http://127.0.0.1:${opts.port}`;
    const response = await fetch(`${base}/api/tasks/${taskId}/dispatch`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ harness }),
    });
    if (!response.ok) {
      console.error(`dispatch failed: ${((await response.json().catch(() => ({}))) as { error?: string }).error ?? response.status}`);
      process.exitCode = 1;
      return;
    }
    console.log('dispatched — streaming status (ctrl-c to stop watching, the run continues)...');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 600_000) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const tasks = await (await fetch(`${base}/api/tasks`)).json() as { id: string; status: string; runs: { output: string }[] }[];
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) break;
      if (task.status === 'done' || task.status === 'failed') {
        console.log(`\nstatus: ${task.status}\n\n${task.runs[task.runs.length - 1]?.output ?? ''}`);
        return;
      }
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
