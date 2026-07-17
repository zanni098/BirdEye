import { describe, expect, test } from 'vitest';
import { contentHashOf, levenshtein, normalizeBody, sha256hex, slugify } from '../src/hash.ts';

describe('hashing', () => {
  test('sha256hex produces stable 64-char hex', () => {
    expect(sha256hex('birdeye')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256hex('birdeye')).toBe(sha256hex('birdeye'));
  });

  test('normalizeBody collapses whitespace and case for comparison only', () => {
    expect(normalizeBody('  Hello\n\n  World  ')).toBe('hello world');
  });

  test('contentHashOf treats reformatted text as identical', () => {
    expect(contentHashOf('Hello   World')).toBe(contentHashOf('hello world\n'));
  });
});

describe('slugify', () => {
  test('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('Moviola Project!')).toBe('moviola-project');
    expect(slugify('  --API v2--  ')).toBe('api-v2');
  });
});

describe('levenshtein', () => {
  test('returns known distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});
