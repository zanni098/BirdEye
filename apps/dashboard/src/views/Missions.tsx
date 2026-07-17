import { useEffect, useRef, useState } from 'react';
import { postJson, useApi, useWs } from '../api';
import { HARNESS_COLOR, type Harness, type HarnessKind, type TaskRecord } from '../types';

const STATUS_COLOR: Record<TaskRecord['status'], string> = {
  todo: 'var(--tx-3)', claimed: 'var(--blue)', running: 'var(--amber)',
  done: 'var(--green)', failed: 'var(--red)',
};

function TaskCard({ task, active, onClick }: { task: TaskRecord; active: boolean; onClick: () => void }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: '13px 16px', cursor: 'pointer',
        borderLeft: `3px solid ${STATUS_COLOR[task.status]}`,
        background: active ? 'var(--ink-3)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`dot ${task.status === 'running' ? 'warnings pulse' : ''}`} style={{ background: STATUS_COLOR[task.status] }} />
        <strong style={{ fontSize: 13.5, flex: 1 }}>{task.title}</strong>
        <span className="tag" style={{ color: STATUS_COLOR[task.status] }}>{task.status}</span>
      </div>
      {task.assignedHarness && (
        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: HARNESS_COLOR[task.assignedHarness] }}>
          → {task.assignedHarness}
        </div>
      )}
    </div>
  );
}

export function Missions({ harnesses }: { harnesses: Harness[] }) {
  const tasks = useApi<TaskRecord[]>('/api/tasks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [briefing, setBriefing] = useState('');
  const [dispatchTarget, setDispatchTarget] = useState<HarnessKind | ''>('');
  const [liveOutput, setLiveOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const terminalRef = useRef<HTMLPreElement>(null);

  const selected = tasks.data?.find((task) => task.id === selectedId) ?? null;

  useWs((event) => {
    if (event.type === 'task-updated') tasks.reload();
    if (event.type === 'task-output' && event.taskId === selectedId && event.chunk) {
      setLiveOutput((current) => current + event.chunk);
    }
  });

  useEffect(() => {
    setLiveOutput(selected?.runs[selected.runs.length - 1]?.output ?? '');
  }, [selectedId]);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [liveOutput]);

  const createTask = async (): Promise<void> => {
    if (!title.trim() || !briefing.trim()) return;
    setBusy(true);
    try {
      const task = await postJson<TaskRecord>('/api/tasks', { title, briefing });
      setTitle('');
      setBriefing('');
      setSelectedId(task.id);
      tasks.reload();
    } finally {
      setBusy(false);
    }
  };

  const dispatch = async (): Promise<void> => {
    if (!selected || !dispatchTarget) return;
    setBusy(true);
    setNotice(null);
    try {
      await postJson(`/api/tasks/${selected.id}/dispatch`, { harness: dispatchTarget });
      setLiveOutput('');
      tasks.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const cliHarnesses = harnesses.filter((harness) => harness.detected && harness.dispatch?.kind === 'cli');
  const manualHarnesses = harnesses.filter((harness) => harness.detected && harness.dispatch?.kind !== 'cli');

  return (
    <>
      <div className="view-head">
        <h1>Missions</h1>
        <span className="sub">one board, every harness — write once, dispatch anywhere</span>
      </div>
      <div className="view-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card rise" style={{ borderColor: 'var(--line-bright)' }}>
            <h3 style={{ fontSize: 13, marginBottom: 10, color: 'var(--teal)', letterSpacing: '0.08em' }}>NEW MISSION</h3>
            <input
              placeholder="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <textarea
              placeholder="briefing — what should the agent do?"
              value={briefing}
              onChange={(event) => setBriefing(event.target.value)}
              rows={3}
              style={{ width: '100%', marginBottom: 8, resize: 'vertical' }}
            />
            <button className="primary" onClick={createTask} disabled={busy || !title.trim() || !briefing.trim()}>
              + ADD TO BOARD
            </button>
          </div>
          {(tasks.data ?? []).slice().reverse().map((task) => (
            <TaskCard key={task.id} task={task} active={task.id === selectedId} onClick={() => setSelectedId(task.id)} />
          ))}
          {tasks.data?.length === 0 && <div className="empty">no missions yet — write one above</div>}
        </div>

        <div style={{ position: 'sticky', top: 0 }}>
          {selected ? (
            <div className="card rise">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <h3 style={{ fontSize: 16, flex: 1 }}>{selected.title}</h3>
                <span className="tag" style={{ color: STATUS_COLOR[selected.status] }}>{selected.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--tx-2)', whiteSpace: 'pre-wrap', marginBottom: 14 }}>{selected.briefing}</div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <select value={dispatchTarget} onChange={(event) => setDispatchTarget(event.target.value as HarnessKind)}>
                  <option value="">choose harness…</option>
                  {cliHarnesses.map((harness) => (
                    <option key={harness.id} value={harness.id}>⚡ {harness.name}</option>
                  ))}
                  {manualHarnesses.map((harness) => (
                    <option key={harness.id} value={harness.id}>✋ {harness.name} (manual)</option>
                  ))}
                </select>
                <button
                  className="primary"
                  onClick={dispatch}
                  disabled={busy || !dispatchTarget || selected.status === 'running'}
                >
                  ▸ DISPATCH
                </button>
                <button onClick={() => navigator.clipboard.writeText(selected.briefing)}>⧉ copy briefing</button>
              </div>
              {notice && <div style={{ color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{notice}</div>}

              <pre
                ref={terminalRef}
                style={{
                  background: 'var(--ink-0)', border: '1px solid var(--line)', borderRadius: 8,
                  padding: 14, marginTop: 8, height: 320, overflow: 'auto',
                  fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
                  color: 'var(--tx-2)', whiteSpace: 'pre-wrap',
                }}
              >
                {liveOutput || '── no run output yet — dispatch to a ⚡ harness to stream it here ──'}
                {selected.status === 'running' && <span style={{ color: 'var(--amber)' }}>▌</span>}
              </pre>
            </div>
          ) : (
            <div className="empty" style={{ marginTop: 4 }}>select a mission to see its briefing and live run output</div>
          )}
        </div>
      </div>
    </>
  );
}
