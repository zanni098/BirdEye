import { useMemo, useState } from 'react';
import { useApi } from '../api';
import { HARNESS_COLOR, type HarnessKind, type ScanResult, type SessionRecord } from '../types';

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Sessions() {
  const scan = useApi<ScanResult[]>('/api/scan');
  const [filter, setFilter] = useState<HarnessKind | null>(null);
  const [query, setQuery] = useState('');

  const sessions = useMemo(() => {
    const all: SessionRecord[] = (scan.data ?? []).flatMap((result) => result.sessions);
    const needle = query.trim().toLowerCase();
    return all
      .filter((session) => (filter ? session.harness === filter : true))
      .filter((session) => (needle ? `${session.title} ${session.project ?? ''}`.toLowerCase().includes(needle) : true))
      .sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''));
  }, [scan.data, filter, query]);

  const presentKinds = useMemo(
    () => [...new Set((scan.data ?? []).filter((result) => result.sessions.length > 0).map((result) => result.harness.id))],
    [scan.data],
  );

  return (
    <>
      <div className="view-head">
        <h1>Sessions</h1>
        <span className="sub">{sessions.length} sessions across {presentKinds.length} harnesses</span>
        <span className="spacer" />
        <input placeholder="search…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ width: 200 }} />
      </div>
      <div className="view-body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setFilter(null)}
            style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: filter === null ? 'var(--amber)' : 'var(--tx-3)', background: 'transparent' }}
          >
            all
          </button>
          {presentKinds.map((kind) => (
            <button
              key={kind}
              onClick={() => setFilter(filter === kind ? null : kind)}
              style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', background: 'transparent',
                color: filter === null || filter === kind ? HARNESS_COLOR[kind] : 'var(--tx-3)',
                borderColor: filter === kind ? HARNESS_COLOR[kind] : 'var(--line)',
              }}
            >
              ● {kind}
            </button>
          ))}
        </div>
        <div className="card rise" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data">
            <thead>
              <tr><th style={{ width: 20 }} /><th>Session</th><th>Project</th><th>Msgs</th><th>Last active</th></tr>
            </thead>
            <tbody>
              {sessions.slice(0, 400).map((session) => (
                <tr key={`${session.harness}:${session.id}`}>
                  <td><span className="dot" style={{ background: HARNESS_COLOR[session.harness] }} title={session.harness} /></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{session.title}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>{session.harness} · {session.id}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--tx-2)' }}>{session.project ?? '—'}</td>
                  <td className="num" style={{ color: 'var(--tx-2)' }}>{session.messageCount ?? '—'}</td>
                  <td className="num" style={{ color: 'var(--tx-3)', fontSize: 12 }}>{relativeTime(session.lastActiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sessions.length === 0 && <div className="empty" style={{ border: 'none' }}>no sessions found</div>}
        </div>
      </div>
    </>
  );
}
