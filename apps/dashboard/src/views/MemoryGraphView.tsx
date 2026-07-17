import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation,
  type Simulation, type SimulationNodeDatum,
} from 'd3-force';
import { useApi } from '../api';
import {
  HARNESS_COLOR, HARNESS_HEX,
  type GraphEdge, type GraphNode, type HarnessKind, type MemoryGraph, type MemoryRecord,
} from '../types';

interface SimNode extends GraphNode, SimulationNodeDatum {}
interface SimEdge { source: SimNode; target: SimNode; kind: GraphEdge['kind']; }

const EDGE_STYLE: Record<GraphEdge['kind'], { color: string; width: number }> = {
  source: { color: 'rgba(120, 140, 165, 0.14)', width: 1 },
  topic: { color: 'rgba(53, 208, 186, 0.25)', width: 1 },
  link: { color: 'rgba(245, 165, 36, 0.55)', width: 1.6 },
  mentions: { color: 'rgba(90, 169, 230, 0.3)', width: 1 },
};

function nodeRadius(node: GraphNode): number {
  if (node.kind === 'harness') return 15;
  if (node.kind === 'memory') return 4 + node.weight * 1.8;
  if (node.kind === 'entity') return 5 + node.weight;
  return 4;
}

function nodeColor(node: GraphNode): string {
  if (node.kind === 'memory' || node.kind === 'harness') return HARNESS_HEX[node.harness ?? (node.label as HarnessKind)] ?? '#8a97a8';
  if (node.kind === 'tag') return '#35d0ba';
  return '#dde6ef';
}

