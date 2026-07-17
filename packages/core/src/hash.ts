import { createHash } from 'node:crypto';

export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Normalization used ONLY for hashing/comparison — never for display. */
export function normalizeBody(body: string): string {
  return body.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function contentHashOf(body: string): string {
  return sha256hex(normalizeBody(body));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Iterative Levenshtein distance (two-row), O(min(a,b)) memory. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[b.length] as number;
}
