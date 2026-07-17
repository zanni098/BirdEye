import type { MemoryRecord, MemoryType } from './types.ts';

export const MARKER_START = '<!-- BIRDEYE:START -->';
export const MARKER_END = '<!-- BIRDEYE:END -->';

const TYPE_ORDER: readonly MemoryType[] = ['user', 'project', 'feedback', 'reference', 'instruction', 'note'];
const TYPE_HEADINGS: Record<MemoryType, string> = {
  user: 'About the user',
  project: 'Active projects',
  feedback: 'Working preferences',
  reference: 'References',
  instruction: 'Standing instructions',
  note: 'Notes',
};
const DEFAULT_MAX_CHARS = 6000;
const BODY_SNIPPET_CHARS = 200;

/**
 * Replace the BirdEye block inside `fileText`, or append one if absent.
 * Idempotent; every byte outside the markers is preserved exactly.
 */
export function injectBlock(fileText: string, content: string): string {
  const block = `${MARKER_START}\n${content.trim()}\n${MARKER_END}`;
  const start = fileText.indexOf(MARKER_START);
  const end = fileText.indexOf(MARKER_END);
  if (start !== -1 && end !== -1 && end > start) {
    return fileText.slice(0, start) + block + fileText.slice(end + MARKER_END.length);
  }
  if (fileText.trim() === '') return `${block}\n`;
  const separator = fileText.endsWith('\n') ? '\n' : '\n\n';
  return `${fileText}${separator}${block}\n`;
}

/** Render the shared-memory digest that gets synced into each harness's context file. */
export function renderMemoryPack(memories: MemoryRecord[], opts?: { maxChars?: number }): string {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const lines: string[] = [
    '## BirdEye shared memory',
    '_Synced from all your agent harnesses by [BirdEye](https://github.com/zanni098/BirdEye). Do not edit inside the markers — edits will be overwritten on the next sync._',
    '',
  ];
  for (const type of TYPE_ORDER) {
    const group = memories.filter((memory) => memory.type === type);
    if (group.length === 0) continue;
    lines.push(`### ${TYPE_HEADINGS[type]}`);
    for (const memory of group) {
      const snippet = memory.body.replace(/\s+/g, ' ').trim();
      const short = snippet.length > BODY_SNIPPET_CHARS ? `${snippet.slice(0, BODY_SNIPPET_CHARS)}…` : snippet;
      lines.push(`- **${memory.title}** — ${short} _(via ${memory.sourceHarness})_`);
    }
    lines.push('');
  }
  let text = lines.join('\n').trim();
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n_…truncated by BirdEye (memory pack over ${maxChars} chars)._`;
  }
  return text;
}
