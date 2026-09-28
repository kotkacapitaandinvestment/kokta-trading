import clsx from 'clsx';
import { Check, Medal, PenLine, X } from 'lucide-react';
import { ICONS, formatDay } from './card';

// Compact, in-app version of the achievement card: Community posts, the
// profile showcase and anywhere a snapshot is shown inside Kotka.
export default function AchievementPost({ snap, className }) {
  if (!snap) return null;
  const Icon = ICONS[snap.icon] ?? Medal;
  const pick = (kind) => snap.fields?.filter((f) => f.kind === kind) ?? [];
  const hero = pick('hero')[0];
  const period = pick('period')[0];
  const badges = pick('badges')[0];
  const checks = pick('checks')[0];
  const stats = pick('stat').slice(0, 4);
  return (
    <div
      className={clsx('overflow-hidden rounded-2xl border border-accent-500/35 p-4 text-ink-100', className)}
      style={{ background: 'radial-gradient(ellipse 80% 70% at 0% 0%, rgba(209,168,91,0.16), transparent 60%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(101,79,47,0.35), transparent 65%), #070706' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-300 sm:tracking-[0.28em]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-400/70 text-accent-200"><Icon className="h-3.5 w-3.5" /></span>
          <span>{snap.eyebrow}</span>
        </span>
        <span className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em]', snap.verification === 'verified' ? 'border-accent-400 bg-accent-400 text-ink-950' : 'border-accent-400/50 text-accent-100')}>
          {snap.verification === 'verified' ? <Check className="h-2.5 w-2.5" /> : <PenLine className="h-2.5 w-2.5" />} {snap.verification === 'verified' ? 'Verified' : 'Self-reported'}
        </span>
      </div>
      <p className="mt-3 text-xl font-semibold leading-tight tracking-tight text-[#FBF3E4]">{snap.headline}</p>
      {period || snap.subline ? <p className="mt-0.5 text-xs text-accent-100/70">{[snap.subline, period?.value].filter(Boolean).join(' · ')}</p> : null}
      {hero ? (
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-medium tracking-tight text-accent-200">{hero.value}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-100/60">{hero.unit}</span>
        </p>
      ) : null}
      {checks ? (
        <ul className="mt-3 space-y-1 text-sm">
          {checks.value.map((c) => (
            <li key={c.label} className={clsx('flex items-center gap-2', c.ok ? 'text-[#FBF3E4]' : 'text-accent-100/50')}>
              <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full border', c.ok ? 'border-accent-400 text-accent-200' : 'border-accent-100/30')}>{c.ok ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <X className="h-2.5 w-2.5" strokeWidth={3} />}</span>
              {c.label}
            </li>
          ))}
        </ul>
      ) : null}
      {stats.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-accent-400/20 pt-3 sm:grid-cols-4">
          {stats.map((f) => (
            <div key={f.key} className={clsx('min-w-0', String(f.value).length > 30 && 'col-span-2 sm:col-span-4')}>
              <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-100/55">{f.label}</dt>
              <dd className={clsx('text-[#FBF3E4]', String(f.value).length > 30 ? 'text-xs leading-relaxed' : 'font-mono text-sm')}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {badges ? (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {badges.value.map((b) => <span key={b} className="inline-flex items-center gap-1 rounded-full border border-accent-400/45 px-2 py-0.5 text-[11px] text-accent-100"><Medal className="h-3 w-3 text-accent-300" /> {b}</span>)}
        </p>
      ) : null}
      <p className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-accent-400/20 pt-2 text-[10px] uppercase tracking-[0.16em] text-accent-100/45">
        <span>{snap.motto ?? 'Discipline over reckless risk'}</span>
        <span className="font-mono normal-case tracking-normal">{snap.date ? formatDay(snap.date, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
      </p>
    </div>
  );
}
