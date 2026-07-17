import { describe, expect, test } from 'vitest';
import { extractLinks, extractTags, parseMemoryMarkdown } from '../src/memory-md.ts';

const FRONTMATTER_DOC = `---
name: moviola-project
description: Open creative studio project
metadata:
  type: project
---

Moviola is an open studio. Related to [[symbiothus-site]]. #video #nextjs
`;

describe('parseMemoryMarkdown', () => {
  test('frontmatter file becomes a typed record with links and tags', () => {
    const record = parseMemoryMarkdown(FRONTMATTER_DOC, {
      harness: 'claude-code',
      file: 'C:/mem/moviola-project.md',
      mtime: new Date('2026-01-02T03:04:05Z'),
    });
    expect(record).not.toBeNull();
    expect(record!.title).toBe('moviola-project');
    expect(record!.type).toBe('project');
    expect(record!.links).toEqual(['symbiothus-site']);
    expect(record!.tags).toEqual(expect.arrayContaining(['video', 'nextjs']));
    expect(record!.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(record!.id).toMatch(/^claude-code:[0-9a-f]{12}$/);
    expect(record!.body).not.toContain('---');
  });

  test('plain GEMINI.md becomes an instruction record titled from heading', () => {
    const record = parseMemoryMarkdown('# House Rules\nAlways be concise.', {
      harness: 'gemini',
      file: '/home/u/.gemini/GEMINI.md',
    });
    expect(record!.type).toBe('instruction');
    expect(record!.title).toBe('House Rules');
  });

  test('file with no heading falls back to filename title and note type', () => {
    const record = parseMemoryMarkdown('just some text', {
      harness: 'openclaw',
      file: '/x/random-thought.md',
    });
    expect(record!.title).toBe('random-thought');
    expect(record!.type).toBe('note');
  });

  test('empty file yields null', () => {
    expect(parseMemoryMarkdown('   \n', { harness: 'zcode', file: '/x/empty.md' })).toBeNull();
  });
});

describe('extractors', () => {
  test('markdown headings are not tags', () => {
    expect(extractTags('# Heading\n## Sub\nreal #tag here')).toEqual(['tag']);
  });
  test('duplicate links collapse', () => {
    expect(extractLinks('[[a]] and [[a]] and [[b c]]')).toEqual(['a', 'b c']);
  });
});
