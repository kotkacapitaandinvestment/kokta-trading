import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Target, TrendingUp, Trophy } from 'lucide-react';
import { api } from '../../../lib/api';
import PostCard from '../components/PostCard';
import { Avatar } from '../components/Identity';
import EmptyState from '../../../components/ui/EmptyState';

// Community side of Goal Room: milestones traders chose to post, and last
// month's recognitions. Nothing here is ranked by money.
function Recognitions() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/goals/community/recognitions').then(setData).catch(() => setData(null));
  }, []);
  if (!data || (!data.champions.length && !data.improved.length)) return null;
  const group = (title, Icon, list, detail) =>
    list.length ? (
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400"><Icon className="h-3.5 w-3.5 text-accent-600" /> {title}</p>
        <ul className="flex flex-wrap gap-2">
          {list.map((r) => (
            <li key={r.user.id}>
              <Link to={`/app/community/u/${r.user.username}`} className="flex items-center gap-2 rounded-full border border-ink-100 py-1 pl-1 pr-3 text-sm hover:border-accent-400 dark:border-ink-800">
                <Avatar user={r.user} size={26} />
                <span className="font-medium text-ink-800 dark:text-ink-100">{r.user.name}</span>
                <span className="font-mono text-[11px] text-ink-400">{detail(r)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <section className="space-y-4 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
      <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{data.label} recognitions</h2>
      {group('Consistency champions', Award, data.champions, (r) => `${r.checkins} check-ins · ${r.adherence}%`)}
      {group('Most improved', TrendingUp, data.improved, (r) => `${r.from}% → ${r.to}%`)}
      <p className="text-[11px] leading-relaxed text-ink-400">{data.basis}</p>
    </section>
  );
}

export default function CommunityGoals() {
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const load = (before) =>
    api.get(`/community/feed?mode=latest&type=goals${before ? `&before=${encodeURIComponent(before)}` : ''}`).then((r) => {
      setItems((prev) => [...(before ? prev ?? [] : []), ...r.items]);
      setNext(r.next?.before ?? null);
    }).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">Goals</h1>
          <p className="mt-0.5 max-w-xl text-xs text-ink-500 dark:text-ink-400">Milestones from traders building their record: goals reached, streaks kept, badges earned. Discipline over reckless risk, consistency over one big win.</p>
        </div>
        <Link to="/app/goals" className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-medium text-white dark:bg-accent-500 dark:text-ink-950"><Target className="h-3.5 w-3.5" /> Your Goal Room</Link>
      </div>
      <Recognitions />
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {items?.map((it) => (it.type === 'post' ? <PostCard key={it.key} post={it.post} /> : null))}
      </div>
      {!items ? <div className="m-5 h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}
      {items && !items.length ? (
        <EmptyState
          size="section"
          icon={Trophy}
          title="No milestones posted yet"
          description="When traders share a goal reached, a streak or a badge from their Goal Room, it appears here. Yours could be the first."
          action={<Link to="/app/goals" className="rounded-lg bg-ink-900 px-3 py-2 text-xs font-medium text-white dark:bg-accent-500 dark:text-ink-950">Open your Goal Room</Link>}
        />
      ) : null}
      {next ? <button type="button" onClick={() => load(next)} className="w-full border-t border-ink-100 py-3 text-xs font-medium text-accent-700 hover:bg-ink-50 dark:border-ink-800 dark:text-accent-300 dark:hover:bg-ink-800/50">Load more</button> : null}
    </div>
  );
}
