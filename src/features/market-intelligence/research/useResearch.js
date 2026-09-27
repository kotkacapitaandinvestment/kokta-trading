import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';

// Loads the cached report for an instrument. If it is missing or stale, a
// refresh is requested; the server only runs new research when the cache has
// actually expired, so opening the page never triggers redundant runs.
export function useResearch(subject, { autoRefresh = true } = {}) {
  const [state, setState] = useState({ status: 'loading', report: null, freshness: null, history: [], error: null });
  const [steps, setSteps] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const pollRef = useRef(null);
  const subjectRef = useRef(subject);
  subjectRef.current = subject;

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const load = useCallback(async () => {
    const data = await api.get(`/research/${subject}`);
    if (subjectRef.current !== subject) return null;
    setState({ status: data.report ? 'ready' : 'empty', report: data.report, freshness: data.freshness, history: data.history ?? [], error: null });
    return data;
  }, [subject]);

  const pollUntilDone = useCallback(() => {
    stopPolling();
    setRefreshing(true);
    setNotice('This report is being updated. It’ll appear here when it’s ready.');
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get(`/research/${subject}`);
        if (!data.running) {
          stopPolling();
          setRefreshing(false);
          setNotice(null);
          setState({ status: data.report ? 'ready' : 'empty', report: data.report, freshness: data.freshness, history: data.history ?? [], error: null });
        }
      } catch {
        // keep polling
      }
    }, 5000);
  }, [subject]);

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      setRefreshing(true);
      setSteps([]);
      setNotice(null);
      try {
        const res = await fetch(`/api/research/${subject}/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        });
        if (res.status === 409) return pollUntilDone();
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setNotice(data.error ?? 'Couldn’t update the report. Try again in a few minutes.');
          setRefreshing(false);
          return;
        }
        const isStream = res.headers.get('content-type')?.includes('ndjson');
        if (!isStream) {
          const data = await res.json();
          if (data.report) setState((s) => ({ ...s, status: 'ready', report: data.report, freshness: data.freshness }));
          setRefreshing(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === 'step') {
              setSteps((prev) => {
                const i = prev.findIndex((s) => s.id === event.id);
                if (i === -1) return [...prev, event];
                const next = [...prev];
                next[i] = event;
                return next;
              });
            } else if (event.type === 'done') {
              if (subjectRef.current === subject) {
                setState((s) => ({ ...s, status: 'ready', report: event.report, freshness: event.freshness }));
                api.get(`/research/${subject}/history`).then((d) => subjectRef.current === subject && setState((s) => ({ ...s, history: d.history ?? s.history }))).catch(() => {});
              }
            } else if (event.type === 'error') {
              if (event.code === 'in_progress') return pollUntilDone();
              setNotice(event.message);
            }
          }
        }
        setRefreshing(false);
      } catch {
        setNotice('Couldn’t update right now. You’re seeing the last saved report.');
        setRefreshing(false);
      }
    },
    [subject, pollUntilDone],
  );

  useEffect(() => {
    let cancelled = false;
    stopPolling();
    setState({ status: 'loading', report: null, freshness: null, history: [], error: null });
    setSteps([]);
    setNotice(null);
    setRefreshing(false);
    load()
      .then((data) => {
        if (cancelled || !data) return;
        if (data.running) pollUntilDone();
        else if (autoRefresh && (!data.report || data.freshness?.stale)) refresh();
      })
      .catch((err) => !cancelled && setState({ status: 'error', report: null, freshness: null, history: [], error: err.message }));
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  return { ...state, steps, refreshing, notice, refresh };
}
