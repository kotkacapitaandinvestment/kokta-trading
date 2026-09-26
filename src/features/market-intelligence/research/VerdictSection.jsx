import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { conditionTone, directionWord, fmt, KindTag, reportCodes, ScoreFigure, signed, txt } from './primitives';

function NarrativeSourceNote({ narrative }) {
  if (!narrative) return null;
  const ai = narrative.source === 'ai';
  return (
    <p className="text-[11px] text-ink-400">
      {ai ? 'Written by Kotka AI from the verified evidence below; every figure was checked against source data.' : 'Composed by Kotka’s rules engine from the verified evidence below.'}
    </p>
  );
}

function ConfidenceBreakdown({ components }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {components.map((c) => (
        <div key={c.key} className="flex items-start justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="text-ink-700 dark:text-ink-200">{c.label}</p>
            <p className="text-ink-400">{txt(c.detail)}</p>
          </div>
          <span className="shrink-0 font-mono tabular-nums text-ink-800 dark:text-ink-100">{Math.round(c.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function CurrencyRow({ c, direction, centralBank }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
            {c.code} <span className="font-normal text-ink-400">{c.name}</span>
          </p>
          <p className={clsx('mt-0.5 text-xs font-medium tracking-wide', conditionTone(c.condition))}>
            {c.condition}
            <span className="font-normal text-ink-400"> ({c.band ?? 'n/a'})</span>
          </p>
        </div>
        <ScoreFigure value={c.score} className="text-2xl text-ink-900 dark:text-ink-50" />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-400">Direction</dt>
          <dd className="text-ink-700 dark:text-ink-200">{directionWord(direction?.label)}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Confidence</dt>
          <dd className="font-mono tabular-nums text-ink-700 dark:text-ink-200">{c.confidence}</dd>
        </div>
        <div>
          <dt className="text-ink-400">{centralBank?.short ?? 'Policy'}</dt>
          <dd className="text-ink-700 dark:text-ink-200">
            {txt(c.policy?.display ?? 'n/a')} {c.policy?.stance ? <span className="text-ink-400">{c.policy.stance.toLowerCase()}</span> : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function VerdictSection({ report }) {
  const [showConfidence, setShowConfidence] = useState(false);
  const isPair = report.kind === 'pair';
  const v = report.verdict;
  const codes = reportCodes(report);
  const primary = report.currencies[codes[0]];
  const direction = report.directions?.[report.subject];
  const confidenceComponents = isPair
    ? [
        ...codes.map((code) => ({ key: code, label: `${code} evidence confidence`, value: report.currencies[code].confidence / 100, detail: `${report.currencies[code].confidenceComponents.find((x) => x.key === 'coverage')?.detail ?? ''}` })),
        { key: 'agreement', label: 'Agreement across factor comparisons', value: report.pair.pairAgreement, detail: 'Share of the weighted evidence pointing the same way as the net reading' },
      ]
    : primary.confidenceComponents;

  return (
    <section className="rounded-2xl border border-ink-100 bg-white dark:border-ink-700 dark:bg-ink-900">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="border-b border-ink-100 p-5 dark:border-ink-800 lg:col-span-7 lg:border-b-0 lg:border-r lg:p-6">
          <p className="text-xs text-ink-400">Kotka Macro Verdict</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {report.subject}
            <span className="ml-2 text-sm font-normal text-ink-400">{codes.map((code) => report.currencies[code].name).join(' vs ')}</span>
          </h2>

          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="text-xs text-ink-400">{isPair ? 'Relative fundamental condition' : 'Fundamental score'}</p>
              <ScoreFigure value={v.score} className="text-5xl text-ink-900 dark:text-ink-50" />
            </div>
            <div className="pb-1.5">
              <p className={clsx('text-lg font-semibold tracking-wide', conditionTone(v.condition))}>{v.condition}</p>
              <p className="text-xs text-ink-400">
                {directionWord(direction?.label)}
                {direction?.change1m !== undefined ? ` · ${signed(direction.change1m)} over 1 month, ${signed(direction.change3m)} over 3 months` : ''}
              </p>
            </div>
            <div className="pb-1.5">
              <p className="text-xs text-ink-400">Confidence</p>
              <button type="button" onClick={() => setShowConfidence((s) => !s)} className="flex items-center gap-1 text-lg font-semibold text-ink-900 dark:text-ink-50" aria-expanded={showConfidence}>
                {v.confidence}
                <span className="text-xs font-normal text-ink-400">/100</span>
                <ChevronDown className={clsx('h-3.5 w-3.5 text-ink-400 transition-transform', showConfidence && 'rotate-180')} />
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {isPair ? 'Above 50 favours the base currency, below 50 the quote currency. ' : ''}Confidence measures how complete, recent and consistent the evidence is. It is not the same thing as strength.
          </p>
          {showConfidence ? <ConfidenceBreakdown components={confidenceComponents} /> : null}

          <div className="mt-5 border-t border-ink-100 pt-4 dark:border-ink-800">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Bottom line</p>
              <KindTag kind="KOTKA INTERPRETATION" />
            </div>
            <p className="max-w-[70ch] text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(report.narrative?.bottomLine)}</p>
            <div className="mt-2">
              <NarrativeSourceNote narrative={report.narrative} />
            </div>
          </div>
        </div>

        <div className="p-5 lg:col-span-5 lg:p-6">
          <p className="mb-3 text-xs text-ink-400">{isPair ? 'Each currency on its own evidence' : 'Central bank and evidence'}</p>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {codes.map((code) => (
              <CurrencyRow key={code} c={report.currencies[code]} direction={report.directions?.[code]} centralBank={report.currencies[code].centralBank} />
            ))}
          </div>
          {report.sinceLastResearch ? (
            <p className="mt-4 text-xs text-ink-400">
              Since the previous Kotka research ({new Date(report.sinceLastResearch.previousAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}): {report.sinceLastResearch.previous} to {report.sinceLastResearch.current} ({signed(report.sinceLastResearch.change)}).
            </p>
          ) : null}
          {isPair && report.pair.marketPrice?.available ? (
            <p className="mt-2 text-xs text-ink-400">
              Spot {report.subject} {fmt(report.pair.marketPrice.last, 4)} on {report.pair.marketPrice.lastDate}. Price is shown for context only; it is not part of the fundamental score.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
