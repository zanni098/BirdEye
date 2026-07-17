import { describe, expect, test } from 'vitest';
import { buildMemoryGraph } from '../src/graph.ts';
import type { MemoryRecord } from '../src/types.ts';

function memory(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: 'claude-code:1', title: 'Alpha', body: 'body', type: 'note',
    sourceHarness: 'claude-code', sourceFile: '/a.md', createdAt: null,
    tags: [], links: [], contentHash: 'h1',
    ...overrides,
  };
}

describe('buildMemoryGraph', () => {
  test('memories connect to their source harness', () => {
    const graph = buildMemoryGraph([memory({})]);
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['m:claude-code:1', 'h:claude-code']));
    expect(graph.edges).toContainEqual({ source: 'm:claude-code:1', target: 'h:claude-code', kind: 'source' });
  });

  test('[[links]] between memories become link edges, not entities', () => {
    const a = memory({ id: 'c:1', title: 'Moviola Project', contentHash: 'h1' });
    const b = memory({ id: 'c:2', title: 'Beta', links: ['Moviola Project'], contentHash: 'h2' });
    const graph = buildMemoryGraph([a, b]);
    expect(graph.edges).toContainEqual({ source: 'm:c:2', target: 'm:c:1', kind: 'link' });
    expect(graph.nodes.find((node) => node.id === 'e:moviola-project')).toBeUndefined();
  });

  test('tags become topic nodes/edges', () => {
    const graph = buildMemoryGraph([memory({ tags: ['video'] })]);
    expect(graph.nodes.find((node) => node.id === 't:video')?.label).toBe('#video');
    expect(graph.edges).toContainEqual({ source: 'm:claude-code:1', target: 't:video', kind: 'topic' });
  });

  test('capitalized phrases in ≥2 memories become entity nodes', () => {
    const a = memory({ id: 'c:1', body: 'Working on Symbiothus Site today', contentHash: 'h1' });
    const b = memory({ id: 'c:2', body: 'We deploy Symbiothus Site tomorrow', contentHash: 'h2' });
    const c = memory({ id: 'c:3', body: 'Only One Mention here', contentHash: 'h3' });
    const graph = buildMemoryGraph([a, b, c]);
    expect(graph.nodes.find((node) => node.id === 'e:symbiothus-site')).toBeDefined();
    expect(graph.nodes.find((node) => node.id === 'e:only-one-mention')).toBeUndefined();
    expect(graph.edges.filter((edge) => edge.kind === 'mentions')).toHaveLength(2);
  });

  test('weights scale with body length and counts', () => {
    const graph = buildMemoryGraph([memory({ body: 'x'.repeat(2000) })]);
    expect(graph.nodes.find((node) => node.kind === 'memory')?.weight).toBe(5);
  });
});
