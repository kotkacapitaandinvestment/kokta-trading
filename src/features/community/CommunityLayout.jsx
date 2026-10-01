import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { PageLoading } from '../../lib/lazyPage';
import { Bookmark, BookOpen, Flame, Globe2, Lightbulb, CalendarDays, MessagesSquare, Radio, Search, Sparkles, Trophy, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useCommunity } from './CommunityContext';
import { useRealtimeStatus } from './realtime';
import Onboarding from './pages/Onboarding';
import EmptyState from '../../components/ui/EmptyState';

const NAV = [
  { to: '/app/community', label: 'For you', icon: Sparkles, end: true },
  { to: '/app/community/markets', label: 'Markets', icon: Globe2 },
  { to: '/app/community/ideas', label: 'Trade ideas', icon: Lightbulb },
  { to: '/app/community/goals', label: 'Goals', icon: Trophy },
  { to: '/app/community/events', label: 'Events', icon: CalendarDays },
  { to: '/app/community/following', label: 'Following', icon: Users },
  { to: '/app/community/messages', label: 'Messages', icon: MessagesSquare, badge: 'messages' },
];

export function Rail() {
  const [live, setLive] = useState(null);
  const [trending, setTrending] = useState(null);
  useEffect(() => {
    const load = () => {
      api.get('/community/live').then(setLive).catch(() => {});
      api.get('/community/trending').then(setTrending).catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <aside className="hidden w-80 shrink-0 space-y-4 xl:block">
      <section className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-50"><Radio className="h-4 w-4 text-loss-500" /> Live now</h2>
        {!live ? <p className="mt-3 text-xs text-ink-400">Loading…</p> : null}
        {live && !live.rooms.length && !live.events.length ? <EmptyState size="inline" icon={Radio} title="Quiet right now" description="Market rooms appear here when traders are talking, and releases when they’re about to drop." /> : null}
        <ul className="mt-2 space-y-1">
          {live?.events.map((e) => (
            <li key={e.id}><Link to={`/app/community/events/${e.id}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800"><span className="mr-1.5 rounded bg-loss-500 px-1 text-[10px] font-semibold uppercase text-white">{e.phase === 'live' ? 'Live' : 'Soon'}</span>{e.title}</Link></li>
          ))}
          {live?.rooms.map((r) => (
            <li key={r.id}>
              <Link to={r.kind === 'room' ? `/app/community/markets/${r.instrument}` : r.kind === 'event' ? `/app/community/events/${r.eventId}` : `/app/community/messages/${r.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
                <span className="truncate font-medium text-ink-800 dark:text-ink-100">{r.display}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{r.people} chatting</span>
              </Link>
            </li>
          ))}
        </ul>
        {live?.news?.length ? (
          <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
            <p className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">Just in</p>
            {live.news.slice(0, 3).map((n) => <Link key={n.id} to={`/app/community/news/${n.id}`} className="mt-1.5 block text-xs leading-snug text-ink-700 hover:underline dark:text-ink-200">{n.headline}</Link>)}
          </div>
        ) : null}
      </section>
      <section className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-50"><Flame className="h-4 w-4 text-accent-600" /> Trending now</h2>
        {trending && !trending.markets.length ? <p className="mt-3 text-xs text-ink-400">Not enough activity yet to show what’s trending.</p> : null}
        <ol className="mt-2 space-y-1">
          {trending?.markets.map((m, i) => (
            <li key={m.symbol}>
              <Link to={`/app/community/markets/${m.symbol}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-50 dark:hover:bg-ink-800">
                <span className="w-4 text-right font-mono text-xs text-ink-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-semibold text-ink-900 dark:text-ink-50">{m.display}</span>
                  <span className="text-[11px] text-ink-400">{[m.participants24h ? `${m.participants24h} traders` : null, m.posts24h ? `${m.posts24h} posts` : null, m.eventToday ? 'event today' : null].filter(Boolean).join(' · ') || 'Bigger move than usual'}</span>
                </span>
                {m.changePct != null ? <span className={clsx('font-mono text-xs tabular-nums', m.changePct > 0 ? 'text-profit-600 dark:text-profit-400' : m.changePct < 0 ? 'text-loss-500' : 'text-ink-400')}>{m.changePct > 0 ? '+' : ''}{m.changePct}%</span> : null}
              </Link>
            </li>
          ))}
        </ol>
        {trending?.topics?.length ? <p className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3 text-xs dark:border-ink-800">{trending.topics.map((t) => <span key={t.topic} className="text-ink-500">#{t.topic}</span>)}</p> : null}
        {trending ? <p className="mt-3 text-[10px] leading-relaxed text-ink-400">{trending.basis}</p> : null}
      </section>
      <p className="px-2 text-[11px] leading-relaxed text-ink-400">
        Community content is traders' opinion, not investment advice. <Link to="/app/community/guidelines" className="underline">Guidelines</Link>
      </p>
    </aside>
  );
}

export default function CommunityLayout() {
  const { loading, needsProfile, unread } = useCommunity();
  const status = useRealtimeStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const fullBleed = /\/community\/(messages|markets\/[^/]+|events\/[^/]+)/.test(location.pathname);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  if (needsProfile) return <Onboarding />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Community" className="-mx-1 flex gap-1 overflow-x-auto px-1 scrollbar-thin">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx('relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-600 hover:bg-white dark:text-ink-300 dark:hover:bg-ink-800')}>
              <n.icon className="h-4 w-4" /> {n.label}
              {n.badge && unread?.[n.badge] ? <span className="ml-0.5 min-w-[1.1rem] rounded-full bg-loss-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread[n.badge] > 99 ? '99+' : unread[n.badge]}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/app/community/search?q=${encodeURIComponent(q.trim())}`); }} className="relative flex-1 lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets, traders, ideas…" className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" aria-label="Search Community" />
          </form>
          <Link to="/app/community/saved" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-white dark:text-ink-400 dark:hover:bg-ink-800" aria-label="Saved" title="Saved"><Bookmark className="h-4 w-4" /></Link>
          <Link to="/app/community/guidelines" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-white dark:text-ink-400 dark:hover:bg-ink-800" aria-label="Community Guidelines" title="Community Guidelines"><BookOpen className="h-4 w-4" /></Link>
          <span role="img" className={clsx('h-2 w-2 rounded-full', status === 'open' ? 'bg-profit-500' : 'bg-amber-500')} title={status === 'open' ? 'Live updates connected' : 'Reconnecting live updates'} aria-label={status === 'open' ? 'Live updates connected' : 'Reconnecting live updates'} />
        </div>
      </div>
      {fullBleed ? <Suspense fallback={<PageLoading />}><Outlet /></Suspense> : (
        <div className="flex gap-6">
          <div className="min-w-0 flex-1"><Suspense fallback={<PageLoading />}><Outlet /></Suspense></div>
          <Rail />
        </div>
      )}
    </div>
  );
}
