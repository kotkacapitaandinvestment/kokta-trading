import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Copy, ExternalLink, Flag, Lock, MessagesSquare, PenLine, Pin, PinOff, Plus, Route, Share2, Target, Trash2, Trophy, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import InfoTip from '../../components/ui/InfoTip';
import Menu from '../community/components/Menu';
import { api } from '../../lib/api';
import CheckInPanel from './CheckInPanel';
import GoalForm from './GoalForm';
import ShareStudio from './ShareStudio';
import { ICONS, formatDay, localToday } from './card';
import { confirmDialog, promptDialog, toast } from '../../lib/dialogs';
import EmptyState from '../../components/ui/EmptyState';

const TYPE_ICON = { goal_created: 'target', goal_locked: 'lock', goal_reached: 'trophy', goal_completed: 'trophy', streak: 'flame', discipline_streak: 'shield', badge: 'medal', checkins: 'calendar', learning: 'book', backtests: 'history', monthly_review: 'calendar', monthly_champion: 'award', most_improved: 'trending' };
const STATUS = {
  draft: ['Draft', 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'],
  active: ['In progress', 'bg-ink-900 text-white dark:bg-ink-700'],
  achieved: ['Target hit', 'bg-accent-500 text-ink-950'],
  completed: ['Complete', 'bg-accent-500 text-ink-950'],
  missed: ['Missed', 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'],
  abandoned: ['Abandoned', 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500'],
};

function SelfReported() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400" title="From your own check-ins and journal. Not verified with a broker.">
      <PenLine className="h-3 w-3" /> Self-reported
    </span>
  );
}

function Tile({ label, value, sub, info }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-3.5 dark:border-ink-800 dark:bg-ink-900">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}{info ? <InfoTip label={label}>{info}</InfoTip> : null}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{value}</p>
      {sub ? <p className="text-xs text-ink-400">{sub}</p> : null}
    </div>
  );
}

