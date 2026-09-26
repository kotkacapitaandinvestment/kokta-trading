import { useState } from 'react';
import clsx from 'clsx';
import Tabs from '../../../components/ui/Tabs';
import { fmt, formatDate, KindTag, NotAvailable, reasonAfterPrefix, reportCodes, Section, signedFixed, SourceLink, txt } from './primitives';

export function CentralBanksSection({ report }) {
  const codes = reportCodes(report).filter((c) => report.centralBanks?.[c]);
  return (
    <Section title="Central banks" subtitle="Actual policy, taken from official rate data and the latest decision statement. Market expectations are shown separately above.">
      <div className={clsx('grid grid-cols-1 gap-6', codes.length > 1 && 'lg:grid-cols-2')}>
        {codes.map((code) => {
          const cb = report.centralBanks[code];
          return (
            <div key={code} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{cb.name}</p>
                <span className="font-mono text-sm tabular-nums text-ink-900 dark:text-ink-50">{txt(cb.rate ?? 'n/a')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-ink-400">
                  Stance <span className="font-medium text-ink-800 dark:text-ink-100">{cb.stance ?? 'n/a'}</span>
                </span>
                <span className="text-ink-400">
                  Real rate <span className="font-mono tabular-nums text-ink-800 dark:text-ink-100">{cb.realRate !== null && cb.realRate !== undefined ? `${signedFixed(cb.realRate)} pts` : 'n/a'}</span>
                </span>
                <SourceLink href={cb.targetUrl} className="text-xs">Mandate: {txt(cb.targetText)}</SourceLink>
              </div>
              {cb.recentChanges?.length ? (
                <div>
                  <p className="mb-1.5 text-xs text-ink-400">Recent rate decisions (effective dates)</p>
                  <ol className="flex flex-wrap gap-1.5">
                    {cb.recentChanges.map((ch) => (
                      <li key={ch.date} className="rounded-md border border-ink-100 px-2 py-1 text-xs dark:border-ink-800">
                        <span className="text-ink-400">{formatDate(ch.date)}</span>{' '}
                        <span className={clsx('font-mono tabular-nums', ch.bp > 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>
                          {ch.bp > 0 ? '+' : ''}
                          {ch.bp}bp
                        </span>{' '}
                        <span className="font-mono tabular-nums text-ink-700 dark:text-ink-200">{txt(ch.toDisplay ?? `${fmt(ch.to)}%`)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <div className="flex items-start gap-2">
                <KindTag kind="KOTKA INTERPRETATION" className="mt-0.5" />
                <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">{txt(cb.rationale)}</p>
              </div>
              {cb.statement ? (
                <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <KindTag kind="SOURCE ASSESSMENT" />
                    <SourceLink href={cb.statement.url} className="text-xs">
                      {cb.statement.title}, {formatDate(cb.statement.publishedAt)}
                    </SourceLink>
                  </div>
                  <p className="mb-2 text-[11px] text-ink-400">Verbatim excerpts, selected by keyword from the published statement.</p>
                  <div className="space-y-2">
                    {cb.statement.keySentences.map((s) => (
                      <blockquote key={s} className="border-l-2 border-accent-500/60 pl-3 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                        {s}
                      </blockquote>
                    ))}
                  </div>
                </div>
              ) : (
                <NotAvailable reason={cb.statementNote}>CENTRAL BANK STATEMENT: NOT AVAILABLE</NotAvailable>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function ImfSection({ report }) {
  const codes = reportCodes(report).filter((c) => report.imfView?.[c]);
  return (
    <Section title="IMF view" subtitle="What the International Monetary Fund has projected or assessed, kept apart from Kotka's interpretation.">
      <div className={clsx('grid grid-cols-1 gap-6', codes.length > 1 && 'lg:grid-cols-2')}>
        {codes.map((code) => {
          const v = report.imfView[code];
          return (
            <div key={code} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{report.currencies[code].economy}</p>
                {v.vintage ? <p className="text-xs text-ink-400">{v.vintage} WEO, published {formatDate(v.published)}</p> : null}
              </div>
              {v.available ? (
                <ul className="space-y-2">
                  {v.statements.map((s) => (
                    <li key={s.text} className="flex items-start gap-2">
                      <KindTag kind="SOURCE ASSESSMENT" className="mt-0.5" />
                      <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(s.text)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <NotAvailable>IMF WORLD ECONOMIC OUTLOOK DATA: NOT AVAILABLE</NotAvailable>
              )}
              {v.curated.map((a) => (
                <div key={a.url + a.title} className="rounded-lg border border-ink-100 p-3 dark:border-ink-800">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <KindTag kind="SOURCE ASSESSMENT" />
                    <SourceLink href={a.url} className="text-xs">
                      {a.institution}: {a.title} ({formatDate(a.publishedAt)})
                    </SourceLink>
                  </div>
                  {a.classification ? <p className="text-xs font-medium text-ink-800 dark:text-ink-100">{a.classification}</p> : null}
                  <p className="text-sm text-ink-700 dark:text-ink-200">{a.text}</p>
                  <p className="mt-1 text-[11px] text-ink-400">Recorded by a Kotka administrator from the original publication.</p>
                </div>
              ))}
              {v.formalQualitative ? <NotAvailable reason={reasonAfterPrefix(v.formalQualitative)}>FORMAL IMF ASSESSMENT: NOT AVAILABLE</NotAvailable> : null}
              {!report.currencies[code].factors.valuation.available ? (
                <NotAvailable reason="No IMF External Sector Report valuation has been recorded for this currency. Kotka does not infer one.">IMF FORMAL VALUATION: NOT AVAILABLE</NotAvailable>
              ) : null}
              {v.interpretation ? (
                <div className="flex items-start gap-2">
                  <KindTag kind="KOTKA INTERPRETATION" className="mt-0.5" />
                  <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">{txt(v.interpretation)}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function RevisionsSection({ report }) {
  const codes = reportCodes(report);
  const [active, setActive] = useState(codes[0]);
  const c = report.currencies[active];
  const revs = c.revisions ?? [];
  const first = revs[0];
  return (
    <Section
      title="IMF forecast revisions"
      subtitle={first ? `${first.previousVintage} WEO (published ${formatDate(first.previousPublished)}) compared with the ${first.currentVintage} WEO (published ${formatDate(first.currentPublished)}).` : 'Previous vs current IMF World Economic Outlook.'}
      action={codes.length > 1 ? <Tabs tabs={codes.map((code) => ({ value: code, label: code }))} active={active} onChange={setActive} /> : null}
    >
      {revs.length ? (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
                <th className="px-5 py-2 font-medium">Indicator</th>
                <th className="px-2 py-2 font-medium">Year</th>
                <th className="px-2 py-2 text-right font-medium">Previous</th>
                <th className="px-2 py-2 text-right font-medium">Current</th>
                <th className="px-2 py-2 text-right font-medium">Revision</th>
                <th className="px-5 py-2 font-medium">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {revs.map((r) => (
                <tr key={`${r.indicator}-${r.year}`} className="border-b border-ink-50 align-top dark:border-ink-800/60">
                  <td className="px-5 py-2.5">
                    <p className="text-sm text-ink-800 dark:text-ink-100">{r.label}</p>
                    <p className="text-[11px] text-ink-400">{r.unit}{r.kind === 'OUTTURN_VS_FORECAST' ? ', outturn vs earlier forecast' : ''}</p>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs tabular-nums text-ink-600 dark:text-ink-300">{r.year}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400">{fmt(r.previous)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-ink-900 dark:text-ink-50">{fmt(r.current)}</td>
                  <td className={clsx('px-2 py-2.5 text-right font-mono text-xs tabular-nums', r.tone === 'positive' ? 'text-profit-600 dark:text-profit-400' : r.tone === 'negative' ? 'text-loss-500' : 'text-ink-400')}>
                    {r.direction === 'UNCHANGED' ? '0.00' : signedFixed(r.revision)}
                  </td>
                  <td className="max-w-[20rem] px-5 py-2.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{txt(r.interpretation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <NotAvailable reason="No earlier IMF World Economic Outlook vintage is available to compare against.">FORECAST REVISIONS: NOT AVAILABLE</NotAvailable>
      )}
      <p className="mt-3 text-[11px] text-ink-400">Revision colour reflects whether the change is supportive for the currency (for inflation, a downward revision is treated as supportive). Source: IMF World Economic Outlook database, current and archived vintages.</p>
    </Section>
  );
}
