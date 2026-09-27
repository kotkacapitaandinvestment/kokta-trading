import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, TrendingDown, TrendingUp, Minus, Repeat } from 'lucide-react';
import InfoTip from '../../../components/ui/InfoTip';
import { ccy, conditionTone, conditionWord, CurrencyChip, directionWord, fmt, KindTag, reportCodes, ScoreFigure, signed, toneOf, txt } from './primitives';

function NarrativeSourceNote({ narrative }) {
  if (!narrative) return null;
  return (
    <p className="text-[11px] text-ink-400">
      {narrative.source === 'ai'
        ? 'Written by Kotka from the data below. Every number was checked against its source.'
        : 'Summarised by Kotka from the data below.'}
    </p>
  );
}

function ConfidenceBreakdown({ components }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl bg-ink-50 p-3 sm:grid-cols-2 dark:bg-ink-800/60">
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

// Tug-of-war gauge: quote colour on the left, base colour on the right, a
// neutral "balanced" band in the middle (42-58), marker at the score.
function RelativeGauge({ score, base, quote }) {
  const left = ccy('quote');
  const right = ccy('base');
  const pos = Math.max(0, Math.min(100, score ?? 50));
  return (
    <div role="img" aria-label={`Relative score ${score} of 100: below 42 favours ${quote}, 42 to 58 balanced, above 58 favours ${base}`}>
      <div className="relative h-3">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div className="h-full bg-ccyquote/25 dark:bg-ccyquote-dark/30" style={{ width: '42%' }} />
          <div className="h-full bg-ink-100 dark:bg-ink-800" style={{ width: '16%' }} />
          <div className="h-full bg-ccybase/30 dark:bg-ccybase/35" style={{ width: '42%' }} />
        </div>
        <span className="absolute top-0 h-3 w-px bg-ink-300 dark:bg-ink-600" style={{ left: '50%' }} />
        <span
          className={clsx('absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-ink-900', pos > 58 ? right.dot : pos < 42 ? left.dot : 'bg-ink-700 dark:bg-ink-200')}
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px]">
        <span className={clsx('font-medium', left.text)}>Stronger {quote}</span>
        <span className="text-ink-400">Balanced</span>
        <span className={clsx('font-medium', right.text)}>Stronger {base}</span>
      </div>
    </div>
  );
}

// Single-currency scale: weak (red) → neutral → strong (green).
function StrengthGauge({ score }) {
  const pos = Math.max(0, Math.min(100, score ?? 50));
  return (
    <div role="img" aria-label={`Fundamental score ${score} of 100: under 40 weak, 40 to 59 neutral, 60 and above strong`}>
      <div className="relative h-3">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <div className="h-full bg-loss-500/15" style={{ width: '40%' }} />
          <div className="h-full bg-ink-100 dark:bg-ink-800" style={{ width: '20%' }} />
          <div className="h-full bg-profit-500/15" style={{ width: '40%' }} />
        </div>
        <span
          className={clsx('absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-ink-900', pos >= 60 ? 'bg-profit-500' : pos < 40 ? 'bg-loss-500' : 'bg-ink-700 dark:bg-ink-200')}
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-400">
        <span className="font-medium text-loss-500">Weak</span>
        <span>Neutral</span>
        <span className="font-medium text-profit-600 dark:text-profit-400">Strong</span>
      </div>
    </div>
  );
}

function DirectionChip({ report, direction }) {
  if (!direction?.label) return null;
  const isPair = report.kind === 'pair';
  const label = direction.label;
  let text = directionWord(label);
  let cls = 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300';
  let Icon = Minus;
  if (isPair && (label === 'STRENGTHENING' || label === 'WEAKENING')) {
    const toward = label === 'STRENGTHENING' ? report.base : report.quote;
    const c = ccy(toneOf(report, toward));
    text = `Shifting toward ${toward}`;
    cls = clsx(c.soft, c.text);
    Icon = label === 'STRENGTHENING' ? TrendingUp : TrendingDown;
  } else if (label === 'STRENGTHENING') {
    cls = 'bg-profit-50 text-profit-600 dark:bg-profit-500/10 dark:text-profit-400';
    Icon = TrendingUp;
  } else if (label === 'WEAKENING') {
    cls = 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400';
    Icon = TrendingDown;
  } else if (label === 'REVERSING') {
    cls = 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
    Icon = Repeat;
  }
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cls)}>
      <Icon className="h-3.5 w-3.5" />
      {text}
      {direction.change1m !== undefined ? <span className="font-normal opacity-75">({signed(direction.change1m)} this month, {signed(direction.change3m)} over 3 months)</span> : null}
    </span>
  );
}

