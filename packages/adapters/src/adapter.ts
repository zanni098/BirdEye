import type { Harness, HarnessKind, ScanResult, UsageRecord } from '@birdeye/core';

export interface AdapterContext {
  /** User home directory. Tests point this at a fixture tree. */
  home: string;
}

export interface HarnessAdapter {
  kind: HarnessKind;
  name: string;
  /** Directories to probe (absolute, usually derived from ctx.home). First existing wins. */
  candidatePaths(ctx: AdapterContext): string[];
  /** Read-only scan of the harness's on-disk state. Must be defensive; never write. */
  scan(ctx: AdapterContext, configPath: string): Promise<ScanResult>;
}

export function makeHarness(
  kind: HarnessKind,
  name: string,
  configPath: string,
  warnings: string[],
  dispatch?: Harness['dispatch'],
): Harness {
  return {
    id: kind,
    name,
    configPath,
    detected: true,
    health: warnings.length > 0 ? 'warnings' : 'ok',
    warnings,
    lastScanAt: new Date().toISOString(),
    dispatch,
  };
}

export function unknownUsage(kind: HarnessKind): UsageRecord {
  return {
    harness: kind, period: 'all-time',
    inputTokens: null, outputTokens: null, costUsd: null, sessions: null,
    source: 'unknown',
  };
}

export function emptyScanResult(harness: Harness): ScanResult {
  return {
    harness,
    sessions: [], memories: [], skills: [], plugins: [],
    mcpServers: [], agents: [], envKeys: [],
    usage: unknownUsage(harness.id),
  };
}
