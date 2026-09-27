import { Fragment, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { ccy, CurrencyChip, CurrencyHeading, FactorBar, FavoursPill, KindTag, NotAvailable, reportCodes, Section, signed, toneOf, txt, useNarrow } from './primitives';
import { EvidenceList } from './Evidence';
import { plainCaps } from '../../../lib/plain';

function FactorDetail({ f, code }) {
  if (!f) return null;
  if (!f.available) return <NotAvailable reason={f.unavailableReason}>{f.classification?.includes('NOT AVAILABLE') ? f.classification : `No data for ${code} yet`}</NotAvailable>;
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <KindTag kind="KOTKA INTERPRETATION" className="mt-0.5" />
        <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(f.rationale)}</p>
      </div>
      <EvidenceList ids={f.evidence} limit={8} />
      {f.rules?.length ? (
        <details className="group text-xs text-ink-500 dark:text-ink-400">
          <summary className="cursor-pointer select-none text-ink-400 hover:text-ink-600 dark:hover:text-ink-300">How Kotka scores this factor</summary>
          <ul className="mt-1.5 space-y-1 pl-4">
            {f.rules.map((r) => (
              <li key={r} className="list-disc">{txt(r)}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {f.extra?.reer ? <p className="text-xs text-ink-500 dark:text-ink-400"><KindTag kind="KOTKA INTERPRETATION" className="mr-1.5" />{txt(f.extra.reer.text)}</p> : null}
    </div>
  );
}

function ScoreCell({ score, classification }) {
  const narrow = useNarrow();
  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5">
      <FactorBar score={score} width={narrow ? 40 : 88} />
      <span className="w-6 font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{score === null || score === undefined ? '–' : signed(score)}</span>
      <span className="hidden max-w-[10rem] truncate text-[11px] text-ink-400 xl:inline" title={plainCaps(txt(classification))}>{classification?.includes('NOT AVAILABLE') ? 'No data yet' : plainCaps(txt(classification))}</span>
    </div>
  );
}

function PairMatrix({ report }) {
  const [open, setOpen] = useState(null);
  const narrow = useNarrow();
  const { base, quote } = report.pair;
  const B = report.currencies[base];
  const Q = report.currencies[quote];
  return (
    <div className="-mx-5 overflow-x-auto">
      {/* Phones: no Favours column; the coloured left edge shows the side. */}
      <table className="w-full text-left md:min-w-[640px]">
        <thead>
          <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
            <th className="py-2 pl-4 pr-2 font-medium md:px-5">Factor</th>
            <th className="px-1 py-2 font-medium sm:px-2"><CurrencyChip code={base} tone="base" /></th>
            <th className="px-1 py-2 font-medium sm:px-2"><CurrencyChip code={quote} tone="quote" /></th>
            <th className="hidden px-2 py-2 font-medium md:table-cell">Favours</th>
            <th className="w-6 md:w-8" />
          </tr>
        </thead>
        <tbody>
          {report.pair.factors.map((row) => {
            const isOpen = open === row.key;
            const isDiff = row.key === 'policy_differential';
            return (
              <Fragment key={row.key}>
                <tr
                  onClick={() => setOpen(isOpen ? null : row.key)}
                  className={clsx('cursor-pointer border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40', isOpen && 'bg-ink-50/60 dark:bg-ink-800/40')}
                >
                  <td className={clsx('border-l-[3px] py-2.5 pl-[13px] pr-2 md:whitespace-nowrap md:pl-[17px] md:pr-5', row.available && row.favors && row.favors !== 'NEITHER' ? ccy(toneOf(report, row.favors)).border : 'border-transparent')}>
                    <p className="text-sm text-ink-800 dark:text-ink-100">{row.label}</p>
                    {isDiff ? <p className="text-[11px] text-ink-400">Compares both currencies</p> : null}
                  </td>
                  {isDiff ? (
                    <td colSpan={2} className="px-1 py-2.5 sm:px-2">
                      {row.available ? (
                        <div className="flex items-center gap-2.5">
                          <FactorBar score={row.score} width={narrow ? 40 : 88} />
                          <span className="font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{signed(row.score)}</span>
                          <span className="hidden text-[11px] text-ink-400 lg:inline">{row.favors === 'NEITHER' ? 'favours neither' : `favours ${row.favors}`}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink-400">No data yet</span>
                      )}
                    </td>
                  ) : (
                    <>
                      <td className="px-1 py-2.5 sm:px-2"><ScoreCell score={row.base} classification={row.baseClassification} /></td>
                      <td className="px-1 py-2.5 sm:px-2"><ScoreCell score={row.quote} classification={row.quoteClassification} /></td>
                    </>
                  )}
                  <td className="hidden px-2 py-2.5 text-xs md:table-cell">
                    <FavoursPill report={report} favors={row.available ? row.favors : null} />
                  </td>
                  <td className="pr-2 md:pr-4">
                    <ChevronRight className={clsx('h-4 w-4 text-ink-300 transition-transform', isOpen && 'rotate-90')} />
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-ink-100 dark:border-ink-800">
                    <td colSpan={5} className="px-4 pb-5 pt-3 sm:px-5">
                      {isDiff ? (
                        row.available ? (
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <KindTag kind="FACT" className="mt-0.5" />
                              <p className="text-sm text-ink-700 dark:text-ink-200">{txt(row.rationale)}</p>
                            </div>
                            <EvidenceList ids={row.evidence} />
                            <p className="text-xs text-ink-400">{txt(row.rules?.[0])}</p>
                          </div>
                        ) : (
                          <NotAvailable />
                        )
                      ) : (
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                          <div>
                            <CurrencyHeading report={report} code={base} />
                            <FactorDetail f={B.factors[row.key]} code={base} />
                          </div>
                          <div>
                            <CurrencyHeading report={report} code={quote} />
                            <FactorDetail f={Q.factors[row.key]} code={quote} />
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Stored reports come back from Postgres jsonb, which does not keep object key
// order, so factors are always listed in Kotka's weighting order.
const FACTOR_ORDER = ['monetary_policy', 'growth', 'inflation', 'imf_revisions', 'fiscal', 'external', 'financial_stability', 'valuation', 'reserves'];

function CurrencyMatrix({ c }) {
  const [open, setOpen] = useState(null);
  const factors = FACTOR_ORDER.map((k) => c.factors[k]).filter(Boolean);
  return (
    <div className="-mx-5 divide-y divide-ink-50 dark:divide-ink-800/60">
      {factors.map((f) => {
        const isOpen = open === f.key;
        return (
          <div key={f.key}>
            <button type="button" onClick={() => setOpen(isOpen ? null : f.key)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
              <span className="w-32 shrink-0 text-sm text-ink-800 dark:text-ink-100 sm:w-44">{f.label}</span>
              <ScoreCell score={f.available ? f.score : null} classification={f.available ? f.classification : 'DATA NOT AVAILABLE'} />
              <span className="ml-auto hidden text-[11px] text-ink-400 sm:inline" title="How much this factor counts towards the score">counts {Math.round(f.weight * 100)}%</span>
              <ChevronRight className={clsx('h-4 w-4 shrink-0 text-ink-300 transition-transform', isOpen && 'rotate-90')} />
            </button>
            {isOpen ? (
              <div className="px-5 pb-5 pt-1">
                <FactorDetail f={f} code={c.code} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function MacroDrivers({ report }) {
  const isPair = report.kind === 'pair';
  return (
    <Section
      title="Factor scores"
      subtitle="Each factor is scored from −2 (hurting the currency) to +2 (helping it) using official data. Tap a row to see the data behind it."
    >
      {isPair ? <PairMatrix report={report} /> : <CurrencyMatrix c={report.currencies[report.subject]} />}
    </Section>
  );
}

// "Driver 1 - Monetary Policy: evidence, effect, why"
export function MainDrivers({ report }) {
  const codes = reportCodes(report);
  const notes = report.narrative?.driverNotes ?? {};
  return (
    <Section title="Main drivers" subtitle="What’s moving each currency’s score the most.">
      <div className={clsx('grid grid-cols-1 gap-6', codes.length > 1 && 'md:grid-cols-2')}>
        {codes.map((code) => {
          const c = report.currencies[code];
          return (
            <div key={code}>
              {codes.length > 1 ? <CurrencyHeading report={report} code={code}>{c.name}</CurrencyHeading> : null}
              {c.drivers.length ? (
                <ol className="space-y-4">
                  {c.drivers.map((d, i) => (
                    <li key={d.factor}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                          <span className="mr-1.5 font-mono text-xs text-ink-400">{i + 1}</span>
                          {d.label}
                        </p>
                        <span
                          className={clsx(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            d.effect === 'POSITIVE' ? 'bg-profit-50 text-profit-600 dark:bg-profit-500/10 dark:text-profit-400' : d.effect === 'NEGATIVE' ? 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                          )}
                        >
                          {d.effect === 'POSITIVE' ? 'Helps' : d.effect === 'NEGATIVE' ? 'Hurts' : 'Mixed'} {signed(d.score)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <EvidenceList ids={d.evidence} limit={4} />
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{txt(notes[`${code}.${d.factor}`] ?? d.rationale)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-400">No factor currently moves {code}'s score away from neutral.</p>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
