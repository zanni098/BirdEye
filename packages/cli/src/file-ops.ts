import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MemoryRecord, Vault } from '@birdeye/core';
import { injectBlock, renderMemoryPack } from '@birdeye/core';
import type { RegistrationSnippet } from '@birdeye/mcp';

export interface FileChange { file: string; action: 'updated' | 'created' | 'skipped' | 'printed'; backup?: string; detail?: string; }

export function expandHome(filePath: string, homeDir: string): string {
  return filePath.startsWith('~') ? join(homeDir, filePath.slice(1)) : filePath;
}

function backupOf(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  const backup = `${filePath}.birdeye-backup-${Date.now()}`;
  copyFileSync(filePath, backup);
  return backup;
}

/** Apply an MCP registration snippet to a harness config file (backup first, merge non-destructively). */
export function applyRegistration(snippet: RegistrationSnippet, homeDir: string): FileChange {
  if (snippet.format === 'text' || !snippet.file) {
    return { file: '', action: 'printed', detail: snippet.snippet };
  }
  const filePath = expandHome(snippet.file, homeDir);

  if (snippet.format === 'toml') {
    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
    if (existing.includes('[mcp_servers.birdeye]')) return { file: filePath, action: 'skipped', detail: 'already registered' };
    const backup = backupOf(filePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, existing + snippet.snippet, 'utf8');
    return { file: filePath, action: existing ? 'updated' : 'created', backup };
  }

  // json
  const existingText = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '{}';
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(existingText) as Record<string, unknown>;
  } catch {
    return { file: filePath, action: 'skipped', detail: 'target file is not valid JSON — fix it first' };
  }
  const path = snippet.jsonPath ?? 'mcpServers';
  const addition = JSON.parse(snippet.snippet) as unknown;
  const current = config[path];
  if (Array.isArray(addition)) {
    const list = Array.isArray(current) ? current : [];
    const hasBirdeye = list.some((entry) => (entry as { name?: string }).name === 'birdeye');
    config = { ...config, [path]: hasBirdeye ? list : [...list, ...addition] };
  } else {
    const map = (current && typeof current === 'object' && !Array.isArray(current)) ? current as Record<string, unknown> : {};
    config = { ...config, [path]: { ...map, ...(addition as Record<string, unknown>) } };
  }
  const backup = backupOf(filePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { file: filePath, action: backup ? 'updated' : 'created', backup };
}

export type EnvMap = Record<string, Record<string, string>>; // target file → { ENV_VAR: vault-secret-name }

/** Write vault-held secrets into mapped .env files. Never logs values. */
export function syncEnvTargets(map: EnvMap, vault: Vault, homeDir: string): FileChange[] {
  const changes: FileChange[] = [];
  for (const [target, vars] of Object.entries(map)) {
    const filePath = expandHome(target, homeDir);
    let text = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
    const written: string[] = [];
    for (const [envVar, secretName] of Object.entries(vars)) {
      const value = vault.get(secretName);
      if (value === null) continue;
      const line = `${envVar}=${value}`;
      const pattern = new RegExp(`^${envVar}=.*$`, 'm');
      text = pattern.test(text) ? text.replace(pattern, line) : `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`;
      written.push(envVar);
    }
    if (written.length === 0) {
      changes.push({ file: filePath, action: 'skipped', detail: 'no mapped secrets found in vault' });
      continue;
    }
    const backup = backupOf(filePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, text, 'utf8');
    changes.push({ file: filePath, action: backup ? 'updated' : 'created', backup, detail: written.join(', ') });
  }
  return changes;
}

/** Inject the shared memory pack into each harness context file that exists. */
export function syncMemoryPack(targets: string[], memories: MemoryRecord[], homeDir: string): FileChange[] {
  const pack = renderMemoryPack(memories);
  const changes: FileChange[] = [];
  for (const target of targets) {
    const filePath = expandHome(target, homeDir);
    if (!existsSync(filePath)) {
      changes.push({ file: filePath, action: 'skipped', detail: 'file does not exist' });
      continue;
    }
    const before = readFileSync(filePath, 'utf8');
    const after = injectBlock(before, pack);
    if (after === before) {
      changes.push({ file: filePath, action: 'skipped', detail: 'already up to date' });
      continue;
    }
    const backup = backupOf(filePath);
    writeFileSync(filePath, after, 'utf8');
    changes.push({ file: filePath, action: 'updated', backup });
  }
  return changes;
}

export const MEMORY_SYNC_TARGETS = [
  '~/.claude/CLAUDE.md',
  '~/.gemini/GEMINI.md',
  '~/.codex/AGENTS.md',
  '~/.config/opencode/AGENTS.md',
];
