import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// One EventSource per tab. Pages declare the public channels they need with
// useChannels(); the stream reconnects (resuming from the last event id)
// when that set changes. The user's private channel is always included by
// the server.
const RealtimeContext = createContext(null);

const EVENT_TYPES = ['ready', 'message', 'message_updated', 'message_removed', 'reaction', 'typing', 'read', 'delivered', 'thread', 'poll', 'notification', 'conversation', 'sentiment', 'post', 'comment'];

export function RealtimeProvider({ children }) {
  const listeners = useRef(new Map());
  const counts = useRef(new Map());
  const lastId = useRef(null);
  const [channelKey, setChannelKey] = useState('community');
  const [status, setStatus] = useState('connecting');

  const recompute = useCallback(() => {
    const key = ['community', ...[...counts.current.keys()].filter((c) => c !== 'community')].sort().join(',');
    setChannelKey((prev) => (prev === key ? prev : key));
  }, []);

  useEffect(() => {
    let es = null;
    const timer = setTimeout(() => {
      const url = `/api/realtime/stream?channels=${encodeURIComponent(channelKey)}${lastId.current ? `&lastEventId=${lastId.current}` : ''}`;
      es = new EventSource(url);
      es.onopen = () => setStatus('open');
      es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (e) => {
          if (e.lastEventId) lastId.current = e.lastEventId;
          let data = {};
          try {
            data = JSON.parse(e.data);
          } catch {
            /* heartbeat or malformed */
          }
          listeners.current.get(type)?.forEach((fn) => fn(data));
        });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      es?.close();
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
