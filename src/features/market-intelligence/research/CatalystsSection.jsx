import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Tabs from '../../../components/ui/Tabs';
import { NotAvailable, Section, SourceLink, formatDate, reasonAfterPrefix, txt } from './primitives';

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
      subtitle={`Scheduled events in the next ${report.catalysts?.horizonDays ?? 45} days, from official calendars. Scenarios describe what would change the assessment, not what will happen.`}
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
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Event</th>
                <th className="px-2 py-2 font-medium">Importance</th>
                <th className="w-[22%] px-2 py-2 font-medium">Potential positive effect</th>
                <th className="w-[22%] px-5 py-2 font-medium">Potential negative effect</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <tr key={`${c.date}-${c.event}-${i}`} className="border-b border-ink-50 align-top dark:border-ink-800/60">
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    {c.date ? <span className="font-mono tabular-nums text-ink-800 dark:text-ink-100">{when(c)}</span> : <span className="font-mono text-[11px] text-ink-400">DATE NOT AVAILABLE</span>}
                    <p className="mt-0.5 text-ink-400">{c.currency}</p>
                  </td>
                  <td className="px-2 py-3">
                    <p className="text-sm text-ink-800 dark:text-ink-100">{txt(c.event)}</p>
                    {c.referencePeriod ? <p className="text-[11px] text-ink-400">Reference period: {c.referencePeriod}</p> : null}
                    {c.scenarios?.context ? <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">{txt(c.scenarios.context)}</p> : null}
                    {c.dateText ? <p className="mt-0.5 max-w-xs text-[11px] text-ink-400">{reasonAfterPrefix(c.dateText)}</p> : null}
                    <SourceLink href={c.source?.url} className="mt-0.5 text-[11px]">{txt(c.source?.name)}</SourceLink>
                  </td>
                  <td className="px-2 py-3">
                    <span className={clsx('text-xs font-medium', c.importance === 'High' ? 'text-ink-900 dark:text-ink-50' : 'text-ink-500 dark:text-ink-400')}>{c.importance}</span>
                  </td>
                  <td className="max-w-[16rem] px-2 py-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{txt(c.scenarios?.positive)}</td>
                  <td className="max-w-[16rem] px-5 py-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{txt(c.scenarios?.negative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <NotAvailable reason="No events of this importance fall within the horizon.">NO SCHEDULED CATALYSTS</NotAvailable>
      )}
      {missing.length || unretrieved.length ? (
        <div className="mt-3 space-y-1 text-[11px] text-ink-400">
          {missing.map(([code]) => (
            <p key={code}>{code}: official event calendars are not yet connected for this currency, so its catalysts are DATA NOT AVAILABLE.</p>
          ))}
          {unretrieved.map((s) => (
            <p key={s}>{s} could not be retrieved on this run.</p>
          ))}
        </div>
      ) : null}
    </Section>
  );
}
