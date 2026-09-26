import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { ccy, CurrencyChip, CurrencyHeading, KindTag, NotAvailable, reasonAfterPrefix, reportCodes, Section, signed, signedFixed, toneOf, txt } from './primitives';
import { EvidenceList } from './Evidence';

// Strongest factor tile: in a pair it's tinted by the currency it favours;
// for a single currency, green for the strongest support, red for the drag.
function StrongestTile({ s, cls }) {
  if (!s) return null;
  return (
    <div className={clsx('rounded-xl border-l-4 p-4', cls)}>
      <p className="text-xs text-ink-500 dark:text-ink-400">{s.title}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink-900 dark:text-ink-50">{s.label}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{txt(s.rationale)}</p>
      <div className="mt-2">
        <EvidenceList ids={s.evidence} limit={2} />
      </div>
    </div>
  );
}

export function WhySection({ report }) {
  const isPair = report.kind === 'pair';
  const why = report.narrative?.why ?? [];
  let tiles;
  if (isPair) {
    const { base, quote } = report.pair;
    const pick = (code, sign) => {
      const row = report.pair.factors.filter((f) => f.available && Math.sign(f.diff) === sign).sort((a, b) => Math.abs(b.weight * b.diff) - Math.abs(a.weight * a.diff))[0];
      if (!row) return { s: { title: `Strongest factor for ${code}`, label: 'None', rationale: `No factor currently favours ${code} on Kotka's rules.`, evidence: [] }, code };
      const f = report.currencies[code].factors[row.key];
      return {
        code,
        s: { title: `Strongest factor for ${code}`, label: row.label, rationale: row.key === 'policy_differential' ? row.rationale : f?.rationale, evidence: row.key === 'policy_differential' ? row.evidence : f?.evidence },
      };
    };
    tiles = [pick(base, 1), pick(quote, -1)].map(({ s, code }) => {
      const c = ccy(toneOf(report, code));
      return { s, cls: clsx(c.border, c.soft) };
    });
  } else {
    const c = report.currencies[report.subject];
    tiles = [
      { s: c.strongestPositive ? { title: 'Strongest positive factor', ...c.strongestPositive } : { title: 'Strongest positive factor', label: 'None', rationale: 'No factor currently scores positively.', evidence: [] }, cls: 'border-profit-500 bg-profit-50/60 dark:bg-profit-500/10' },
      { s: c.strongestNegative ? { title: 'Strongest negative factor', ...c.strongestNegative } : { title: 'Strongest negative factor', label: 'None', rationale: 'No factor currently scores negatively.', evidence: [] }, cls: 'border-loss-500 bg-loss-50/60 dark:bg-loss-500/10' },
    ];
  }
  return (
    <Section title="Why" subtitle="The three most important reasons behind the reading, and the strongest factor on each side.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <ol className="space-y-4 lg:col-span-7">
          {why.map((w, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-[11px] font-semibold text-accent-400 dark:bg-ink-800">{i + 1}</span>
              <div className="min-w-0 space-y-1.5">
                <KindTag kind={w.kind} />
                <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(w.text)}</p>
                <EvidenceList ids={w.evidence} limit={3} />
              </div>
            </li>
          ))}
        </ol>
        <div className="space-y-3 lg:col-span-5">
          {tiles.map((t, i) => (
            <StrongestTile key={i} s={t.s} cls={t.cls} />
          ))}
        </div>
      </div>
    </Section>
  );
}

