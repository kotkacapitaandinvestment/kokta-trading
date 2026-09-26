import { Fragment, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { FactorBar, KindTag, NotAvailable, reportCodes, Section, signed, txt } from './primitives';
import { EvidenceList } from './Evidence';

function FactorDetail({ f, code }) {
  if (!f) return null;
  if (!f.available) return <NotAvailable reason={f.unavailableReason}>{f.classification?.includes('NOT AVAILABLE') ? f.classification : `${code}: DATA NOT AVAILABLE`}</NotAvailable>;
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
  return (
    <div className="flex items-center gap-2.5">
      <FactorBar score={score} />
      <span className="w-6 font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{score === null || score === undefined ? 'n/a' : signed(score)}</span>
      <span className="hidden max-w-[10rem] truncate text-[11px] text-ink-400 xl:inline" title={txt(classification)}>{classification?.includes('NOT AVAILABLE') ? 'Not available' : txt(classification)}</span>
    </div>
  );
}

function PairMatrix({ report }) {
  const [open, setOpen] = useState(null);
  const { base, quote } = report.pair;
  const B = report.currencies[base];
  const Q = report.currencies[quote];
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
            <th className="px-5 py-2 font-medium">Factor</th>
            <th className="px-2 py-2 font-medium">{base}</th>
            <th className="px-2 py-2 font-medium">{quote}</th>
            <th className="px-2 py-2 font-medium">Favours</th>
            <th className="w-8" />
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
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <p className="text-sm text-ink-800 dark:text-ink-100">{row.label}</p>
                    {isDiff ? <p className="text-[11px] text-ink-400">Pair-level evidence</p> : null}
                  </td>
                  {isDiff ? (
                    <td colSpan={2} className="px-2 py-2.5">
                      {row.available ? (
                        <div className="flex items-center gap-2.5">
                          <FactorBar score={row.score} />
                          <span className="font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{signed(row.score)}</span>
                          <span className="hidden text-[11px] text-ink-400 lg:inline">toward {row.favors === 'NEITHER' ? 'neither' : row.favors}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-ink-400">DATA NOT AVAILABLE</span>
                      )}
                    </td>
                  ) : (
                    <>
                      <td className="px-2 py-2.5"><ScoreCell score={row.base} classification={row.baseClassification} /></td>
                      <td className="px-2 py-2.5"><ScoreCell score={row.quote} classification={row.quoteClassification} /></td>
                    </>
                  )}
                  <td className="px-2 py-2.5 text-xs">
                    {row.available ? (
                      <span className={clsx('font-medium', row.favors === 'NEITHER' ? 'text-ink-400' : 'text-ink-800 dark:text-ink-100')}>{row.favors === 'NEITHER' ? 'Neither' : row.favors}</span>
                    ) : (
                      <span className="font-mono text-[11px] text-ink-400">n/a</span>
                    )}
                  </td>
                  <td className="pr-4">
                    <ChevronRight className={clsx('h-4 w-4 text-ink-300 transition-transform', isOpen && 'rotate-90')} />
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-ink-100 dark:border-ink-800">
                    <td colSpan={5} className="px-5 pb-5 pt-3">
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
                            <p className="mb-2 text-xs font-semibold text-ink-500 dark:text-ink-400">{base}</p>
                            <FactorDetail f={B.factors[row.key]} code={base} />
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-semibold text-ink-500 dark:text-ink-400">{quote}</p>
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
              <span className="w-44 shrink-0 text-sm text-ink-800 dark:text-ink-100">{f.label}</span>
              <ScoreCell score={f.available ? f.score : null} classification={f.available ? f.classification : 'DATA NOT AVAILABLE'} />
              <span className="ml-auto hidden font-mono text-[11px] text-ink-400 sm:inline">weight {Math.round(f.weight * 100)}%</span>
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
      title="Macro drivers"
      subtitle="Each factor is scored from -2 (strongly negative) to +2 (strongly positive) by fixed rules applied to official data. Select a factor for its evidence."
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
    <Section title="Main drivers" subtitle="The factors with the largest weighted effect on each currency's score.">
      <div className={clsx('grid grid-cols-1 gap-6', codes.length > 1 && 'md:grid-cols-2')}>
        {codes.map((code) => {
          const c = report.currencies[code];
          return (
            <div key={code}>
              {codes.length > 1 ? <p className="mb-3 text-xs font-semibold text-ink-500 dark:text-ink-400">{code}</p> : null}
              {c.drivers.length ? (
                <ol className="space-y-4">
                  {c.drivers.map((d, i) => (
                    <li key={d.factor}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                          <span className="mr-1.5 font-mono text-xs text-ink-400">{i + 1}</span>
                          {d.label}
                        </p>
                        <span className={clsx('text-xs font-medium', d.effect === 'POSITIVE' ? 'text-profit-600 dark:text-profit-400' : d.effect === 'NEGATIVE' ? 'text-loss-500' : 'text-ink-500')}>
                          {d.effect === 'POSITIVE' ? 'Positive' : d.effect === 'NEGATIVE' ? 'Negative' : 'Mixed'} ({signed(d.score)})
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
