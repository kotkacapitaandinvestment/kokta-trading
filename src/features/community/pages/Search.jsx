import { SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { Avatar, UserName } from '../components/Identity';
import PostCard from '../components/PostCard';
import { NewsLine, EventLine } from '../components/FeedCards';
import { timeAgo } from '../util';
import EmptyState from '../../../components/ui/EmptyState';

const SECTIONS = [
  ['markets', 'Markets'],
  ['users', 'Traders'],
  ['rooms', 'Communities'],
  ['ideas', 'Trade ideas'],
  ['posts', 'Posts'],
  ['messages', 'Messages'],
  ['news', 'News'],
  ['events', 'Events'],
];

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    if (q) api.get(`/community/search?q=${encodeURIComponent(q)}`).then(setData).catch(() => setData({ results: {} }));
  }, [q]);
  const r = data?.results ?? {};
  const empty = data && !Object.keys(r).length;
  const link = (m) => (m.conversation.kind === 'room' ? `/app/community/markets/${m.conversation.instrument}?tab=discussion&m=${m.id}` : m.conversation.kind === 'event' ? `/app/community/events/${m.conversation.eventId}?m=${m.id}` : `/app/community/messages/${m.conversation.id}?m=${m.id}`);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <h1 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Results for "{q}"</h1>
        <p className="mt-1 text-xs text-ink-400">Tip: search a market (EURUSD), a trader (@name) or a topic. To narrow it down, add <span className="font-mono">type:idea</span>, <span className="font-mono">author:name</span> or <span className="font-mono">date:last-7-days</span>.</p>
      </div>
      {!data && q ? <div className="h-40 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : null}
      {empty ? <EmptyState icon={SearchX} title={`Nothing found for "${q}"`} description="Try fewer words, check the spelling, or remove a filter." /> : null}
      {SECTIONS.filter(([k]) => r[k]?.length).map(([k, l]) => (
        <section key={k} className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
          <h2 className="border-b border-ink-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400 dark:border-ink-800">{l}</h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {k === 'markets' ? <div className="flex flex-wrap gap-2 p-4">{r.markets.map((m) => <Link key={m.symbol} to={`/app/community/markets/${m.symbol}`} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm hover:border-accent-400 dark:border-ink-700"><span className="font-mono font-semibold">{m.display}</span> <span className="text-xs text-ink-400">{m.name}</span></Link>)}</div> : null}
            {k === 'users' ? r.users.map((u) => <Link key={u.id} to={`/app/community/u/${u.username}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-800/40"><Avatar user={u} size={32} /><span><span className="block text-sm font-medium">{u.name}</span><span className="text-xs text-ink-400">@{u.username}</span></span></Link>) : null}
            {k === 'rooms' ? r.rooms.map((c) => <Link key={c.id} to={`/app/community/messages/${c.id}`} className="block px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-800/40"><span className="text-sm font-medium">{c.name}</span><span className="block text-xs text-ink-400">{c.description}</span></Link>) : null}
            {k === 'ideas' || k === 'posts' ? r[k].map((p) => <PostCard key={p.id} post={p} />) : null}
            {k === 'messages' ? r.messages.map((m) => <Link key={m.id} to={link(m)} className="block px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-800/40"><span className="flex items-center gap-2 text-xs"><UserName user={m.author} link={false} /> <span className="text-ink-400">in {m.conversation.name ?? 'a direct message'} · {timeAgo(m.createdAt)}</span></span><span className="mt-0.5 block text-sm text-ink-700 dark:text-ink-200">{m.body}</span></Link>) : null}
            {k === 'news' ? r.news.map((n) => <NewsLine key={n.id} news={n} />) : null}
            {k === 'events' ? r.events.map((e) => <EventLine key={e.id} event={e} />) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
