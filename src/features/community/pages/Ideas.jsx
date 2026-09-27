import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { api } from '../../../lib/api';
import PostCard from '../components/PostCard';
import Composer from '../components/Composer';
import { InstrumentSelect } from '../components/inputs';
import Hint from '../../../components/ui/Hint';
import EmptyState from '../../../components/ui/EmptyState';

export default function Ideas() {
  const [filters, setFilters] = useState({ instrument: null, status: 'active', direction: null, sort: 'latest' });
  const [ideas, setIdeas] = useState(null);
  const [next, setNext] = useState(null);
  const load = async (before = null) => {
    const qs = new URLSearchParams(Object.entries({ ...filters, before }).filter(([, v]) => v));
    const r = await api.get(`/community/ideas?${qs}`);
    setIdeas((prev) => (before ? [...prev, ...r.ideas] : r.ideas));
    setNext(r.next);
  };
  useEffect(() => { setIdeas(null); load(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (key, value, label) => (
    <button type="button" aria-pressed={filters[key] === value} onClick={() => setFilters((f) => ({ ...f, [key]: f[key] === value && key !== 'sort' ? null : value }))} className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', filters[key] === value ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>{label}</button>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="border-b border-ink-100 px-5 py-4 dark:border-ink-800">
        <h1 className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">Trade ideas</h1>
        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">Structured theses from traders, open to comment and challenge. These are views to debate, not signals, and Kotka does not vet them.</p>
        <Hint id="ideas-challenge" className="mt-3">Disagree with a thesis? Use Challenge on it and name the weak assumption. Challenges are tagged, so the author can answer each one.</Hint>
      </div>
      <div className="border-b border-ink-100 dark:border-ink-800"><Composer compact defaultKind="idea" lockKind onCreated={(p) => setIdeas((prev) => [p, ...(prev ?? [])])} /></div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
        <InstrumentSelect value={filters.instrument} onChange={(v) => setFilters((f) => ({ ...f, instrument: v }))} placeholder="All markets" className="h-8 text-xs" />
        <span className="mx-1 h-4 w-px bg-ink-200 dark:bg-ink-700" />
        {chip('status', 'active', 'Active')}{chip('status', 'open', 'Open')}{chip('status', 'updated', 'Updated')}{chip('status', 'closed', 'Closed')}{chip('status', 'invalidated', 'Invalidated')}
        <span className="mx-1 h-4 w-px bg-ink-200 dark:bg-ink-700" />
        {chip('direction', 'bullish', 'Bullish')}{chip('direction', 'bearish', 'Bearish')}
        <span className="mx-1 h-4 w-px bg-ink-200 dark:bg-ink-700" />
        {chip('sort', 'latest', 'Latest')}{chip('sort', 'discussed', 'Most discussed')}
      </div>
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {!ideas ? <div className="m-5 h-32 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}
        {ideas && !ideas.length ? <EmptyState size="section" icon={Lightbulb} title="No trade ideas here yet" description="Try other filters, or publish yours above: entry, stop, target and the thesis behind it." /> : null}
        {ideas?.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
      {next ? <button type="button" onClick={() => load(next.before)} className="w-full border-t border-ink-100 py-3 text-xs font-medium text-accent-700 dark:border-ink-800 dark:text-accent-300">Load more</button> : null}
    </div>
  );
}