export function RelativeSection({ report }) {
  const { base, quote } = report.pair;
  const rv = report.narrative?.relativeView ?? {};
  const d = report.pair.differentials ?? {};
  const rows = [
    d.policyRate && { label: 'Policy rate', b: txt(report.currencies[base].policy?.display), q: txt(report.currencies[quote].policy?.display), diff: d.policyRate.now, unit: 'pts', note: d.policyRate.change !== null ? `${signedFixed(d.policyRate.change)} pts vs 6 months ago` : null },
    d.realRate && { label: 'Real policy rate', b: `${signedFixed(d.realRate.base)} pts`, q: `${signedFixed(d.realRate.quote)} pts`, diff: d.realRate.diff, unit: 'pts' },
    d.inflationGap && { label: 'Inflation vs target', b: `${signedFixed(d.inflationGap.base)} pp`, q: `${signedFixed(d.inflationGap.quote)} pp`, diff: d.inflationGap.diff, unit: 'pp', closer: [Math.abs(d.inflationGap.base), Math.abs(d.inflationGap.quote)] },
    d.growth && { label: `IMF growth projection ${d.growth.year}`, b: `${d.growth.base.toFixed(2)}%`, q: `${d.growth.quote.toFixed(2)}%`, diff: d.growth.diff, unit: 'pp' },
    d.fiscalBalance && { label: 'Fiscal balance (% GDP)', b: `${d.fiscalBalance.base.toFixed(1)}%`, q: `${d.fiscalBalance.quote.toFixed(1)}%`, diff: d.fiscalBalance.diff, unit: 'pp', dp: 1 },
    d.currentAccount && { label: 'Current account (% GDP)', b: `${d.currentAccount.base.toFixed(1)}%`, q: `${d.currentAccount.quote.toFixed(1)}%`, diff: d.currentAccount.diff, unit: 'pp', dp: 1 },
  ].filter(Boolean);
  const cb = ccy('base');
  const cq = ccy('quote');
  // The side a differential leans to, shown in that currency's colour.
  const leanTone = (r) => {
    if (r.closer) return Math.abs(r.closer[0] - r.closer[1]) < 0.005 ? null : r.closer[0] < r.closer[1] ? 'base' : 'quote';
    if (Math.abs(r.diff) < 0.005) return null;
    return r.diff > 0 ? 'base' : 'quote';
  };
  return (
    <Section title={`${base}${quote} relative analysis`} subtitle={`What favours ${base} relative to ${quote}, what favours ${quote}, and the key differentials.`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { code: base, text: rv.favorsBase, c: cb },
          { code: quote, text: rv.favorsQuote, c: cq },
        ].map(({ code, text, c }) => (
          <div key={code} className={clsx('rounded-xl border-l-4 p-4', c.border, c.soft)}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs text-ink-500 dark:text-ink-400">Favouring</span>
              <CurrencyChip code={code} tone={toneOf(report, code)} />
            </div>
            <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(text)}</p>
          </div>
        ))}
      </div>
      {rows.length ? (
        <div className="-mx-5 mt-5 overflow-x-auto border-t border-ink-100 dark:border-ink-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-[11px] text-ink-400">
                <th className="px-5 py-2 font-medium">Differential</th>
                <th className="px-2 py-2 font-medium"><CurrencyChip code={base} tone="base" /></th>
                <th className="px-2 py-2 font-medium"><CurrencyChip code={quote} tone="quote" /></th>
                <th className="px-5 py-2 text-right font-medium">{base} minus {quote}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {rows.map((r) => {
                const lean = leanTone(r);
                return (
                  <tr key={r.label} className="border-t border-ink-50 dark:border-ink-800/60">
                    <td className="px-5 py-2 font-sans text-sm text-ink-700 dark:text-ink-200">{r.label}</td>
                    <td className={clsx('px-2 py-2', lean === 'base' ? clsx(cb.text, 'font-semibold') : 'text-ink-700 dark:text-ink-200')}>{r.b ?? 'n/a'}</td>
                    <td className={clsx('px-2 py-2', lean === 'quote' ? clsx(cq.text, 'font-semibold') : 'text-ink-700 dark:text-ink-200')}>{r.q ?? 'n/a'}</td>
                    <td className="px-5 py-2 text-right text-ink-900 dark:text-ink-50">
                      {signedFixed(r.diff, r.dp ?? 2)} {r.unit}
                      {r.note ? <span className="block font-sans text-[11px] text-ink-400">{r.note}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-5 pt-2 text-[11px] text-ink-400">The side with the stronger reading on each line is highlighted in its currency colour (for inflation, the side closer to target).</p>
        </div>
      ) : null}
    </Section>
  );
}

// Fundamental reality vs what markets price vs what price has done.
export function RealityVsExpectations({ report }) {
  const codes = reportCodes(report);
  const isPair = report.kind === 'pair';
  const mp = report.pair?.marketPrice;
  return (
    <Section title="Fundamental reality vs market expectations" subtitle="What the data says, kept separate from what markets appear to price. Fundamentals can improve while price falls if markets had priced in more.">
      <div className={clsx('grid grid-cols-1 gap-5', codes.length > 1 && 'lg:grid-cols-2')}>
        {codes.map((code) => {
          const c = report.currencies[code];
          const me = c.marketExpectations;
          return (
            <div key={code}>
              <CurrencyHeading report={report} code={code}>{c.centralBank.name}</CurrencyHeading>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-400/5">
                  <div className="mb-1 flex items-center gap-2">
                    <p className="text-xs font-medium text-ink-600 dark:text-ink-300">What the data says</p>
                    <KindTag kind="FACT" />
                  </div>
                  <p className="text-sm text-ink-700 dark:text-ink-200">
                    {txt(c.policy?.display ?? 'n/a')}, actual stance <span className="font-medium">{c.policy?.stance?.toLowerCase() ?? 'n/a'}</span>
                    {c.policy?.cum6m !== null && c.policy?.cum6m !== undefined ? ` (${signed(c.policy.cum6m)}bp over 6 months)` : ''}. Fundamental score {c.score}/100.
                  </p>
                </div>
                <div className="rounded-lg border border-dashed border-ink-200 p-3 dark:border-ink-700">
                  <div className="mb-1 flex items-center gap-2">
                    <p className="text-xs font-medium text-ink-600 dark:text-ink-300">What markets appear to expect</p>
                    <KindTag kind="MARKET EXPECTATION" />
                  </div>
                  {me?.available ? (
                    <>
                      <p className="text-sm text-ink-700 dark:text-ink-200">{txt(me.summary)}</p>
                      {me.divergent ? <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Market pricing contradicts the actual policy direction.</p> : null}
                      <div className="mt-1.5">
                        <EvidenceList ids={me.evidence?.slice(0, 1)} />
                      </div>
                    </>
                  ) : (
                    <NotAvailable reason={reasonAfterPrefix(me?.summary)}>MARKET EXPECTATION DATA NOT AVAILABLE</NotAvailable>
                  )}
                </div>
              </div>
              {me?.available ? <p className="mt-2 text-[11px] text-ink-400">{txt(me.caveat)}</p> : null}
            </div>
          );
        })}
      </div>
      {isPair ? (
        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-ink-100 pt-4 dark:border-ink-800 md:grid-cols-2">
          <div className="rounded-lg border border-dashed border-ink-200 p-3 dark:border-ink-700">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-xs font-medium text-ink-600 dark:text-ink-300">Relative rate expectations</p>
              <KindTag kind="MARKET EXPECTATION" />
            </div>
            {report.pair.market?.available ? <p className="text-sm text-ink-700 dark:text-ink-200">{txt(report.pair.market.summary)}</p> : <NotAvailable reason={reasonAfterPrefix(report.pair.market?.summary)}>MARKET EXPECTATION DATA NOT AVAILABLE</NotAvailable>}
          </div>
          <div className="rounded-lg border border-dashed border-ink-200 p-3 dark:border-ink-700">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-xs font-medium text-ink-600 dark:text-ink-300">What price has done</p>
              <KindTag kind="MARKET PRICE" />
            </div>
            {mp?.available ? (
              <p className="text-sm text-ink-700 dark:text-ink-200">
                {report.subject}{' '}
                <span className={clsx('font-mono tabular-nums', mp.change1m >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>{signedFixed(mp.change1m)}%</span> over 1 month and{' '}
                <span className={clsx('font-mono tabular-nums', mp.change3m >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500')}>{signedFixed(mp.change3m)}%</span> over 3 months, to {mp.last} ({mp.lastDate}, {mp.source?.name}).
              </p>
            ) : (
              <NotAvailable reason={mp?.reason}>PRICE DATA NOT AVAILABLE</NotAvailable>
            )}
          </div>
        </div>
      ) : null}
    </Section>
  );
}

export function WhatChangedSection({ report }) {
  const codes = reportCodes(report).filter((c) => report.whatChanged?.[c]);
  const since = report.whatChanged?.[codes[0]]?.since;
  return (
    <Section title="What changed" subtitle={since ? `Since ${since}, compared with the same evidence as it stood then.` : undefined}>
      <div className="space-y-5">
        {codes.map((code) => (
          <div key={code}>
            {codes.length > 1 ? <CurrencyHeading report={report} code={code} /> : null}
            <ul className="space-y-2">
              {report.whatChanged[code].items.slice(0, 8).map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <KindTag kind={item.kind} className="mt-0.5" />
                  <p className="text-sm text-ink-700 dark:text-ink-200">{txt(item.text)}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function InvalidationSection({ report }) {
  const risk = report.narrative?.biggestRisk;
  return (
    <Section title="What could change this view" subtitle="Concrete developments that would move the assessment under Kotka's scoring rules.">
      {risk ? (
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Biggest risk</p>
              <KindTag kind="KOTKA INTERPRETATION" />
            </div>
            <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">{txt(risk)}</p>
          </div>
        </div>
      ) : null}
      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {report.invalidation.map((item, i) => {
          const isCurrency = report.currencies[item.currency];
          return (
            <li key={`${item.currency}-${item.factor}`} className="flex gap-3 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
              <span className="mt-0.5 font-mono text-xs text-ink-400">{i + 1}</span>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {isCurrency ? <CurrencyChip code={item.currency} tone={toneOf(report, item.currency)} /> : <span className="font-mono text-[11px] font-semibold text-ink-600 dark:text-ink-300">{item.currency}</span>}
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{item.label}</span>
                </div>
                <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(item.text)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