function CurrencyTile({ report, c }) {
  const tone = toneOf(report, c.code);
  const s = ccy(tone);
  const dir = report.directions?.[c.code];
  return (
    <div className={clsx('rounded-xl border-l-4 bg-ink-50/70 p-4 dark:bg-ink-800/50', s.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CurrencyChip code={c.code} tone={tone} />
            <span className="truncate text-xs text-ink-500 dark:text-ink-400">{c.name}</span>
          </div>
          <p className={clsx('mt-2 text-sm font-semibold tracking-wide', conditionTone(c.condition))}>
            {conditionWord(c.condition)}
            {c.band && c.band.toLowerCase() !== conditionWord(c.condition).toLowerCase() ? <span className="ml-1 text-xs font-normal text-ink-400">{c.band}</span> : null}
          </p>
        </div>
        <ScoreFigure value={c.score} className="text-3xl text-ink-900 dark:text-ink-50" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-400">Direction</dt>
          <dd className="text-ink-700 dark:text-ink-200">{directionWord(dir?.label)}</dd>
        </div>
        <div>
          <dt className="text-ink-400">Confidence</dt>
          <dd className="font-mono tabular-nums text-ink-700 dark:text-ink-200">{c.confidence}<span className="text-ink-400">/100</span></dd>
        </div>
        <div>
          <dt className="text-ink-400">{c.centralBank?.short ?? 'Policy'}</dt>
          <dd className="text-ink-700 dark:text-ink-200">
            {txt(c.policy?.display ?? 'n/a')} <span className="text-ink-400">{c.policy?.stance?.toLowerCase() ?? ''}</span>
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
  const confidenceComponents = isPair
    ? [
        ...codes.map((code) => ({ key: code, label: `How complete the ${code} data is`, value: report.currencies[code].confidence / 100, detail: report.currencies[code].confidenceComponents.find((x) => x.key === 'coverage')?.detail ?? '' })),
        { key: 'agreement', label: 'How much the data agrees', value: report.pair.pairAgreement, detail: 'How much of the data points the same way as the overall reading' },
      ]
    : primary.confidenceComponents;
  const strongerCode = isPair && v.condition?.startsWith('STRONGER ') ? v.condition.split(' ')[1] : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-700 dark:bg-ink-900">
      <div className="h-1 bg-gradient-to-r from-accent-700 via-accent-500 to-accent-300" aria-hidden />
      <div className="p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-accent-700 dark:text-accent-400">The overall picture</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              {report.subject}
              <span className="ml-2 text-sm font-normal text-ink-400">{codes.map((code) => report.currencies[code].name).join(' vs ')}</span>
            </h2>
          </div>
          <DirectionChip report={report} direction={report.directions?.[report.subject]} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="flex items-center gap-1 text-xs text-ink-400">
                  {isPair ? 'Which economy looks stronger' : 'Fundamental score'}
                  <InfoTip label={isPair ? 'Relative condition' : 'Fundamental score'}>
                    {isPair
                      ? 'Compares the two economies on official data. 50 means evenly matched; 58 or more favours the first currency, 42 or less the second. It describes fundamentals, not the next price move.'
                      : 'A weighted score from 0 to 100 built from official data such as growth, inflation, jobs and rates. 60 or more reads strong, under 40 weak. It describes fundamentals, not the next price move.'}
                  </InfoTip>
                </p>
                <ScoreFigure value={v.score} className="text-5xl text-ink-900 dark:text-ink-50" />
              </div>
              <p className={clsx('pb-2 text-xl font-semibold tracking-wide', strongerCode ? ccy(toneOf(report, strongerCode)).text : conditionTone(v.condition))}>{conditionWord(v.condition)}</p>
              <div className="pb-1.5">
                <p className="text-xs text-ink-400">Confidence</p>
                <button type="button" onClick={() => setShowConfidence((s) => !s)} className="flex items-center gap-1 text-lg font-semibold text-ink-900 dark:text-ink-50" aria-expanded={showConfidence}>
                  {v.confidence}
                  <span className="text-xs font-normal text-ink-400">/100</span>
                  <ChevronDown className={clsx('h-3.5 w-3.5 text-ink-400 transition-transform', showConfidence && 'rotate-180')} />
                </button>
              </div>
            </div>
            {isPair ? <RelativeGauge score={v.score} base={report.base} quote={report.quote} /> : <StrengthGauge score={v.score} />}
            <p className="text-[11px] text-ink-400">Confidence measures how complete, recent and consistent the evidence is. It is not the same thing as strength.</p>
            {showConfidence ? <ConfidenceBreakdown components={confidenceComponents} /> : null}
          </div>

          <div className="space-y-3 lg:col-span-5">
            {codes.map((code) => (
              <CurrencyTile key={code} report={report} c={report.currencies[code]} />
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-400/20 dark:bg-violet-400/5">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Bottom line</p>
            <KindTag kind="KOTKA INTERPRETATION" />
          </div>
          <p className="max-w-[80ch] text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(report.narrative?.bottomLine)}</p>
          <div className="mt-2">
            <NarrativeSourceNote narrative={report.narrative} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-400">
          {report.sinceLastResearch ? (
            <span>
              Since the previous Kotka research ({new Date(report.sinceLastResearch.previousAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}): {report.sinceLastResearch.previous} to {report.sinceLastResearch.current} ({signed(report.sinceLastResearch.change)}).
            </span>
          ) : null}
          {isPair && report.pair.marketPrice?.available ? (
            <span>
              {report.subject.slice(0, 3)}/{report.subject.slice(3)} closed at {fmt(report.pair.marketPrice.last, 4)} on {new Date(`${report.pair.marketPrice.lastDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Price isn’t part of this score.
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
