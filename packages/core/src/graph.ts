import { slugify } from './hash.ts';
import type { GraphEdge, GraphNode, MemoryGraph, MemoryRecord } from './types.ts';

// Best-effort heuristic: capitalized multi-word phrases. Sentence-initial words can
// glom on ("Deploy Foo Bar" → one phrase) — acceptable noise for a v1 graph.
const ENTITY_RE = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g;
const MIN_ENTITY_MEMORIES = 2;

function weightBucket(length: number): number {
  if (length < 120) return 1;
  if (length < 300) return 2;
  if (length < 700) return 3;
  if (length < 1500) return 4;
  return 5;
}

function countBucket(count: number): number {
  return Math.min(5, 1 + Math.floor(Math.log2(Math.max(1, count))));
}

/** Build the interactive memory graph from canonical (deduped) memories. */
export function buildMemoryGraph(memories: MemoryRecord[]): MemoryGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSeen = new Set<string>();

  const addEdge = (source: string, target: string, kind: GraphEdge['kind']): void => {
    const key = `${source}→${target}:${kind}`;
    if (edgeSeen.has(key) || source === target) return;
    edgeSeen.add(key);
    edges.push({ source, target, kind });
  };

  const slugToMemoryNode = new Map<string, string>();
  const harnessCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const entityMemories = new Map<string, { label: string; memoryNodeIds: Set<string> }>();

  for (const memory of memories) {
    const nodeId = `m:${memory.id}`;
    nodes.set(nodeId, {
      id: nodeId,
      kind: 'memory',
      label: memory.title,
      harness: memory.sourceHarness,
      weight: weightBucket(memory.body.length),
      memoryId: memory.id,
    });
    slugToMemoryNode.set(slugify(memory.title), nodeId);
    harnessCounts.set(memory.sourceHarness, (harnessCounts.get(memory.sourceHarness) ?? 0) + 1);
    for (const tag of memory.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

    for (const match of memory.body.matchAll(ENTITY_RE)) {
      const label = match[1] as string;
      const slug = slugify(label);
      const entry = entityMemories.get(slug) ?? { label, memoryNodeIds: new Set<string>() };
      entry.memoryNodeIds.add(nodeId);
      entityMemories.set(slug, entry);
    }
    for (const link of memory.links) {
      const slug = slugify(link);
      const entry = entityMemories.get(slug) ?? { label: link, memoryNodeIds: new Set<string>() };
      entry.memoryNodeIds.add(nodeId);
      entityMemories.set(slug, entry);
    }
  }

  for (const [harness, count] of harnessCounts) {
    nodes.set(`h:${harness}`, {
      id: `h:${harness}`, kind: 'harness', label: harness, weight: countBucket(count),
    });
  }
  for (const [tag, count] of tagCounts) {
    nodes.set(`t:${tag}`, { id: `t:${tag}`, kind: 'tag', label: `#${tag}`, weight: countBucket(count) });
  }

  for (const memory of memories) {
    const nodeId = `m:${memory.id}`;
    addEdge(nodeId, `h:${memory.sourceHarness}`, 'source');
    for (const tag of memory.tags) addEdge(nodeId, `t:${tag}`, 'topic');
    for (const link of memory.links) {
      const target = slugToMemoryNode.get(slugify(link));
      if (target) addEdge(nodeId, target, 'link');
    }
  }

  for (const [slug, entry] of entityMemories) {
    // A [[link]] that resolved to a real memory is already a link edge, not an entity.
    if (slugToMemoryNode.has(slug)) continue;
    if (entry.memoryNodeIds.size < MIN_ENTITY_MEMORIES) continue;
    const entityId = `e:${slug}`;
    nodes.set(entityId, {
      id: entityId, kind: 'entity', label: entry.label, weight: countBucket(entry.memoryNodeIds.size),
    });
    for (const memoryNodeId of entry.memoryNodeIds) addEdge(memoryNodeId, entityId, 'mentions');
  }

  return { nodes: [...nodes.values()], edges };
}
