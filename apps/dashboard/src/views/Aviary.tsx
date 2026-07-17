import { useApi } from '../api';
import { HARNESS_COLOR, type Overview, type ScanResult } from '../types';

const STATS: { key: keyof Overview['totals']; label: string }[] = [
  { key: 'memories', label: 'shared memories' },
  { key: 'sessions', label: 'sessions' },
  { key: 'skills', label: 'skills' },
  { key: 'plugins', label: 'plugins' },
  { key: 'mcpServers', label: 'mcp servers' },
  { key: 'agents', label: 'agents' },
  { key: 'envKeys', label: 'credential keys' },
];

function StatTile({ value, label, index }: { value: string; label: string; index: number }) {
  return (
    <div className="card rise" style={{ padding: '14px 18px', animationDelay: `${index * 45}ms` }}>
      <div className="num" style={{ fontSize: 26, fontWeight: 500, color: 'var(--tx-1)' }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tx-3)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function FleetCard({ result, index }: { result: ScanResult; index: number }) {
  const { harness } = result;
  const color = HARNESS_COLOR[harness.id];
  const counts: [string, number][] = [
    ['sessions', result.sessions.length],
    ['memories', result.memories.length],
    ['skills', result.skills.length],
    ['plugins', result.plugins.length],
    ['mcp', result.mcpServers.length],
  ];
  return (
    <div
      className="card rise"
      style={{
        animationDelay: `${200 + index * 60}ms`,
        borderLeft: `3px solid ${harness.detected ? color : 'var(--line)'}`,
        opacity: harness.detected ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={`dot ${harness.health}${harness.health === 'ok' ? ' pulse' : ''}`} />
        <h3 style={{ fontSize: 15.5 }}>{harness.name}</h3>
        <span style={{ flex: 1 }} />
        <span className="tag" style={{ color: harness.dispatch?.kind === 'cli' ? 'var(--teal)' : undefined }}>
          {harness.dispatch?.kind === 'cli' ? '⚡ CLI dispatch' : harness.detected ? 'manual' : 'not found'}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--tx-3)', margin: '7px 0 13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {harness.configPath || '—'}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {counts.map(([label, value]) => (
          <div key={label}>
            <div className="num" style={{ fontSize: 17, color: value > 0 ? 'var(--tx-1)' : 'var(--tx-3)' }}>{value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>{label}</div>
          </div>
        ))}
      </div>
      {harness.warnings.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
          ⚠ {harness.warnings[0]}
        </div>
      )}
    </div>
  );
}

export function Aviary({ overview }: { overview: Overview | null }) {
  const scan = useApi<ScanResult[]>('/api/scan');
  const detected = (scan.data ?? []).filter((result) => result.harness.detected);
  const missing = (scan.data ?? []).filter((result) => !result.harness.detected);

  return (
    <>
      <div className="view-head">
        <h1>Aviary</h1>
        <span className="sub">every harness on this machine, one view</span>
        <span className="spacer" />
        {overview && (
          <span className="sub" style={{ color: 'var(--teal)' }}>
            {overview.totals.costUsd > 0 ? `$${overview.totals.costUsd.toFixed(2)} tracked spend` : ''}
          </span>
        )}
      </div>
      <div className="view-body">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginBottom: 22 }}>
          {overview
            ? STATS.map((stat, index) => (
                <StatTile key={stat.key} index={index} label={stat.label} value={String(overview.totals[stat.key])} />
              ))
            : <div className="empty">connecting to the daemon…</div>}
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
          {[...detected, ...missing].map((result, index) => (
            <FleetCard key={result.harness.id} result={result} index={index} />
          ))}
        </div>
        {scan.error && <div className="empty" style={{ marginTop: 20 }}>daemon unreachable — start it with: npx birdeye up</div>}
      </div>
    </>
  );
}
