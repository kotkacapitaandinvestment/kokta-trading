import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ExternalLink, Newspaper, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { price, signedPct, timeAgo } from '../util';
import { UserName } from './Identity';
import IdeaBlock from './IdeaBlock';

export function MarketSnapshot({ snapshot, compact = false }) {
  if (!snapshot) return null;
  const up = snapshot.changePct > 0;
  return (
    <Link to={`/app/community/markets/${snapshot.symbol}`} className="group flex items-center justify-between gap-4 rounded-xl border border-ink-100 bg-ink-50/60 px-3.5 py-2.5 transition-colors hover:border-accent-300 dark:border-ink-800 dark:bg-ink-900/60 dark:hover:border-accent-700">
      <span className="min-w-0">
        <span className="block font-mono text-sm font-semibold text-ink-900 dark:text-ink-50">{snapshot.display}</span>
        {snapshot.available ? <span className="text-[11px] text-ink-400">Close on {snapshot.closeDate} · {snapshot.regime} volatility</span> : <span className="text-[11px] text-ink-400">Price data not available</span>}
      </span>
      {snapshot.available ? (
        <span className="text-right">
          <span className={clsx('block font-mono tabular-nums text-ink-900 dark:text-ink-50', compact ? 'text-sm' : 'text-base font-semibold')}>{price(snapshot.close, snapshot.decimals)}</span>
          <span className={clsx('inline-flex items-center gap-0.5 font-mono text-xs tabular-nums', up ? 'text-profit-600 dark:text-profit-400' : snapshot.changePct < 0 ? 'text-loss-500' : 'text-ink-400')}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : snapshot.changePct < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
            {signedPct(snapshot.changePct)}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

export function PollView({ poll, onVoted }) {
  const [state, setState] = useState(poll);
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const voted = !!state.myVote;
  const showResults = voted || state.closed;
  const vote = async (optionId) => {
    setBusy(true);
    try {
      const { poll: p } = await api.post(`/community/polls/${state.id}/vote`, { optionId });
      setState(p);
      onVoted?.(p);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-ink-100 p-3.5 dark:border-ink-800">
      <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{state.question}</p>
      <div className="mt-3 space-y-1.5">
        {state.options.map((o) => {
          const pct = state.total ? Math.round((o.votes / state.total) * 100) : 0;
          const mine = state.myVote === o.id;
          return (
            <button key={o.id} type="button" disabled={busy || state.closed} onClick={() => vote(o.id)} className={clsx('relative flex w-full items-center justify-between overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default', mine ? 'border-accent-500 text-ink-900 dark:text-ink-50' : 'border-ink-200 text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:text-ink-200')}>
              {showResults ? <span className="absolute inset-y-0 left-0 bg-accent-500/15" style={{ width: `${pct}%` }} aria-hidden /> : null}
              <span className="relative">{o.label}</span>
              {showResults ? <span className="relative font-mono text-xs tabular-nums text-ink-500">{pct}%</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        {state.total} vote{state.total === 1 ? '' : 's'}
        {state.closesAt ? ` · ${state.closed ? 'closed' : `closes ${new Date(state.closesAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}` : ''}
        {voted && !state.closed ? ' · tap another option to change your vote' : ''}. Community opinion, not a trading signal.
      </p>
    </div>
  );
}

function Lightbox({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose} role="dialog" aria-label="Image">
      <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close" onClick={onClose}>
        <X className="h-5 w-5" />
      </button>
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
    </div>
  );
}

export default function Attachments({ items, compact = false, onAnalyze }) {
  const [open, setOpen] = useState(null);
  if (!items?.length) return null;
  const images = items.filter((a) => a.type === 'image');
  const others = items.filter((a) => a.type !== 'image');
  return (
    <div className="mt-2 space-y-2">
      {images.length ? (
        <div className={clsx('grid gap-1.5', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.map((img) => (
            <div key={img.mediaId} className="group relative">
              <button type="button" onClick={() => setOpen(img.url)} className="block w-full overflow-hidden rounded-xl border border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-900">
                <img src={img.url} alt="Shared chart or image" loading="lazy" className={clsx('w-full object-cover', images.length === 1 ? (compact ? 'max-h-72' : 'max-h-[28rem]') : 'aspect-[4/3]')} style={images.length === 1 && img.width && img.height ? { aspectRatio: `${img.width}/${img.height}` } : undefined} />
              </button>
              {onAnalyze ? (
                <button type="button" onClick={() => onAnalyze(img.mediaId)} className="absolute bottom-2 right-2 rounded-lg bg-ink-950/80 px-2 py-1 text-[11px] font-medium text-accent-300 opacity-0 backdrop-blur transition-opacity hover:bg-ink-950 focus:opacity-100 group-hover:opacity-100">
                  Analyze chart with Kotka
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {others.map((a, i) => {
        if (a.type === 'audio') return <audio key={a.mediaId} controls preload="none" src={a.url} className="h-10 w-full max-w-sm" />;
        if (a.type === 'market') return <MarketSnapshot key={`m${i}`} snapshot={a.snapshot} compact={compact} />;
        if (a.type === 'poll') return a.unavailable ? null : <PollView key={a.poll.id} poll={a.poll} />;
        if (a.unavailable) return <p key={i} className="rounded-xl border border-dashed border-ink-200 px-3 py-2 text-xs text-ink-400 dark:border-ink-700">This {a.type} is no longer available.</p>;
        if (a.type === 'post')
          return (
            <Link key={a.postId} to={`/app/community/${a.kind === 'idea' ? 'ideas' : 'posts'}/${a.postId}`} className="block rounded-xl border border-ink-100 p-3 transition-colors hover:border-accent-300 dark:border-ink-800 dark:hover:border-accent-700">
              <div className="flex items-center gap-2 text-xs"><UserName user={a.author} link={false} /> <span className="text-ink-400">· {timeAgo(a.createdAt)}</span></div>
              {a.idea ? <IdeaBlock idea={a.idea} compact /> : <p className="mt-1 line-clamp-3 text-sm text-ink-700 dark:text-ink-200">{a.excerpt}</p>}
            </Link>
          );
        if (a.type === 'news')
          return (
            <Link key={a.newsId} to={`/app/community/news/${a.newsId}`} className="flex items-start gap-3 rounded-xl border border-ink-100 p-3 transition-colors hover:border-accent-300 dark:border-ink-800 dark:hover:border-accent-700">
              <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-medium text-ink-900 dark:text-ink-50">{a.headline}</span>
                <span className="text-[11px] text-ink-400">{a.official ? 'Official · ' : ''}{a.provider} · {timeAgo(a.publishedAt)}</span>
              </span>
            </Link>
          );
        if (a.type === 'event')
          return (
            <Link key={a.eventId} to={`/app/community/events/${a.eventId}`} className="flex items-start gap-3 rounded-xl border border-ink-100 p-3 transition-colors hover:border-accent-300 dark:border-ink-800 dark:hover:border-accent-700">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" />
              <span className="min-w-0">
                <span className="text-sm font-medium text-ink-900 dark:text-ink-50">{a.title}</span>
                <span className="block text-[11px] text-ink-400">{a.currency} · {a.importance} · {new Date(a.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(a.dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }) })}</span>
              </span>
            </Link>
          );
        return null;
      })}
      {open ? <Lightbox src={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

export { ExternalLink };
