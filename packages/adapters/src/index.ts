import type { Harness, ScanResult } from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from './adapter.ts';
import { emptyScanResult } from './adapter.ts';
import { dirExists } from './fs-utils.ts';
import { claudeCodeAdapter } from './adapters/claude-code.ts';
import { claudeDesktopAdapter } from './adapters/claude-desktop.ts';
import { codexAdapter } from './adapters/codex.ts';
import { opencodeAdapter } from './adapters/opencode.ts';
import { openclawAdapter } from './adapters/openclaw.ts';
import { zcodeAdapter } from './adapters/zcode.ts';
import { geminiAdapter } from './adapters/gemini.ts';
import { cursorAdapter } from './adapters/cursor.ts';
import { continueAdapter } from './adapters/continue.ts';

export * from './adapter.ts';
export {
  claudeCodeAdapter, claudeDesktopAdapter, codexAdapter, opencodeAdapter,
  openclawAdapter, zcodeAdapter, geminiAdapter, cursorAdapter, continueAdapter,
};

export const allAdapters: HarnessAdapter[] = [
  claudeCodeAdapter, claudeDesktopAdapter, codexAdapter, opencodeAdapter,
  openclawAdapter, zcodeAdapter, geminiAdapter, cursorAdapter, continueAdapter,
];

function notFoundHarness(adapter: HarnessAdapter, probed: string[]): Harness {
  return {
    id: adapter.kind, name: adapter.name,
    configPath: probed[0] ?? '',
    detected: false, health: 'not-found', warnings: [],
    lastScanAt: new Date().toISOString(),
  };
}

/** Scan every known harness. One broken adapter never breaks the others. */
export async function scanAll(ctx: AdapterContext): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (const adapter of allAdapters) {
    const candidates = adapter.candidatePaths(ctx);
    const configPath = candidates.find((candidate) => dirExists(candidate));
    if (!configPath) {
      results.push(emptyScanResult(notFoundHarness(adapter, candidates)));
      continue;
    }
    try {
      results.push(await adapter.scan(ctx, configPath));
    } catch (error) {
      const harness = notFoundHarness(adapter, candidates);
      results.push(emptyScanResult({
        ...harness,
        configPath, detected: true, health: 'error',
        warnings: [`scan failed: ${error instanceof Error ? error.message : String(error)}`],
      }));
    }
  }
  return results;
}
