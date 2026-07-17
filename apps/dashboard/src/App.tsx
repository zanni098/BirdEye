import { useEffect, useState } from 'react';
import { postJson, useApi, useWs } from './api';
import type { Overview } from './types';
import { Aviary } from './views/Aviary';
import { MemoryGraphView } from './views/MemoryGraphView';
import { Missions } from './views/Missions';
import { Sessions } from './views/Sessions';
import { Arsenal } from './views/Arsenal';
import { Access } from './views/Access';
import { UsageView } from './views/UsageView';

const VIEWS = [
  { id: 'aviary', label: 'Aviary', key: '1' },
  { id: 'graph', label: 'Memory Graph', key: '2' },
  { id: 'missions', label: 'Missions', key: '3' },
  { id: 'sessions', label: 'Sessions', key: '4' },
  { id: 'arsenal', label: 'Arsenal', key: '5' },
  { id: 'access', label: 'Access', key: '6' },
  { id: 'usage', label: 'Usage', key: '7' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--amber)" strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" fill="var(--amber)" />
      <circle cx="18" cy="14" r="1.8" fill="var(--ink-0)" />
      <path d="M3 16 A13 13 0 0 1 16 3" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<ViewId>(() => (location.hash.slice(1) || 'aviary') as ViewId);
  const [scanning, setScanning] = useState(false);
  const overview = useApi<Overview>('/api/overview');

  useWs((event) => {
    if (event.type === 'scan-updated') overview.reload();
  });

  useEffect(() => {
    location.hash = view;
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const match = VIEWS.find((candidate) => candidate.key === event.key);
      if (match) setView(match.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rescan = async (): Promise<void> => {
    setScanning(true);
    try {
      await postJson('/api/scan');
      overview.reload();
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <LogoMark />
          <div>
            <div className="logo-name">BIRD<b>EYE</b></div>
            <div className="logo-sub">one hub · every bird</div>
          </div>
        </div>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            {item.label}
            <span className="k">{item.key}</span>
          </button>
        ))}
        <div className="sidebar-foot">
          <div className="scan-line">
            <span className={`dot ${scanning ? 'warnings pulse' : 'ok'}`} />
            {scanning ? 'scanning…' : `${overview.data?.totals.harnessesDetected ?? '–'} harnesses detected`}
          </div>
          <button onClick={rescan} disabled={scanning}>⟳ RESCAN</button>
        </div>
      </aside>
      <main className="main">
        {view === 'aviary' && <Aviary overview={overview.data} />}
        {view === 'graph' && <MemoryGraphView />}
        {view === 'missions' && <Missions harnesses={overview.data?.harnesses ?? []} />}
        {view === 'sessions' && <Sessions />}
        {view === 'arsenal' && <Arsenal />}
        {view === 'access' && <Access />}
        {view === 'usage' && <UsageView />}
      </main>
    </div>
  );
}