const money = (v, ccy) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v} ${ccy}`;
  }
};

function GoalCard({ goal, currency, achievements, onAction, onShare }) {
  const p = goal.progress;
  const [label, tone] = STATUS[goal.status] ?? STATUS.draft;
  const profit = goal.metric === 'net_profit';
  const shareable = achievements.find((a) => a.goalId === goal.id && a.type === 'goal_completed') ?? achievements.find((a) => a.goalId === goal.id && a.type === 'goal_reached') ?? achievements.find((a) => a.goalId === goal.id && a.type === 'goal_locked');
  const running = ['active', 'achieved'].includes(goal.status);
  return (
    <article className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tone)}>{label}</span>
            <span className="text-[11px] text-ink-400">{goal.metricLabel}</span>
            {profit ? <span className="inline-flex items-center gap-1 text-[11px] text-ink-400"><Lock className="h-3 w-3" /> Private</span> : null}
          </div>
          <h3 className="mt-1.5 text-base font-semibold text-ink-900 dark:text-ink-50">{goal.title}</h3>
          <p className="text-xs text-ink-500 dark:text-ink-400">{profit ? `Net profit of ${money(goal.target, currency)} in ${goal.periodDays} days` : goal.describe} · {goal.status === 'draft' ? `starts ${formatDay(goal.startDate, { day: 'numeric', month: 'short' })}` : `${formatDay(goal.startDate, { day: 'numeric', month: 'short' })} to ${formatDay(goal.endDate, { day: 'numeric', month: 'short' })}`}</p>
        </div>
        <Menu
          items={[
            goal.status === 'draft' ? { label: 'Edit', icon: PenLine, onClick: () => onAction('edit', goal) } : null,
            goal.status === 'draft' ? { label: 'Delete draft', icon: Trash2, danger: true, onClick: () => onAction('delete', goal) } : null,
            goal.status !== 'draft' ? { label: 'Progress story', icon: Route, onClick: () => onShare('journey', goal.id) } : null,
            running ? { label: 'Abandon goal', icon: Flag, danger: true, onClick: () => onAction('abandon', goal) } : null,
          ]}
        />
      </div>

      {goal.status !== 'draft' ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-mono tabular-nums text-ink-900 dark:text-ink-50">{profit ? `${money(p.value, currency)} of ${money(goal.target, currency)}` : `${p.value} of ${goal.target} ${goal.unit}`}</span>
            <span className="font-mono text-xs tabular-nums text-ink-500">{p.pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title} progress`}>
            <div className={clsx('h-full rounded-full transition-[width] duration-700', p.reached ? 'bg-accent-500' : 'bg-ink-900 dark:bg-accent-600')} style={{ width: `${p.pct}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
            {running ? <span>{p.daysLeft ? `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left` : 'Last day'}</span> : null}
            {p.adherence != null ? <span>Discipline in this goal: {p.adherence}%</span> : null}
            <SelfReported />
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">Lock it to commit. Once locked, the target and period can’t change.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {goal.status === 'draft' ? <Button size="sm" icon={Lock} onClick={() => onAction('lock', goal)}>Lock goal</Button> : null}
        {shareable && goal.status !== 'draft' ? <Button size="sm" variant={['achieved', 'completed'].includes(goal.status) ? 'primary' : 'secondary'} icon={Share2} onClick={() => onShare('achievement', shareable.id)}>{['achieved', 'completed'].includes(goal.status) ? 'Share achievement' : 'Share goal'}</Button> : null}
        {goal.status !== 'draft' ? <Button size="sm" variant="ghost" icon={Route} onClick={() => onShare('journey', goal.id)}>Progress story</Button> : null}
      </div>
    </article>
  );
}

function AchievementRow({ a, onShare, onPin, onPost, posting }) {
  const Icon = ICONS[TYPE_ICON[a.type]] ?? ICONS.medal;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{a.title}{a.type.startsWith('goal_') && a.data?.goal?.title ? <span className="font-normal text-ink-500 dark:text-ink-400"> · {a.data.goal.title}</span> : null}</p>
        <p className="text-xs text-ink-400">{formatDay(new Date(a.earnedAt).toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}{a.pinned ? ' · pinned' : ''}{a.postId ? ' · in Community' : ''}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={() => onShare('achievement', a.id)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800" aria-label={`Share ${a.title}`}><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Share</span></button>
        <Menu
          items={[
            a.postId ? { label: 'View in Community', icon: MessagesSquare, onClick: () => window.location.assign(`/app/community/posts/${a.postId}`) } : a.postable || a.type !== 'goal_created' ? { label: posting ? 'Posting…' : 'Post to Community', icon: MessagesSquare, onClick: () => onPost(a) } : null,
            { label: a.pinned ? 'Unpin from profile' : 'Pin to profile', icon: a.pinned ? PinOff : Pin, onClick: () => onPin(a) },
          ]}
        />
      </div>
    </li>
  );
}

export default function GoalRoom() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [share, setShare] = useState(null);
  const [earned, setEarned] = useState([]);
  const [month, setMonth] = useState(null);
  const [review, setReview] = useState(null);
  const [links, setLinks] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [posting, setPosting] = useState(null);
  const [params, setParams] = useSearchParams();
  const today = localToday();

  const apply = useCallback((d) => {
    setData(d);
    const fresh = (d.earned ?? []).filter((a) => a.type !== 'goal_created' && Date.now() - new Date(a.earnedAt).getTime() < 3 * 86400e3);
    if (fresh.length) setEarned(fresh);
  }, []);
  const load = useCallback(() => api.get(`/goals?today=${today}`).then(apply).catch((err) => setError(err.message)), [apply, today]);
  const loadLinks = () => api.get('/goals/shares').then((r) => setLinks(r.shares)).catch(() => setLinks([]));
  useEffect(() => {
    load();
    loadLinks();
  }, [load]);

  // Opening from a notification: ?achievement=<id> goes straight to sharing.
  useEffect(() => {
    const id = params.get('achievement');
    if (id && data) {
      setShare({ source: 'achievement', sourceId: id });
      setParams({}, { replace: true });
    }
  }, [params, data, setParams]);

  useEffect(() => {
    if (!data || month) return;
    setMonth(data.months[0]?.month ?? today.slice(0, 7));
  }, [data, month, today]);
  useEffect(() => {
    if (!month) return;
    api.get(`/goals/monthly/${month}?today=${today}`).then((r) => setReview(r.review)).catch(() => setReview(null));
  }, [month, today, data?.stats?.totalCheckins]);

  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const s = data.stats;

  const checkIn = async (body) => apply(await api.post('/goals/checkins', { ...body, today }));
  const saveGoal = async (body, { lock }) => {
    if (form?.id) {
      const d = await api.patch(`/goals/goals/${form.id}`, { ...body, today });
      apply(lock ? await api.post(`/goals/goals/${form.id}/lock`, { today }) : d);
    } else {
      const d = await api.post('/goals/goals', { ...body, today });
      apply(lock ? await api.post(`/goals/goals/${d.goalId}/lock`, { today }) : d);
    }
    setForm(null);
  };
  const goalAction = async (kind, goal) => {
    try {
      if (kind === 'edit') return setForm({ ...goal, start: goal.startDate });
      if (kind === 'lock' && !(await confirmDialog({ title: `Lock “${goal.title}”?`, message: 'Once it’s locked, the target and period can’t be changed. That’s what makes it count.', confirmLabel: 'Lock goal' }))) return;
      if (kind === 'abandon' && !(await confirmDialog({ title: `Abandon “${goal.title}”?`, message: 'It stays on your record as abandoned. You can set a new goal any time.', confirmLabel: 'Abandon goal', danger: true }))) return;
      if (kind === 'delete' && !(await confirmDialog({ title: 'Delete this draft?', message: 'It hasn’t been locked, so nothing is lost from your record.', confirmLabel: 'Delete draft', danger: true }))) return;
      if (kind === 'lock') apply(await api.post(`/goals/goals/${goal.id}/lock`, { today }));
      if (kind === 'abandon') apply(await api.post(`/goals/goals/${goal.id}/abandon`, { today }));
      if (kind === 'delete') apply(await api.delete(`/goals/goals/${goal.id}?today=${today}`));
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const pin = async (a) => {
    try {
      await api.patch(`/goals/achievements/${a.id}`, { pinned: !a.pinned });
      setData((d) => ({ ...d, achievements: d.achievements.map((x) => (x.id === a.id ? { ...x, pinned: !a.pinned } : x)) }));
      toast(a.pinned ? 'Removed from your profile.' : 'Pinned to your profile.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const post = async (a) => {
    const note = await promptDialog({ title: `Post “${a.title}” to Community`, message: 'Only public details are shown: never profit, trades or risk.', label: 'Add a note', placeholder: 'e.g. Two weeks of showing up every day', optional: true, multiline: true, confirmLabel: 'Post' });
    if (note === null) return;
    setPosting(a.id);
    try {
      const r = await api.post(`/goals/achievements/${a.id}/post`, { note });
      setData((d) => ({ ...d, achievements: d.achievements.map((x) => (x.id === a.id ? { ...x, postId: r.postId } : x)) }));
      toast('Posted to Community.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setPosting(null);
    }
  };
  const setPref = async (k, v) => {
    setData((d) => ({ ...d, prefs: { ...d.prefs, [k]: v } }));
    await api.put('/goals/preferences', { [k]: v }).catch(() => {});
  };
  const revoke = async (id) => {
    if (!(await confirmDialog({ title: 'Remove this public link?', message: 'Anyone who opens it will see that it’s no longer available.', confirmLabel: 'Remove link', danger: true }))) return;
    await api.delete(`/goals/shares/${id}`).catch(() => {});
    loadLinks();
  };

  const running = data.goals.filter((g) => ['active', 'achieved', 'draft'].includes(g.status));
  const past = data.goals.filter((g) => ['completed', 'missed', 'abandoned'].includes(g.status));
  const visibleAchievements = data.achievements.filter((a) => a.type !== 'goal_created');
  const openShare = (source, sourceId) => setShare({ source, sourceId });

  return (
    <div>
      <PageHeader
        eyebrow="Goal Room"
        title="Build a record you’re proud to show"
        description="Set a goal, lock it, check in every trading day. Progress here is measured in discipline and consistency, never in the size of a win."
        actions={<Button icon={Plus} onClick={() => setForm({})}>New goal</Button>}
      />

      {earned.length ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-accent-500/40 bg-ink-950 px-5 py-4 text-ink-100">
          <span className="text-sm">Earned just now: <span className="font-semibold text-accent-300">{earned.map((a) => a.title).join(', ')}</span></span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="accent" icon={Share2} onClick={() => openShare('achievement', earned[0].id)}>Share</Button>
            <button type="button" onClick={() => setEarned([])} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Level" value={s.level.n} sub={s.level.name} info={s.level.next ? `Next: Level ${s.level.next.n}, ${s.level.next.name}. Needs ${s.level.next.needs.charAt(0).toLowerCase()}${s.level.next.needs.slice(1)}` : 'The highest level.'} />
        <Tile label="Current streak" value={s.currentStreak} sub={`Longest ${s.longestStreak} days`} info="Consecutive trading days with a check-in. Weekends never break it; a weekend check-in adds to it." />
        <Tile label="Discipline" value={s.adherence30 == null ? '–' : `${s.adherence30}%`} sub={s.adherence30 == null ? 'Check in to start' : 'Last 30 days'} info="Share of check-ins where you either stayed out, or traded and followed your plan, respected risk and avoided revenge trading." />
        <Tile label="Check-ins" value={s.totalCheckins} sub={`${s.learning} learning · ${s.backtests} backtests`} />
        <Tile label="Goals completed" value={s.goalsCompleted} sub={`${s.badges.length} badge${s.badges.length === 1 ? '' : 's'}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CheckInPanel key={data.checkin?.id ?? 'new'} today={data.today} checkin={data.checkin} stats={s} recent={data.recent} onSubmit={checkIn} onShare={(id) => openShare('checkin', id)} />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Goals</h2>
              {running.length ? <Button size="sm" variant="ghost" icon={Plus} onClick={() => setForm({})}>New goal</Button> : null}
            </div>
            {running.length ? (
              <div className="grid gap-4 md:grid-cols-2">{running.map((g) => <GoalCard key={g.id} goal={g} currency={data.currency} achievements={data.achievements} onAction={goalAction} onShare={openShare} />)}</div>
            ) : (
              <EmptyState
                icon={Target}
                title="Set your first goal"
                description="Start with a process goal, like checking in on 20 trading days or keeping to your plan for 15. It’s the record that compounds."
                action={<Button icon={Plus} onClick={() => setForm({})}>Set a goal</Button>}
              />
            )}
            {past.length ? (
              <details className="mt-4 rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                <summary className="cursor-pointer text-sm font-medium text-ink-700 dark:text-ink-200">Past goals ({past.length})</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">{past.map((g) => <GoalCard key={g.id} goal={g} currency={data.currency} achievements={data.achievements} onAction={goalAction} onShare={openShare} />)}</div>
              </details>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Achievements</h2>
              <SelfReported />
            </div>
            {!visibleAchievements.length ? <EmptyState size="inline" icon={Trophy} title="No achievements yet" description="Check in today to start your record. Streaks, badges and milestones appear here as you earn them." /> : null}
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {(showAll ? visibleAchievements : visibleAchievements.slice(0, 8)).map((a) => <AchievementRow key={a.id} a={a} onShare={openShare} onPin={pin} onPost={post} posting={posting === a.id} />)}
            </ul>
            {visibleAchievements.length > 8 ? <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-ink-100 py-2.5 text-xs font-medium text-accent-700 hover:bg-ink-50 dark:border-ink-800 dark:text-accent-300 dark:hover:bg-ink-800/50">{showAll ? 'Show fewer' : `Show all ${visibleAchievements.length}`}</button> : null}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Monthly review</h2>
              {data.months.length ? (
                <select value={month ?? ''} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-xs dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100" aria-label="Month">
                  {data.months.map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
                </select>
              ) : null}
            </div>
            {review && review.checkins ? (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ['Goals completed', review.goalsCompleted],
                    ['Longest streak', `${review.longestStreak} days`],
                    ['Check-ins', review.checkins],
                    ['Discipline', review.adherence == null ? '–' : `${review.adherence}%`],
                    ['Learning', review.learning],
                    ['Badges earned', review.badgesEarned.length],
                  ].map(([l, v]) => (
                    <div key={l}><dt className="text-[11px] uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-mono tabular-nums text-ink-900 dark:text-ink-50">{v}</dd></div>
                  ))}
                </dl>
                <Button className="mt-4 w-full" size="sm" variant="secondary" icon={Share2} onClick={() => openShare('monthly', review.month)}>Share {review.label.split(' ')[0]} progress</Button>
                {review.inProgress ? <p className="mt-2 text-[11px] text-ink-400">Month in progress. The final review arrives on the 1st.</p> : null}
              </>
            ) : (
              <p className="mt-3 text-xs text-ink-400">Your monthly review builds from your check-ins.</p>
            )}
          </section>

          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Badges</h2>
            <ul className="mt-3 space-y-3">
              {data.badges.map((b) => {
                const Icon = ICONS[b.icon] ?? ICONS.medal;
                return (
                  <li key={b.id} className={clsx('flex gap-3', !b.earned && 'opacity-55')}>
                    <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', b.earned ? 'border-accent-500 bg-accent-500/15 text-accent-700 dark:text-accent-300' : 'border-dashed border-ink-300 text-ink-400 dark:border-ink-600')}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-900 dark:text-ink-50">{b.name}{b.earned ? '' : ' · not yet'}</span>
                      <span className="block text-xs text-ink-500 dark:text-ink-400">{b.rule}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Public links</h2>
            {!links ? <p className="mt-2 text-xs text-ink-400">Loading…</p> : !links.length ? <p className="mt-2 text-xs text-ink-400">None yet. Links you create when sharing appear here, and you can remove them at any time.</p> : null}
            <ul className="mt-2 divide-y divide-ink-100 dark:divide-ink-800">
              {links?.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-800 dark:text-ink-100">{l.headline}</span>
                    <span className="text-[11px] text-ink-400">{l.views} view{l.views === 1 ? '' : 's'} · {formatDay(new Date(l.createdAt).toISOString(), { day: 'numeric', month: 'short' })}</span>
                  </span>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${l.path}`)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Copy link" title="Copy link"><Copy className="h-3.5 w-3.5" /></button>
                  <a href={l.path} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Open link" title="Open"><ExternalLink className="h-3.5 w-3.5" /></a>
                  <button type="button" onClick={() => revoke(l.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-loss-50 hover:text-loss-500 dark:hover:bg-loss-500/10" aria-label="Remove link" title="Remove link"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Sharing and privacy</h2>
            {[
              ['showOnProfile', 'Show achievements on my profile', 'Streaks, badges, level and pinned achievements. Never profit, trades or risk.'],
              ['autoPost', 'Post milestones to Community automatically', 'Goals reached, badges, and bigger streaks. You can still post any achievement yourself.'],
            ].map(([k, label, hint]) => (
              <label key={k} className="mt-3 flex cursor-pointer items-start justify-between gap-4">
                <span><span className="block text-sm text-ink-800 dark:text-ink-100">{label}</span><span className="block text-xs text-ink-400">{hint}</span></span>
                <input type="checkbox" checked={data.prefs[k]} onChange={(e) => setPref(k, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#B58637]" />
              </label>
            ))}
            <p className="mt-4 border-t border-ink-100 pt-3 text-[11px] leading-relaxed text-ink-400 dark:border-ink-800">
              Everything here is <span className="font-medium text-ink-600 dark:text-ink-300">self-reported</span>: it comes from your check-ins, goals and journal. Broker-verified results are coming soon. See what other traders are working on in <Link to="/app/community/goals" className="underline">Community, Goals</Link>.
            </p>
          </section>
        </aside>
      </div>

      {form ? <GoalForm metrics={data.metrics} periods={data.periods} today={data.today} currency={data.currency} initial={form.id ? form : undefined} onSave={saveGoal} onClose={() => setForm(null)} /> : null}
      {share ? <ShareStudio source={share.source} sourceId={share.sourceId} onClose={() => setShare(null)} /> : null}
    </div>
  );
}
