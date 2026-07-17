import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MAX_READ_BYTES = 2 * 1024 * 1024; // never slurp files bigger than 2MB

export function safeReadText(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_READ_BYTES) return null;
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function safeReadJson<T>(filePath: string): T | null {
  const text = safeReadText(filePath);
  if (text === null) return null;
  try {
    return JSON.parse(stripJsonComments(text)) as T;
  } catch {
    return null;
  }
}

/** Strip // and /* *​/ comments plus trailing commas so JSONC configs parse. */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (inLine) { if (ch === '\n') { inLine = false; out += ch; } continue; }
    if (inBlock) { if (ch === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inString) { out += ch; if (ch === '\\') { out += next ?? ''; i++; } else if (ch === '"') inString = false; continue; }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '/' && next === '/') { inLine = true; continue; }
    if (ch === '/' && next === '*') { inBlock = true; i++; continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

export function listDirs(dirPath: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function listFiles(dirPath: string, extension?: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (!extension || entry.name.endsWith(extension)))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function fileMtime(filePath: string): Date | undefined {
  try {
    return statSync(filePath).mtime;
  } catch {
    return undefined;
  }
}

export function fileBirthtime(filePath: string): Date | undefined {
  try {
    const stat = statSync(filePath);
    return stat.birthtime.getTime() > 0 ? stat.birthtime : stat.mtime;
  } catch {
    return undefined;
  }
}

export function dirExists(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function countLines(filePath: string): number | null {
  const text = safeReadText(filePath);
  if (text === null) return null;
  return text.split('\n').filter((line) => line.trim().length > 0).length;
}

export { join };
