import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Landmark, Newspaper, Radio } from 'lucide-react';
import { price, signedPct, timeAgo, tradingDay } from '../util';
import { conditionWord } from '../../../lib/plain';

export function EventLine({ event, compact = false }) {
  const when = new Date(event.scheduledAt);
  return (
    <Link to={`/app/community/events/${event.id}`} className={clsx('group flex items-start gap-3', compact ? 'py-2' : 'px-5 py-4 hover:bg-ink-50/60 dark:hover:bg-ink-800/30')}>
      <span className={clsx('flex w-12 shrink-0 flex-col items-center rounded-lg border py-1 text-center', event.phase === 'live' ? 'border-loss-400/40 bg-loss-50 dark:bg-loss-500/10' : 'border-ink-100 dark:border-ink-800')}>
        <span className="text-[10px] uppercase text-ink-400">{when.toLocaleDateString(undefined, { month: 'short' })}</span>
        <span className="font-mono text-base font-semibold leading-none text-ink-900 dark:text-ink-50">{when.getDate()}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {event.phase === 'live' ? <span className="inline-flex items-center gap-1 rounded bg-loss-500 px-1.5 py-px text-[10px] font-semibold uppercase text-white"><Radio className="h-3 w-3" /> Live</span> : null}
          <span className="rounded bg-ink-100 px-1.5 py-px font-mono text-[10px] font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200">{event.currency}</span>
          <span className={clsx('text-[10px] font-medium', event.importance === 'High' ? 'text-accent-700 dark:text-accent-300' : 'text-ink-400')}>{event.importance}</span>
        </span>
        <span className="mt-0.5 block text-sm font-medium text-ink-900 group-hover:underline dark:text-ink-50">{event.title}</span>
        <span className="text-[11px] text-ink-400">
          {event.dateOnly ? 'Time not published' : when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          {event.referencePeriod ? ` · ${event.referencePeriod}` : ''}
          {event.actual ? ` · Actual ${event.actual}` : ''}
          {typeof event.messages === 'number' && event.messages ? ` · ${event.messages} messages` : ''}
        </span>
      </span>
    </Link>
  );
}

export function NewsLine({ news, reason }) {
  return (
    <Link to={`/app/community/news/${news.id}`} className="flex gap-3 px-5 py-4 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
      <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', news.official ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400')}>
        {news.official ? <Landmark className="h-4 w-4" /> : <Newspaper className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        {reason ? <span className="mb-1 block text-[11px] text-ink-400">{reason}</span> : null}
        <span className="block text-[15px] font-medium leading-snug text-ink-900 dark:text-ink-50">{news.headline}</span>
        {news.summary ? <span className="mt-1 line-clamp-2 block text-sm text-ink-500 dark:text-ink-400">{news.summary}</span> : null}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
          {news.official ? <span className="font-semibold text-accent-700 dark:text-accent-300">Official</span> : null}
          <span>{news.provider}</span>
          <span>· {timeAgo(news.publishedAt)}</span>
          {news.instruments?.slice(0, 4).map((s) => <span key={s} className="rounded bg-ink-100 px-1 font-mono dark:bg-ink-800">{s}</span>)}
          {news.commentCount ? <span>· {news.commentCount} comments</span> : null}
        </span>
      </span>
    </Link>
  );
}

export function MoveLine({ move, reason }) {
  const up = move.changePct > 0;
  return (
    <Link to={`/app/community/markets/${move.symbol}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
      <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', up ? 'bg-profit-50 text-profit-600 dark:bg-profit-500/10 dark:text-profit-400' : 'bg-loss-50 text-loss-500 dark:bg-loss-500/10')}>
        {up ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        {reason ? <span className="mb-0.5 block text-[11px] text-ink-400">{reason}</span> : null}
        <span className="block text-sm text-ink-900 dark:text-ink-50">
          <span className="font-mono font-semibold">{move.display}</span> closed <span className={clsx('font-mono font-semibold', up ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>{signedPct(move.changePct)}</span> at <span className="font-mono">{price(move.close, move.decimals)}</span>
        </span>
        <span className="text-[11px] text-ink-400">Closing price, {tradingDay(move.closeDate)}{move.unusual ? ` · a bigger move than usual (typical day: ${move.atrPct}%)` : ''}</span>
      </span>
    </Link>
  );
}

export function InsightLine({ insight, reason }) {
  return (
    <Link to={`/app/market?instrument=${insight.subject}`} className="flex items-center gap-3 px-5 py-4 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-700 dark:text-accent-300"><CalendarClock className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 block text-[11px] text-ink-400">{reason ?? 'Kotka research update'}</span>
        <span className="block text-sm text-ink-900 dark:text-ink-50">
          Kotka's fundamental score for <span className="font-mono font-semibold">{insight.display}</span> moved from <span className="font-mono">{insight.from}</span> to <span className="font-mono font-semibold">{insight.to}</span> ({conditionWord(insight.condition).toLowerCase()})
        </span>
        <span className="text-[11px] text-ink-400">Fundamental Research · {timeAgo(insight.at)} · open the full report</span>
      </span>
    </Link>
  );
}
