import { basename } from 'node:path';
import { contentHashOf } from './hash.ts';
import type { HarnessKind, MemoryRecord, MemoryType } from './types.ts';

export interface MemorySource {
  harness: HarnessKind;
  file: string;
  mtime?: Date;
}

const MEMORY_TYPES: readonly MemoryType[] = ['user', 'project', 'feedback', 'reference', 'instruction', 'note'];

const LINK_RE = /\[\[([^\]]+)\]\]/g;
/** #tag — requires a non-space char right after # so markdown headings ("# Title") don't match. */
const TAG_RE = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{1,40})\b/g;
const INSTRUCTION_FILE_RE = /^(CLAUDE|GEMINI|AGENTS|RULES?)\b/i;

export function extractLinks(text: string): string[] {
  const links = new Set<string>();
  for (const m of text.matchAll(LINK_RE)) links.add((m[1] as string).trim());
  return [...links];
}

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) tags.add((m[1] as string).toLowerCase());
  return [...tags];
}

interface Frontmatter { name?: string; description?: string; type?: string; }

/** Minimal frontmatter reader: top-level `key: value` plus `metadata.type` one level deep. */
function parseFrontmatter(md: string): { fm: Frontmatter | null; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: md };
  const fm: Frontmatter = {};
  let inMetadata = false;
  for (const rawLine of (m[1] as string).split(/\r?\n/)) {
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (!line) continue;
    if (indent === 0) inMetadata = line === 'metadata:';
    const kv = line.match(/^([\w.-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1] as string;
    const value = (kv[2] as string).trim().replace(/^["']|["']$/g, '');
    if (indent === 0) {
      if (key === 'name') fm.name = value;
      else if (key === 'description') fm.description = value;
      else if (key === 'type') fm.type = value;
    } else if (inMetadata && key === 'type') {
      fm.type = value;
    }
  }
  return { fm, body: md.slice(m[0].length) };
}

function coerceType(raw: string | undefined, file: string): MemoryType {
  if (raw && (MEMORY_TYPES as readonly string[]).includes(raw)) return raw as MemoryType;
  if (INSTRUCTION_FILE_RE.test(basename(file))) return 'instruction';
  return 'note';
}

function firstHeading(body: string): string | null {
  const m = body.match(/^#{1,3}\s+(.+)$/m);
  return m ? (m[1] as string).trim() : null;
}

/**
 * Parse one markdown file into a canonical MemoryRecord.
 * Supports frontmatter memory files (name/description/metadata.type) and
 * plain context files (CLAUDE.md, GEMINI.md, AGENTS.md, notes).
 * Returns null for empty/whitespace-only files.
 */
export function parseMemoryMarkdown(md: string, source: MemorySource): MemoryRecord | null {
  if (!md.trim()) return null;
  const { fm, body } = parseFrontmatter(md);
  const content = body.trim() || md.trim();
  const title =
    fm?.name?.trim() ||
    firstHeading(content) ||
    basename(source.file).replace(/\.[^.]+$/, '');
  const hash = contentHashOf(content);
  return {
    id: `${source.harness}:${hash.slice(0, 12)}`,
    title,
    body: content,
    type: coerceType(fm?.type, source.file),
    sourceHarness: source.harness,
    sourceFile: source.file,
    createdAt: source.mtime ? source.mtime.toISOString() : null,
    tags: extractTags(content),
    links: extractLinks(content),
    contentHash: hash,
  };
}
