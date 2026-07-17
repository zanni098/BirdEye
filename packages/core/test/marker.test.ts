import { describe, expect, test } from 'vitest';
import { MARKER_END, MARKER_START, injectBlock, renderMemoryPack } from '../src/marker.ts';
import type { MemoryRecord } from '../src/types.ts';

describe('injectBlock', () => {
  const USER_CONTENT = '# My CLAUDE.md\n\nMy own precious rules.\n';

  test('appends a block to a file without one, preserving user content byte-for-byte', () => {
    const result = injectBlock(USER_CONTENT, 'pack v1');
    expect(result.startsWith(USER_CONTENT)).toBe(true);
    expect(result).toContain(`${MARKER_START}\npack v1\n${MARKER_END}`);
  });

  test('replaces an existing block idempotently', () => {
    const once = injectBlock(USER_CONTENT, 'pack v1');
    const twice = injectBlock(once, 'pack v2');
    const thrice = injectBlock(twice, 'pack v2');
    expect(twice).toBe(thrice);
    expect(twice).toContain('pack v2');
    expect(twice).not.toContain('pack v1');
    expect(twice.startsWith(USER_CONTENT)).toBe(true);
  });

  test('content after the block survives replacement', () => {
    const doc = `before\n${MARKER_START}\nold\n${MARKER_END}\nafter trailer`;
    const result = injectBlock(doc, 'new');
    expect(result).toBe(`before\n${MARKER_START}\nnew\n${MARKER_END}\nafter trailer`);
  });

  test('empty file gets just the block', () => {
    expect(injectBlock('', 'pack')).toBe(`${MARKER_START}\npack\n${MARKER_END}\n`);
  });
});

describe('renderMemoryPack', () => {
  const memories: MemoryRecord[] = [
    { id: 'a', title: 'Prefers dark mode', body: 'Dark mode always.', type: 'user', sourceHarness: 'claude-code', sourceFile: '/a', createdAt: null, tags: [], links: [], contentHash: 'h1' },
    { id: 'b', title: 'Moviola', body: 'Video studio project.', type: 'project', sourceHarness: 'openclaw', sourceFile: '/b', createdAt: null, tags: [], links: [], contentHash: 'h2' },
  ];

  test('groups by type with headings and source attribution', () => {
    const pack = renderMemoryPack(memories);
    expect(pack).toContain('### About the user');
    expect(pack).toContain('### Active projects');
    expect(pack).toContain('_(via openclaw)_');
    expect(pack.indexOf('About the user')).toBeLessThan(pack.indexOf('Active projects'));
  });

  test('respects maxChars with a truncation note', () => {
    const pack = renderMemoryPack(memories, { maxChars: 80 });
    expect(pack.length).toBeLessThan(200);
    expect(pack).toContain('truncated by BirdEye');
  });
});
