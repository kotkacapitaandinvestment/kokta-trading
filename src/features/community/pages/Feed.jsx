import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowUp, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useRealtime } from '../realtime';
import { useCommunity } from '../CommunityContext';
import PostCard from '../components/PostCard';
import Composer from '../components/Composer';
import { NewsLine, EventLine, MoveLine, InsightLine } from '../components/FeedCards';

const MODES = [
  ['foryou', 'For you'],
  ['latest', 'Latest'],
  ['trending', 'Trending'],
];
const TYPES = [
  ['all', 'All'],
  ['markets', 'Markets'],
  ['ideas', 'Ideas'],
  ['news', 'News'],
  ['events', 'Events'],
  ['posts', 'Posts'],
];

export function FeedItem({ item }) {
  if (item.type === 'post') return <PostCard post={item.post} reason={item.reason} />;
  if (item.type === 'news') return <NewsLine news={item.news} reason={item.reason} />;
  if (item.type === 'event') return <div><p className="px-5 pt-3 text-[11px] text-ink-400">{item.reason}</p><EventLine event={item.event} /></div>;
  if (item.type === 'move') return <MoveLine move={item.move} reason={item.reason} />;
  if (item.type === 'insight') return <InsightLine insight={item.insight} reason={item.reason} />;
  return null;
}

// Shared feed: For You (with mode + type controls) or Following.
export default function Feed({ fixedMode = null, showComposer = true, emptyText }) {
  const { profile } = useCommunity();
  const [mode, setMode] = useState(fixedMode ?? 'foryou');
  const [type, setType] = useState('all');
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(0);
  const sentinel = useRef(null);

  const load = useCallback(async (cursor = null) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ mode, type, ...(cursor?.before ? { before: cursor.before } : {}), ...(cursor?.offset ? { offset: String(cursor.offset) } : {}) });
      const r = await api.get(`/community/feed?${qs}`);
      setItems((prev) => (cursor ? [...(prev ?? []), ...r.items.filter((i) => !(prev ?? []).some((p) => p.key === i.key))] : r.items));
      setNext(r.next);
      if (!cursor) setFresh(0);
    } finally {
      setBusy(false);
    }
  }, [mode, type]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && next && !busy && load(next), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [next, busy, load]);

  // New posts arrive as a banner rather than shifting what you're reading.
  useRealtime('post', (d) => d.authorId !== profile?.id && setFresh((n) => n + 1));

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      {showComposer ? <div className="border-b border-ink-100 dark:border-ink-800"><Composer compact onCreated={(post) => setItems((prev) => [{ key: `post:${post.id}`, type: 'post', post, reason: 'Your post' }, ...(prev ?? [])])} /></div> : null}
      {!fixedMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
          <div className="flex gap-1 rounded-lg bg-ink-50 p-0.5 dark:bg-ink-800" role="tablist" aria-label="Feed">
            {MODES.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={mode === v} onClick={() => setMode(v)} className={clsx('rounded-md px-2.5 py-1 text-xs font-medium', mode === v ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500')}>{l}</button>)}
          </div>
          <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Show">
            {TYPES.map(([v, l]) => <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)} className={clsx('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', type === v ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>{l}</button>)}
          </div>
        </div>
      ) : null}
      {mode === 'foryou' && !fixedMode ? <p className="border-b border-ink-100 px-5 py-2 text-[11px] text-ink-400 dark:border-ink-800">Ranked by what you follow, how recent it is and real engagement. Each item says why it's here.</p> : null}
      {fresh ? (
        <button type="button" onClick={() => { load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex w-full items-center justify-center gap-1.5 border-b border-ink-100 bg-accent-500/10 py-2 text-xs font-medium text-accent-800 dark:border-ink-800 dark:text-accent-300">
          <ArrowUp className="h-3.5 w-3.5" /> {fresh} new post{fresh === 1 ? '' : 's'}
        </button>
      ) : null}
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {!items ? [0, 1, 2].map((i) => <div key={i} className="m-5 h-24 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />) : null}
        {items && !items.length ? <p className="px-6 py-16 text-center text-sm text-ink-400">{emptyText ?? 'Nothing here yet. Follow markets and traders, or start the conversation.'}</p> : null}
        {items?.map((it) => <FeedItem key={it.key} item={it} />)}
      </div>
      <div ref={sentinel} className="py-4 text-center text-xs text-ink-400">{busy && items ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : items?.length && !next ? 'You are all caught up.' : null}</div>
    </div>
  );
}
