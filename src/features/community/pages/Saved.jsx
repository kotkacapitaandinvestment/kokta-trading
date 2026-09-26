import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../../../lib/api';
import PostCard from '../components/PostCard';
import { NewsLine, EventLine } from '../components/FeedCards';
import { UserName } from '../components/Identity';

const TYPES = [
  [null, 'All'],
  ['post', 'Posts'],
  ['idea', 'Ideas'],
  ['news', 'News'],
  ['message', 'Messages'],
  ['event', 'Events'],
];

export default function Saved() {
  const [type, setType] = useState(null);
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    api.get(`/community/saved${type ? `?type=${type}` : ''}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [type]);
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="border-b border-ink-100 px-5 py-4 dark:border-ink-800">
        <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Saved</h1>
        <div className="mt-3 flex flex-wrap gap-1">{TYPES.map(([v, l]) => <button key={l} type="button" aria-pressed={type === v} onClick={() => setType(v)} className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', type === v ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>{l}</button>)}</div>
      </div>
      {items && !items.length ? <p className="px-6 py-16 text-center text-sm text-ink-400">Nothing saved yet. Use Save on posts, ideas, news, messages and events.</p> : null}
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {items?.map((s) => {
          if (s.type === 'post' || s.type === 'idea') return <PostCard key={`${s.type}${s.item.id}`} post={s.item} />;
          if (s.type === 'news') return <NewsLine key={`n${s.item.id}`} news={s.item} />;
          if (s.type === 'event') return <EventLine key={`e${s.item.id}`} event={s.item} />;
          if (s.type === 'message') {
            const c = s.item.conversation;
            const to = c.kind === 'room' ? `/app/community/markets/${c.instrument}?tab=discussion&m=${s.item.id}` : c.kind === 'event' ? `/app/community/events/${c.eventId}?m=${s.item.id}` : `/app/community/messages/${c.id}?m=${s.item.id}`;
            return <Link key={`m${s.item.id}`} to={to} className="block px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-800/40"><span className="text-xs"><UserName user={s.item.author} link={false} /> <span className="text-ink-400">in {c.name ?? 'a direct message'}</span></span><span className="mt-0.5 block text-sm text-ink-700 dark:text-ink-200">{s.item.body}</span></Link>;
          }
          return null;
        })}
      </div>
    </div>
  );
}
