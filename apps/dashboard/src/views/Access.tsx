import { useMemo, useState } from 'react';
import { getJson, postJson, useApi } from '../api';
import { HARNESS_COLOR, type ScanResult } from '../types';

export function Access() {
  const scan = useApi<ScanResult[]>('/api/scan');
  const vault = useApi<{ keys: string[] }>('/api/vault');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);

  const envRows = useMemo(() => {
    const rows = new Map<string, { key: string; holders: { harness: ScanResult['harness']['id']; sourceFile: string }[] }>();
    for (const result of scan.data ?? []) {
      for (const entry of result.envKeys) {
        const row = rows.get(entry.key) ?? { key: entry.key, holders: [] };
        row.holders.push({ harness: entry.harness, sourceFile: entry.sourceFile });
        rows.set(entry.key, row);
      }
    }
    return [...rows.values()].sort((a, b) => b.holders.length - a.holders.length);
  }, [scan.data]);

  const addSecret = async (): Promise<void> => {
    if (!newKey.trim() || !newValue) return;
    setBusy(true);
    try {
      await postJson('/api/vault', { key: newKey.trim(), value: newValue });
      setNewKey('');
      setNewValue('');
      vault.reload();
    } finally {
      setBusy(false);
    }
  };

  const removeSecret = async (key: string): Promise<void> => {
    await fetch(`/api/vault/${encodeURIComponent(key)}`, { method: 'DELETE' });
    vault.reload();
  };

  return (
    <>
      <div className="view-head">
        <h1>Access</h1>
        <span className="sub">who holds which credentials — and the one vault that replaces the sprawl</span>
      </div>
      <div className="view-body" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'start' }}>
        <div className="card rise" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 4px' }}>
            <h3 style={{ fontSize: 14, letterSpacing: '0.06em' }}>CREDENTIAL KEYS PER HARNESS</h3>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', marginTop: 2 }}>
              names only — BirdEye never reads credential values from harness configs
            </div>
          </div>
          <table className="data">
            <thead><tr><th>Key</th><th>Held by</th><th /></tr></thead>
            <tbody>
              {envRows.map((row) => (
                <tr key={row.key}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.key}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {row.holders.map((holder, index) => (
                        <span key={index} className="tag" style={{ color: HARNESS_COLOR[holder.harness] }} title={holder.sourceFile}>
                          {holder.harness}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row.holders.length > 1 && (
                      <span className="tag" style={{ color: 'var(--amber)', borderColor: 'rgba(245,165,36,0.4)' }}>
                        duplicated ×{row.holders.length}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {envRows.length === 0 && <div className="empty" style={{ border: 'none' }}>no credential keys discovered yet — run a scan</div>}
        </div>

        <div className="card rise" style={{ animationDelay: '120ms', borderColor: 'rgba(53,208,186,0.35)' }}>
          <h3 style={{ fontSize: 14, letterSpacing: '0.06em', color: 'var(--teal)' }}>🔐 BIRDEYE VAULT</h3>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--tx-3)', margin: '4px 0 14px' }}>
            AES-256-GCM at rest · served to harnesses via the MCP gateway (vault_get) · values never appear in this UI
          </div>
          {(vault.data?.keys ?? []).map((key) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="dot ok" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, flex: 1 }}>{key}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>••••••••</span>
              <button style={{ padding: '1px 8px', fontSize: 11 }} onClick={() => removeSecret(key)}>✕</button>
            </div>
          ))}
          {vault.data?.keys.length === 0 && (
            <div className="empty" style={{ padding: 18, marginBottom: 10 }}>vault is empty — store your first secret</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <input placeholder="KEY_NAME" value={newKey} onChange={(event) => setNewKey(event.target.value)} style={{ flex: 1, fontFamily: 'var(--font-mono)' }} />
            <input placeholder="value" type="password" value={newValue} onChange={(event) => setNewValue(event.target.value)} style={{ flex: 1 }} />
            <button className="primary" onClick={addSecret} disabled={busy || !newKey.trim() || !newValue}>＋</button>
          </div>
          <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--tx-3)', lineHeight: 1.7 }}>
            → agents fetch with <span style={{ color: 'var(--teal)' }}>vault_get</span> over MCP<br />
            → write into .env files with <span style={{ color: 'var(--teal)' }}>birdeye sync-env</span>
          </div>
        </div>
      </div>
    </>
  );
}
