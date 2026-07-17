import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import type { Harness, TaskRecord, TaskRun } from '@birdeye/core';

const OUTPUT_CAP = 200_000;
const FAKE_LINES = [
  '> birdeye demo dispatch (no real CLI spawned in demo mode)',
  'Reading briefing...',
  'Planning approach...',
  'Editing files...',
  'Running tests... all green',
  'Done. (demo run)',
];
const FAKE_INTERVAL_MS = 450;

export interface DispatchHooks {
  onChunk: (chunk: string) => void;
  onDone: (run: TaskRun) => void;
}

function appendOutput(run: TaskRun, chunk: string): void {
  if (run.output.length >= OUTPUT_CAP) return;
  run.output += chunk;
  if (run.output.length >= OUTPUT_CAP) {
    run.output = `${run.output.slice(0, OUTPUT_CAP)}\n…[output truncated by BirdEye at 200KB]`;
  }
}

/**
 * Start a task run against a harness's headless CLI.
 * Returns the live TaskRun immediately; hooks fire as output streams.
 */
export function startRun(
  task: TaskRecord, harness: Harness, hooks: DispatchHooks, opts?: { fake?: boolean },
): TaskRun {
  const run: TaskRun = {
    id: `r-${crypto.randomUUID()}`,
    startedAt: new Date().toISOString(),
    endedAt: null, status: 'running', exitCode: null, output: '',
  };

  if (opts?.fake) {
    let index = 0;
    const timer = setInterval(() => {
      const line = FAKE_LINES[index];
      if (line !== undefined) {
        appendOutput(run, `${line}\n`);
        hooks.onChunk(`${line}\n`);
        index += 1;
        return;
      }
      clearInterval(timer);
      run.status = 'succeeded';
      run.exitCode = 0;
      run.endedAt = new Date().toISOString();
      hooks.onDone(run);
    }, FAKE_INTERVAL_MS);
    return run;
  }

  if (harness.dispatch?.kind !== 'cli') {
    run.status = 'failed';
    run.endedAt = new Date().toISOString();
    appendOutput(run, 'harness has no CLI dispatch configured\n');
    queueMicrotask(() => hooks.onDone(run));
    return run;
  }

  const { command, args } = harness.dispatch;
  const child = spawn(command, [...args, task.briefing], {
    shell: true, cwd: homedir(), windowsHide: true,
  });
  const onData = (data: Buffer): void => {
    const chunk = data.toString('utf8');
    appendOutput(run, chunk);
    hooks.onChunk(chunk);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (error) => {
    appendOutput(run, `\nfailed to start "${command}": ${error.message}\n`);
    run.status = 'failed';
    run.endedAt = new Date().toISOString();
    hooks.onDone(run);
  });
  child.on('close', (code) => {
    if (run.status !== 'running') return; // 'error' already finished it
    run.exitCode = code;
    run.status = code === 0 ? 'succeeded' : 'failed';
    run.endedAt = new Date().toISOString();
    hooks.onDone(run);
  });
  return run;
}
