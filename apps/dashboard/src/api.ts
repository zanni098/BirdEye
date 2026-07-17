import { useCallback, useEffect, useRef, useState } from 'react';

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return response.json() as Promise<T>;
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `${path} → ${response.status}`);
  return data as T;
}

export function useApi<T>(path: string): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getJson<T>(path)
      .then((result) => { if (!cancelled) { setData(result); setError(null); } })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, reload };
}

export interface WsEvent {
  type: 'scan-updated' | 'task-updated' | 'task-output';
  taskId?: string;
  chunk?: string;
}

/** Live event stream from the daemon; reconnects with backoff. */
export function useWs(onEvent: (event: WsEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retryMs = 1000;
    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${location.host}/ws`);
      socket.onmessage = (message) => {
        try { handlerRef.current(JSON.parse(message.data as string) as WsEvent); } catch { /* not JSON — ignore */ }
      };
      socket.onopen = () => { retryMs = 1000; };
      socket.onclose = () => {
        if (closed) return;
        setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 15_000);
      };
    };
    connect();
    return () => { closed = true; socket?.close(); };
  }, []);
}
