import clsx from 'clsx';
import { KindTag, NotAvailable, reasonAfterPrefix, reportCodes, Section, signed, signedFixed, txt } from './primitives';
import { EvidenceList } from './Evidence';

export function WhySection({ report }) {
  const isPair = report.kind === 'pair';
  const why = report.narrative?.why ?? [];
  let strongest;
  if (isPair) {
    const { base, quote } = report.pair;
    const pick = (code, sign) => {
      const rows = report.pair.factors.filter((f) => f.available && Math.sign(f.diff) === sign).sort((a, b) => Math.abs(b.weight * b.diff) - Math.abs(a.weight * a.diff));
      const row = rows[0];
      if (!row) return null;
      const f = report.currencies[code].factors[row.key];
      return { title: `Strongest factor for ${code}`, label: row.label, rationale: row.key === 'policy_differential' ? row.rationale : f?.rationale, evidence: row.key === 'policy_differential' ? row.evidence : f?.evidence };
    };
    strongest = [pick(base, 1), pick(quote, -1)];
  } else {
    const c = report.currencies[report.subject];
    strongest = [
      c.strongestPositive ? { title: 'Strongest positive factor', label: c.strongestPositive.label, rationale: c.strongestPositive.rationale, evidence: c.strongestPositive.evidence } : null,
      c.strongestNegative ? { title: 'Strongest negative factor', label: c.strongestNegative.label, rationale: c.strongestNegative.rationale, evidence: c.strongestNegative.evidence } : null,
    ];
  }
  return (
    <Section title="Why" subtitle="The three most important reasons behind the current reading.">
      <ol className="space-y-3">
        {why.map((w, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 font-mono text-xs text-ink-400">{i + 1}</span>
            <div className="min-w-0 space-y-1.5">
              <KindTag kind={w.kind} />
              <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(w.text)}</p>
              <EvidenceList ids={w.evidence} limit={3} />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-ink-100 pt-4 dark:border-ink-800 sm:grid-cols-2 xl:grid-cols-1">
        {strongest.map((s, i) =>
          s ? (
            <div key={i}>
              <p className="text-xs text-ink-400">{s.title}</p>
              <p className="mt-0.5 text-sm font-medium text-ink-900 dark:text-ink-50">{s.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{txt(s.rationale)}</p>
              <div className="mt-2">
                <EvidenceList ids={s.evidence} limit={2} />
              </div>
            </div>
          ) : (
            <div key={i}>
              <p className="text-xs text-ink-400">{i === 0 ? 'Strongest positive factor' : 'Strongest negative factor'}</p>
              <p className="mt-0.5 text-sm text-ink-500">None: no factor scores in this direction.</p>
            </div>
          ),
        )}
      </div>
    </Section>
  );
}

export function RelativeSection({ report }) {
  const { base, quote } = report.pair;
  const rv = report.narrative?.relativeView ?? {};
  const d = report.pair.differentials ?? {};
  const rows = [
    d.policyRate && { label: 'Policy rate', b: txt(report.currencies[base].policy?.display), q: txt(report.currencies[quote].policy?.display), diff: `${signedFixed(d.policyRate.now)} pts`, note: d.policyRate.change !== null ? `${signedFixed(d.policyRate.change)} pts vs 6 months ago` : null },
    d.realRate && { label: 'Real policy rate', b: `${signedFixed(d.realRate.base)} pts`, q: `${signedFixed(d.realRate.quote)} pts`, diff: `${signedFixed(d.realRate.diff)} pts` },
    d.inflationGap && { label: 'Inflation vs target', b: `${signedFixed(d.inflationGap.base)} pp`, q: `${signedFixed(d.inflationGap.quote)} pp`, diff: `${signedFixed(d.inflationGap.diff)} pp` },
    d.growth && { label: `IMF growth projection ${d.growth.year}`, b: `${d.growth.base.toFixed(2)}%`, q: `${d.growth.quote.toFixed(2)}%`, diff: `${signedFixed(d.growth.diff)} pp` },
    d.fiscalBalance && { label: 'Fiscal balance (% GDP)', b: `${d.fiscalBalance.base.toFixed(1)}%`, q: `${d.fiscalBalance.quote.toFixed(1)}%`, diff: `${signedFixed(d.fiscalBalance.diff, 1)} pp` },
    d.currentAccount && { label: 'Current account (% GDP)', b: `${d.currentAccount.base.toFixed(1)}%`, q: `${d.currentAccount.quote.toFixed(1)}%`, diff: `${signedFixed(d.currentAccount.diff, 1)} pp` },
  ].filter(Boolean);
  return (
    <Section title={`${base}${quote} relative analysis`} subtitle={`Which macroeconomic forces favour ${base} relative to ${quote}, and which favour ${quote}.`}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-ink-500 dark:text-ink-400">Favouring {base}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(rv.favorsBase)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink-500 dark:text-ink-400">Favouring {quote}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(rv.favorsQuote)}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="-mx-5 mt-5 overflow-x-auto border-t border-ink-100 dark:border-ink-800">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-[11px] text-ink-400">
                <th className="px-5 py-2 font-medium">Differential</th>
                <th className="px-2 py-2 font-medium">{base}</th>
                <th className="px-2 py-2 font-medium">{quote}</th>
                <th className="px-5 py-2 text-right font-medium">{base} minus {quote}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-ink-50 dark:border-ink-800/60">
                  <td className="px-5 py-2 font-sans text-sm text-ink-700 dark:text-ink-200">{r.label}</td>
                  <td className="px-2 py-2 text-ink-800 dark:text-ink-100">{r.b ?? 'n/a'}</td>
                  <td className="px-2 py-2 text-ink-800 dark:text-ink-100">{r.q ?? 'n/a'}</td>
                  <td className="px-5 py-2 text-right text-ink-900 dark:text-ink-50">
                    {r.diff}
                    {r.note ? <span className="block font-sans text-[11px] text-ink-400">{r.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <div key={code} className="space-y-3">
              {codes.length > 1 ? <p className="text-xs font-semibold text-ink-500 dark:text-ink-400">{code}</p> : null}
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-xs text-ink-400">What the data says</p>
                  <KindTag kind="FACT" />
                </div>
                <p className="text-sm text-ink-700 dark:text-ink-200">
                  {c.centralBank.name}: {txt(c.policy?.display ?? 'n/a')}, actual stance {c.policy?.stance?.toLowerCase() ?? 'n/a'}
                  {c.policy?.cum6m !== null && c.policy?.cum6m !== undefined ? ` (${signed(c.policy.cum6m)}bp over 6 months)` : ''}. Fundamental score {c.score}/100.
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <p className="text-xs text-ink-400">What markets appear to expect</p>
                  <KindTag kind="MARKET EXPECTATION" />
                </div>
                {me?.available ? (
                  <>
                    <p className="text-sm text-ink-700 dark:text-ink-200">{txt(me.summary)}</p>
                    {me.divergent ? <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Market pricing currently contradicts the actual policy direction.</p> : null}
                    <div className="mt-1.5">
                      <EvidenceList ids={me.evidence?.slice(0, 1)} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-ink-400">{txt(me.caveat)}</p>
                  </>
                ) : (
                  <NotAvailable reason={reasonAfterPrefix(me?.summary)}>MARKET EXPECTATION DATA NOT AVAILABLE</NotAvailable>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isPair ? (
        <div className="mt-5 grid grid-cols-1 gap-5 border-t border-ink-100 pt-4 dark:border-ink-800 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="text-xs text-ink-400">Relative rate expectations</p>
              <KindTag kind="MARKET EXPECTATION" />
            </div>
            {report.pair.market?.available ? <p className="text-sm text-ink-700 dark:text-ink-200">{txt(report.pair.market.summary)}</p> : <NotAvailable reason={reasonAfterPrefix(report.pair.market?.summary)}>MARKET EXPECTATION DATA NOT AVAILABLE</NotAvailable>}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="text-xs text-ink-400">What price has done</p>
              <KindTag kind="MARKET PRICE" />
            </div>
            {mp?.available ? (
              <p className="text-sm text-ink-700 dark:text-ink-200">
                {report.subject} <span className="font-mono tabular-nums">{signedFixed(mp.change1m)}%</span> over 1 month and <span className="font-mono tabular-nums">{signedFixed(mp.change3m)}%</span> over 3 months, to {mp.last} ({mp.lastDate}, {mp.source?.name}).
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
            {codes.length > 1 ? <p className="mb-2 text-xs font-semibold text-ink-500 dark:text-ink-400">{code}</p> : null}
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
        <div className="mb-4 rounded-xl bg-ink-50 p-3.5 dark:bg-ink-800/60">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-xs font-semibold text-ink-700 dark:text-ink-200">Biggest risk</p>
            <KindTag kind="KOTKA INTERPRETATION" />
          </div>
          <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(risk)}</p>
        </div>
      ) : null}
      <ol className="space-y-3">
        {report.invalidation.map((item, i) => (
          <li key={`${item.currency}-${item.factor}`} className="flex gap-3">
            <span className="mt-0.5 font-mono text-xs text-ink-400">{i + 1}</span>
            <div>
              <p className="text-xs text-ink-400">
                {item.currency} {item.label}
              </p>
              <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{txt(item.text)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
