import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Tabs from '../../../components/ui/Tabs';
import { CurrencyChip, formatDate, NotAvailable, reasonAfterPrefix, Section, SourceLink, toneOf, txt } from './primitives';

function when(c) {
  if (!c.date) return null;
  return c.dateOnly ? formatDate(c.date) : formatDate(c.date, { time: true });
}

export default function CatalystsSection({ report }) {
  const [filter, setFilter] = useState('high');
  const items = report.catalysts?.items ?? [];
  const shown = useMemo(() => items.filter((c) => filter === 'all' || c.importance === 'High'), [items, filter]);
  const missing = Object.entries(report.catalysts?.coverage ?? {}).filter(([, v]) => !v.configured);
  const unretrieved = Object.entries(report.catalysts?.coverage ?? {}).flatMap(([code, v]) => v.calendars.filter((k) => !k.retrieved).map((k) => `${code}: ${k.name}`));

  return (
    <Section
      title="Upcoming catalysts"
      subtitle={`Official releases and meetings in the next ${report.catalysts?.horizonDays ?? 45} days, and what each outcome could mean. These describe possibilities, not predictions.`}
      action={
        <Tabs
          tabs={[
            { value: 'high', label: `High importance (${items.filter((c) => c.importance === 'High').length})` },
            { value: 'all', label: `All (${items.length})` },
          ]}
          active={filter}
          onChange={setFilter}
        />
      }
    >
      {shown.length ? (
        <>
        {/* Up to xl: one card per event (the table needs ~860px). */}
        <ul className="-mx-5 divide-y divide-ink-50 border-t border-ink-100 dark:divide-ink-800/60 dark:border-ink-800 xl:hidden">
          {shown.map((c, i) => (
            <li key={`${c.date}-${c.event}-${i}`} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {c.date ? <span className="font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{when(c)}</span> : <span className="text-[11px] text-ink-400">Date to be confirmed</span>}
                {String(c.currency).split('/').map((code) => (report.currencies[code] ? <CurrencyChip key={code} code={code} tone={toneOf(report, code)} /> : <span key={code} className="text-xs text-ink-400">{code}</span>))}
                {c.importance === 'High' ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">High</span> : null}
              </div>
              <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{txt(c.event)}</p>
              {c.referencePeriod ? <p className="text-[11px] text-ink-400">Covers: {c.referencePeriod}</p> : null}
              {c.scenarios?.context ? <p className="text-xs text-ink-500 dark:text-ink-400">{txt(c.scenarios.context)}</p> : null}
              {c.dateText ? <p className="text-[11px] text-ink-400">{reasonAfterPrefix(c.dateText)}</p> : null}
              {c.scenarios?.positive || c.scenarios?.negative ? (
                <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                  {c.scenarios?.positive ? (
                    <p className="border-l-2 border-profit-500/60 pl-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-profit-600 dark:text-profit-400">Potential positive</span>
                      {txt(c.scenarios.positive)}
                    </p>
                  ) : null}
                  {c.scenarios?.negative ? (
                    <p className="border-l-2 border-loss-500/60 pl-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-loss-500">Potential negative</span>
                      {txt(c.scenarios.negative)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <SourceLink href={c.source?.url} className="text-[11px]">{txt(c.source?.name)}</SourceLink>
            </li>
          ))}
        </ul>
        <div className="-mx-5 hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Event</th>
                <th className="px-2 py-2 font-medium">Importance</th>
                <th className="w-[22%] px-2 py-2 font-medium text-profit-600 dark:text-profit-400">Potential positive effect</th>
                <th className="w-[22%] px-5 py-2 font-medium text-loss-500">Potential negative effect</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <tr key={`${c.date}-${c.event}-${i}`} className="border-b border-ink-50 align-top dark:border-ink-800/60">
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    {c.date ? <span className="font-mono tabular-nums text-ink-800 dark:text-ink-100">{when(c)}</span> : <span className="text-[11px] text-ink-400">Date to be confirmed</span>}
                    <div className="mt-1 flex gap-1">
                      {String(c.currency).split('/').map((code) => (report.currencies[code] ? <CurrencyChip key={code} code={code} tone={toneOf(report, code)} /> : <span key={code} className="text-ink-400">{code}</span>))}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <p className="text-sm text-ink-800 dark:text-ink-100">{txt(c.event)}</p>
                    {c.referencePeriod ? <p className="text-[11px] text-ink-400">Covers: {c.referencePeriod}</p> : null}
                    {c.scenarios?.context ? <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">{txt(c.scenarios.context)}</p> : null}
                    {c.dateText ? <p className="mt-0.5 max-w-xs text-[11px] text-ink-400">{reasonAfterPrefix(c.dateText)}</p> : null}
                    <SourceLink href={c.source?.url} className="mt-0.5 text-[11px]">{txt(c.source?.name)}</SourceLink>
                  </td>
                  <td className="px-2 py-3">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', c.importance === 'High' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400')}>{c.importance}</span>
                  </td>
                  <td className="max-w-[16rem] px-2 py-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-profit-600 dark:text-profit-400 md:hidden">Positive</span>
                    <span className="border-l-2 border-profit-500/60 pl-2 md:block">{txt(c.scenarios?.positive)}</span>
                  </td>
                  <td className="max-w-[16rem] px-5 py-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-loss-500 md:hidden">Negative</span>
                    <span className="border-l-2 border-loss-500/60 pl-2 md:block">{txt(c.scenarios?.negative)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <NotAvailable>Nothing of this importance is scheduled in this period</NotAvailable>
      )}
      {missing.length || unretrieved.length ? (
        <div className="mt-3 space-y-1 text-[11px] text-ink-400">
          {missing.map(([code]) => (
            <p key={code}>We don’t track {code} events yet, so they aren’t listed here.</p>
          ))}
          {unretrieved.map((s) => (
            <p key={s}>Some {s.split(':')[0]} events may be missing: that calendar didn’t load this time.</p>
          ))}
        </div>
      ) : null}
    </Section>
  );
}
