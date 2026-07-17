import { useMemo } from 'react';
import { useApi } from '../api';
import { HARNESS_COLOR, type ScanResult } from '../types';

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

/** Labeled-row horizontal bar: identity via row label (never color alone), thin mark, rounded data end. */
function BarRow({ label, color, value, max, display }: {
  label: string; color: string; value: number; max: number; display: string;
}) {
  const width = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 70px', gap: 12, alignItems: 'center', padding: '7px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" style={{ background: color }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--tx-2)' }}>{label}</span>
      </div>
      <div style={{ height: 14, background: 'var(--ink-1)', borderRadius: 4, overflow: 'hidden' }} title={`${label}: ${display}`}>
        <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: '0 4px 4px 0', opacity: 0.85 }} />
      </div>
      <div className="num" style={{ fontSize: 12.5, color: 'var(--tx-1)', textAlign: 'right' }}>{display}</div>
    </div>
  );
}

export function UsageView() {
  const scan = useApi<ScanResult[]>('/api/scan');

  const { tokenRows, sessionRows, unknown, totalCost, totalTokens } = useMemo(() => {
    const detected = (scan.data ?? []).filter((result) => result.harness.detected);
    const withTokens = detected.filter((result) => (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0) > 0);
    const withSessions = detected.filter((result) => (result.usage.sessions ?? result.sessions.length) > 0);
    return {
      tokenRows: withTokens
        .map((result) => ({
          harness: result.harness,
          tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
          cost: result.usage.costUsd,
        }))
        .sort((a, b) => b.tokens - a.tokens),
      sessionRows: withSessions
        .map((result) => ({ harness: result.harness, sessions: result.usage.sessions ?? result.sessions.length }))
        .sort((a, b) => b.sessions - a.sessions),
      unknown: detected.filter((result) => result.usage.source === 'unknown'),
      totalCost: detected.reduce((sum, result) => sum + (result.usage.costUsd ?? 0), 0),
      totalTokens: detected.reduce((sum, result) => sum + (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0), 0),
    };
  }, [scan.data]);

  const maxTokens = tokenRows[0]?.tokens ?? 0;
  const maxSessions = sessionRows[0]?.sessions ?? 0;

  return (
    <>
      <div className="view-head">
        <h1>Usage</h1>
        <span className="sub">what each harness actually logs — no guesses, unknowns stay unknown</span>
      </div>
      <div className="view-body">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
          <div className="card rise" style={{ padding: '16px 20px' }}>
            <div className="num" style={{ fontSize: 30, color: 'var(--amber)' }}>${totalCost.toFixed(2)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>tracked spend · all time</div>
          </div>
          <div className="card rise" style={{ padding: '16px 20px', animationDelay: '60ms' }}>
            <div className="num" style={{ fontSize: 30 }}>{formatTokens(totalTokens)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>tokens logged</div>
          </div>
          <div className="card rise" style={{ padding: '16px 20px', animationDelay: '120ms' }}>
            <div className="num" style={{ fontSize: 30, color: 'var(--tx-2)' }}>{unknown.length}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tx-3)' }}>harnesses with no usage log</div>
          </div>
        </div>

        {tokenRows.length > 0 && (
          <div className="card rise" style={{ marginBottom: 18, animationDelay: '160ms' }}>
            <h3 style={{ fontSize: 13, letterSpacing: '0.08em', marginBottom: 10 }}>TOKENS BY HARNESS</h3>
            {tokenRows.map((row) => (
              <BarRow
                key={row.harness.id}
                label={row.harness.id}
                color={HARNESS_COLOR[row.harness.id]}
                value={row.tokens}
                max={maxTokens}
                display={`${formatTokens(row.tokens)}${row.cost !== null ? ` · $${row.cost.toFixed(2)}` : ''}`}
              />
            ))}
          </div>
        )}

        {sessionRows.length > 0 && (
          <div className="card rise" style={{ marginBottom: 18, animationDelay: '220ms' }}>
            <h3 style={{ fontSize: 13, letterSpacing: '0.08em', marginBottom: 10 }}>SESSIONS BY HARNESS</h3>
            {sessionRows.map((row) => (
              <BarRow
                key={row.harness.id}
                label={row.harness.id}
                color={HARNESS_COLOR[row.harness.id]}
                value={row.sessions}
                max={maxSessions}
                display={String(row.sessions)}
              />
            ))}
          </div>
        )}

        {unknown.length > 0 && (
          <div className="card rise" style={{ animationDelay: '280ms' }}>
            <h3 style={{ fontSize: 13, letterSpacing: '0.08em', marginBottom: 8, color: 'var(--tx-2)' }}>NOT LOGGED LOCALLY</h3>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--tx-3)', lineHeight: 1.8 }}>
              {unknown.map((result) => result.harness.name).join(' · ')} don't write usage data to disk —
              BirdEye reports <span style={{ color: 'var(--tx-2)' }}>unknown</span> instead of inventing numbers.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
