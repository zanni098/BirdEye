import { useMemo } from 'react';
import { useApi } from '../api';
import { HARNESS_COLOR, type HarnessKind, type ScanResult } from '../types';

interface MatrixRow { name: string; detail: string; presence: Map<HarnessKind, string>; }

function buildMatrix(
  scan: ScanResult[],
  pick: (result: ScanResult) => { name: string; detail: string }[],
): { rows: MatrixRow[]; columns: HarnessKind[] } {
  const columns = scan.filter((result) => result.harness.detected).map((result) => result.harness.id);
  const rows = new Map<string, MatrixRow>();
  for (const result of scan) {
    for (const item of pick(result)) {
      const key = item.name.toLowerCase();
      const row = rows.get(key) ?? { name: item.name, detail: item.detail, presence: new Map() };
      row.presence.set(result.harness.id, item.detail);
      rows.set(key, row);
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => b.presence.size - a.presence.size || a.name.localeCompare(b.name)),
    columns,
  };
}

function Matrix({ title, hint, matrix }: {
  title: string; hint: string;
  matrix: { rows: MatrixRow[]; columns: HarnessKind[] };
}) {
  if (matrix.rows.length === 0) return null;
  return (
    <div className="card rise" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '14px 18px 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h3 style={{ fontSize: 14, letterSpacing: '0.06em' }}>{title}</h3>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>{hint}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Name</th>
              {matrix.columns.map((column) => (
                <th key={column} style={{ textAlign: 'center', color: HARNESS_COLOR[column], fontSize: 9 }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.name}>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>{row.name}</div>
                  {row.detail && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>{row.detail}</div>}
                </td>
                {matrix.columns.map((column) => (
                  <td key={column} style={{ textAlign: 'center' }}>
                    {row.presence.has(column)
                      ? <span className="dot" style={{ background: HARNESS_COLOR[column], boxShadow: `0 0 6px ${'#000'}00` }} />
                      : <span style={{ color: 'var(--line-bright)' }}>·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Arsenal() {
  const scan = useApi<ScanResult[]>('/api/scan');
  const data = scan.data ?? [];

  const mcp = useMemo(() => buildMatrix(data, (result) =>
    result.mcpServers.map((server) => ({ name: server.name, detail: server.transport }))), [data]);
  const skills = useMemo(() => buildMatrix(data, (result) =>
    result.skills.map((skill) => ({ name: skill.name, detail: skill.description }))), [data]);
  const plugins = useMemo(() => buildMatrix(data, (result) =>
    result.plugins.map((plugin) => ({ name: plugin.name, detail: plugin.version ?? '' }))), [data]);
  const agents = useMemo(() => buildMatrix(data, (result) =>
    result.agents.map((agent) => ({ name: agent.name, detail: agent.description }))), [data]);

  return (
    <>
      <div className="view-head">
        <h1>Arsenal</h1>
        <span className="sub">skills · plugins · MCP servers · agents — who has what, at a glance</span>
      </div>
      <div className="view-body">
        <Matrix title="MCP SERVERS" hint="a server on multiple rows of dots = configured N times — register birdeye once instead" matrix={mcp} />
        <Matrix title="SKILLS" hint="per-harness skill libraries" matrix={skills} />
        <Matrix title="PLUGINS & EXTENSIONS" hint="" matrix={plugins} />
        <Matrix title="AGENTS & MODELS" hint="" matrix={agents} />
        {data.length === 0 && <div className="empty">no scan data yet</div>}
      </div>
    </>
  );
}