export function MemoryGraphView() {
  const graph = useApi<MemoryGraph>('/api/graph');
  const memories = useApi<MemoryRecord[]>('/api/memories');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<MemoryRecord | null>(null);
  const [hoverLabel, setHoverLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const [harnessFilter, setHarnessFilter] = useState<Set<HarnessKind>>(new Set());
  const [query, setQuery] = useState('');

  const presentHarnesses = useMemo(() => {
    const kinds = new Set<HarnessKind>();
    for (const node of graph.data?.nodes ?? []) if (node.harness) kinds.add(node.harness);
    return [...kinds];
  }, [graph.data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const data = graph.data;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wrap = canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const resize = (): void => {
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
    };
    resize();

    // Filtered copy of the graph.
    const activeFilter = harnessFilter.size > 0 ? harnessFilter : null;
    const needle = query.trim().toLowerCase();
    const keepNode = (node: GraphNode): boolean => {
      if (!activeFilter) return true;
      if (node.kind === 'harness') return activeFilter.has(node.label as HarnessKind);
      if (node.harness) return activeFilter.has(node.harness);
      return true; // tags/entities stay; they fade if orphaned below
    };
    const nodes: SimNode[] = data.nodes.filter(keepNode).map((node, index) => ({
      ...node,
      x: Math.cos(index * 2.4) * (120 + index * 2),
      y: Math.sin(index * 2.4) * (120 + index * 2),
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges: SimEdge[] = data.edges
      .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
      .map((edge) => ({ source: byId.get(edge.source)!, target: byId.get(edge.target)!, kind: edge.kind }));
    const degree = new Map<string, number>();
    const neighbors = new Map<string, Set<string>>();
    for (const edge of edges) {
      degree.set(edge.source.id, (degree.get(edge.source.id) ?? 0) + 1);
      degree.set(edge.target.id, (degree.get(edge.target.id) ?? 0) + 1);
      (neighbors.get(edge.source.id) ?? neighbors.set(edge.source.id, new Set()).get(edge.source.id)!).add(edge.target.id);
      (neighbors.get(edge.target.id) ?? neighbors.set(edge.target.id, new Set()).get(edge.target.id)!).add(edge.source.id);
    }

    const simulation: Simulation<SimNode, SimEdge> = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimEdge>(edges).distance((edge) =>
        edge.kind === 'source' ? 95 : edge.kind === 'link' ? 60 : 55).strength((edge) =>
        edge.kind === 'link' ? 0.5 : 0.25))
      .force('charge', forceManyBody<SimNode>().strength((node) => (node.kind === 'harness' ? -320 : -60)))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>().radius((node) => nodeRadius(node) + 4));

    const view = { x: canvas.width / (2 * dpr), y: canvas.height / (2 * dpr), k: 1 };
    let hovered: SimNode | null = null;
    let dragged: SimNode | null = null;
    let panning: { sx: number; sy: number; ox: number; oy: number } | null = null;

    const toWorld = (sx: number, sy: number): { x: number; y: number } =>
      ({ x: (sx - view.x) / view.k, y: (sy - view.y) / view.k });
    const hit = (sx: number, sy: number): SimNode | null => {
      const point = toWorld(sx, sy);
      for (let index = nodes.length - 1; index >= 0; index--) {
        const node = nodes[index]!;
        const radius = nodeRadius(node) + 3;
        const dx = (node.x ?? 0) - point.x;
        const dy = (node.y ?? 0) - point.y;
        if (dx * dx + dy * dy < radius * radius) return node;
      }
      return null;
    };

    const matchesQuery = (node: SimNode): boolean =>
      needle === '' || node.label.toLowerCase().includes(needle);

    const draw = (): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.translate(view.x, view.y);
      ctx.scale(view.k, view.k);

      const focus = hovered ?? null;
      const focusSet = focus ? new Set([focus.id, ...(neighbors.get(focus.id) ?? [])]) : null;

      for (const edge of edges) {
        const style = EDGE_STYLE[edge.kind];
        const inFocus = !focusSet || (focusSet.has(edge.source.id) && focusSet.has(edge.target.id));
        ctx.strokeStyle = style.color;
        ctx.globalAlpha = inFocus ? 1 : 0.15;
        ctx.lineWidth = style.width / view.k;
        ctx.beginPath();
        ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
        ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
        ctx.stroke();
      }

      for (const node of nodes) {
        const radius = nodeRadius(node);
        const color = nodeColor(node);
        const dimmed = (focusSet && !focusSet.has(node.id)) || !matchesQuery(node);
        ctx.globalAlpha = dimmed ? 0.18 : 1;
        const x = node.x ?? 0;
        const y = node.y ?? 0;

        if (node.kind === 'harness') {
          ctx.shadowColor = color;
          ctx.shadowBlur = 18;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5 / view.k;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(10, 14, 21, 0.85)';
          ctx.beginPath();
          ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.kind === 'tag') {
          ctx.fillStyle = color;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
          ctx.restore();
        } else if (node.kind === 'entity') {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 / view.k;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.shadowColor = color;
          ctx.shadowBlur = hovered?.id === node.id ? 16 : 7;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        const showLabel =
          node.kind === 'harness' ||
          (focusSet?.has(node.id) ?? false) ||
          (view.k > 1.15 && node.kind !== 'tag') ||
          (needle !== '' && matchesQuery(node));
        if (showLabel) {
          ctx.font = `${node.kind === 'harness' ? 11 : 9.5}px "IBM Plex Mono", monospace`;
          ctx.fillStyle = node.kind === 'harness' ? color : 'rgba(221, 230, 239, 0.82)';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, x, y + radius + 11);
        }
        ctx.globalAlpha = 1;
      }
    };

    simulation.on('tick', draw);

    const onPointerDown = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const node = hit(event.clientX - rect.left, event.clientY - rect.top);
      if (node) {
        dragged = node;
        simulation.alphaTarget(0.25).restart();
      } else {
        panning = { sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y };
      }
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      if (dragged) {
        const point = toWorld(sx, sy);
        dragged.fx = point.x;
        dragged.fy = point.y;
        return;
      }
      if (panning) {
        view.x = panning.ox + (event.clientX - panning.sx);
        view.y = panning.oy + (event.clientY - panning.sy);
        draw();
        return;
      }
      const node = hit(sx, sy);
      if (node !== hovered) {
        hovered = node;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        setHoverLabel(node && node.kind === 'memory'
          ? { x: sx, y: sy, text: node.label }
          : null);
        draw();
      }
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (dragged) {
        const rect = canvas.getBoundingClientRect();
        const node = hit(event.clientX - rect.left, event.clientY - rect.top);
        if (node === dragged && node.memoryId) {
          const memory = memories.data?.find((candidate) => candidate.id === node.memoryId) ?? null;
          setSelected(memory);
        }
        dragged.fx = null;
        dragged.fy = null;
        dragged = null;
        simulation.alphaTarget(0);
      } else if (panning) {
        const moved = Math.hypot(event.clientX - panning.sx, event.clientY - panning.sy);
        if (moved < 4) setSelected(null);
        panning = null;
      }
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(0.25, Math.min(3.5, view.k * factor));
      view.x = sx - ((sx - view.x) / view.k) * next;
      view.y = sy - ((sy - view.y) / view.k) * next;
      view.k = next;
      draw();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(() => { resize(); draw(); });
    observer.observe(wrap);

    return () => {
      simulation.stop();
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [graph.data, memories.data, harnessFilter, query]);

  const toggleHarness = (kind: HarnessKind): void => {
    setHarnessFilter((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <>
      <div className="view-head">
        <h1>Memory Graph</h1>
        <span className="sub">
          {graph.data ? `${graph.data.nodes.length} nodes · ${graph.data.edges.length} edges` : 'building…'}
        </span>
        <span className="spacer" />
        <input
          placeholder="search nodes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 200 }}
        />
      </div>
      <div className="view-body" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 26px', borderBottom: '1px solid var(--line)' }}>
          {presentHarnesses.map((kind) => {
            const active = harnessFilter.size === 0 || harnessFilter.has(kind);
            return (
              <button
                key={kind}
                onClick={() => toggleHarness(kind)}
                style={{
                  padding: '3px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  borderColor: active ? HARNESS_COLOR[kind] : 'var(--line)',
                  color: active ? HARNESS_COLOR[kind] : 'var(--tx-3)',
                  background: 'transparent',
                }}
              >
                ● {kind}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', alignSelf: 'center' }}>
            ● memory ◆ tag ○ entity ◎ harness — drag · scroll to zoom · click a memory
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ cursor: 'grab', display: 'block' }} />
          {hoverLabel && (
            <div style={{
              position: 'absolute', left: hoverLabel.x + 14, top: hoverLabel.y + 8,
              background: 'var(--ink-3)', border: '1px solid var(--line-bright)', borderRadius: 6,
              padding: '4px 9px', fontSize: 11.5, fontFamily: 'var(--font-mono)', pointerEvents: 'none',
              maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {hoverLabel.text}
            </div>
          )}
          {selected && (
            <div className="card" style={{
              position: 'absolute', top: 18, right: 18, width: 360, maxHeight: 'calc(100% - 36px)',
              overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="dot ok" style={{ background: HARNESS_COLOR[selected.sourceHarness] }} />
                <h3 style={{ fontSize: 15, flex: 1 }}>{selected.title}</h3>
                <button onClick={() => setSelected(null)} style={{ padding: '2px 8px' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="tag" style={{ color: HARNESS_COLOR[selected.sourceHarness] }}>{selected.sourceHarness}</span>
                <span className="tag">{selected.type}</span>
                {selected.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--tx-2)', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                {selected.body}
              </div>
              {selected.links.length > 0 && (
                <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber)' }}>
                  ↳ {selected.links.map((link) => `[[${link}]]`).join('  ')}
                </div>
              )}
              <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', wordBreak: 'break-all' }}>
                {selected.sourceFile}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
