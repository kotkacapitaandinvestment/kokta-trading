import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Live updates by short check-ins: each visible tab asks the server what's
// new on its channels every few seconds (one quick request each time), and
// stops asking while it's hidden, catching up the moment it's shown again.
// Pages declare the public channels they need with useChannels(); the user's
// private channel is always included by the server.
const RealtimeContext = createContext(null);

const FOCUSED_MS = 4000;
const BACKGROUND_MS = 15000; // visible, but the window isn't the active one

export function RealtimeProvider({ children }) {
  const listeners = useRef(new Map());
  const counts = useRef(new Map());
  const cursor = useRef(null);
  const [channelKey, setChannelKey] = useState('community');
  const [status, setStatus] = useState('connecting');

  const recompute = useCallback(() => {
    const key = ['community', ...[...counts.current.keys()].filter((c) => c !== 'community')].sort().join(',');
    setChannelKey((prev) => (prev === key ? prev : key));
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer = null;
    let inFlight = false;
    let failures = 0;
    const schedule = (ms) => {
      if (stopped || timer) return;
      timer = setTimeout(check, ms);
    };
    async function check() {
      timer = null;
      if (stopped || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const r = await fetch(`/api/realtime/poll?channels=${encodeURIComponent(channelKey)}${cursor.current ? `&after=${cursor.current}` : ''}`, { credentials: 'include', cache: 'no-store' });
        if (r.status === 401 || r.status === 403) {
          setStatus('closed');
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        cursor.current = j.cursor;
        failures = 0;
        setStatus('open');
        for (const e of j.events) listeners.current.get(e.type)?.forEach((fn) => fn(e.data));
        schedule(j.more ? 0 : document.hasFocus() ? FOCUSED_MS : BACKGROUND_MS);
      } catch {
        failures += 1;
        setStatus('reconnecting');
        schedule(Math.min(30000, 2000 * 2 ** Math.min(failures, 4)));
      } finally {
        inFlight = false;
      }
    }
    // Shown again (or the window comes forward): catch up straight away.
    const wake = () => {
      if (document.hidden || stopped) return;
      clearTimeout(timer);
      timer = null;
      check();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    schedule(120);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [channelKey]);

  const subscribe = useCallback((type, fn) => {
    if (!listeners.current.has(type)) listeners.current.set(type, new Set());
    listeners.current.get(type).add(fn);
    return () => listeners.current.get(type)?.delete(fn);
  }, []);

  const addChannels = useCallback(
    (list) => {
      for (const c of list) counts.current.set(c, (counts.current.get(c) ?? 0) + 1);
      recompute();
      return () => {
        for (const c of list) {
          const n = (counts.current.get(c) ?? 1) - 1;
          if (n <= 0) counts.current.delete(c);
          else counts.current.set(c, n);
        }
        recompute();
      };
    },
    [recompute],
  );

  return <RealtimeContext.Provider value={{ subscribe, addChannels, status }}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeStatus() {
  return useContext(RealtimeContext)?.status ?? 'closed';
}

// Calls handler(data) for each event of `type`. The handler can change
// between renders without resubscribing.
export function useRealtime(type, handler) {
  const ctx = useContext(RealtimeContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => ctx?.subscribe(type, (d) => ref.current(d)), [ctx, type]);
}

export function useChannels(channels) {
  const ctx = useContext(RealtimeContext);
  const key = channels.filter(Boolean).sort().join(',');
  useEffect(() => (key ? ctx?.addChannels(key.split(',')) : undefined), [ctx, key]);
}
