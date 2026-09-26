import clsx from 'clsx';
import { Section, SourceLink, formatDate, txt } from './primitives';

const TIER_GROUPS = [
  { tiers: ['1'], title: 'International Monetary Fund' },
  { tiers: ['2'], title: 'Central banks' },
  { tiers: ['3'], title: 'National statistics offices' },
  { tiers: ['4'], title: 'International organisations (BIS)' },
  { tiers: ['curated'], title: 'Curated institutional assessments' },
  { tiers: ['market'], title: 'Market data' },
];

export function FreshnessStrip({ freshness, report }) {
  if (!freshness) return null;
  const df = report?.dataFreshness;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
      <div>
        <p className="text-ink-400">Last researched</p>
        <p className="text-ink-800 dark:text-ink-100">{formatDate(freshness.lastUpdated, { time: true })}</p>
      </div>
      <div>
        <p className="text-ink-400">Next refresh</p>
        <p className="text-ink-800 dark:text-ink-100">{freshness.stale ? 'Due now' : formatDate(freshness.nextRefresh, { time: true })}</p>
      </div>
      <div>
        <p className="text-ink-400">Latest official data</p>
        <p className="text-ink-800 dark:text-ink-100">{df?.latestData ? `${df.latestData.period} (${txt(df.latestData.label)})` : 'n/a'}</p>
      </div>
      <div>
        <p className="text-ink-400">IMF forecast vintage</p>
        <p className="text-ink-800 dark:text-ink-100">{df?.imf ? `${df.imf.vintage} (published ${formatDate(df.imf.published)})` : 'DATA NOT AVAILABLE'}</p>
      </div>
    </div>
  );
}

export default function SourcesSection({ report }) {
  const groups = TIER_GROUPS.map((g) => ({ ...g, sources: report.sources.filter((s) => g.tiers.includes(String(s.tier))) })).filter((g) => g.sources.length);
  const status = report.sourceStatus ?? [];
  const failed = status.filter((s) => s.status === 'failed');
  const disabled = status.filter((s) => s.status === 'disabled');
  return (
    <Section title="Sources" subtitle="Every figure in this report traces to one of these publications. Select a source to open the original.">
      {report.dataFreshness?.notes?.length ? (
        <div className="mb-4 space-y-1.5">
          {report.dataFreshness.notes.map((n) => (
            <p key={n.text} className="text-xs text-ink-500 dark:text-ink-400">{txt(n.text)}</p>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-xs font-semibold text-ink-500 dark:text-ink-400">{g.title}</p>
            <div className="space-y-3">
              {g.sources.map((src) => (
                <div key={src.name}>
                  <p className="text-xs font-medium text-ink-800 dark:text-ink-100">{txt(src.name)}</p>
                  <ul className="mt-1 space-y-0.5">
                    {/* Reports saved before v2 stored one URL per source instead of a list. */}
                    {(Array.isArray(src.items) ? src.items : [{ label: src.name, url: src.url, via: src.via }]).map((it) => (
                      <li key={it.url} className="text-[11px] leading-snug">
                        <SourceLink href={it.url}>{txt(it.label)}</SourceLink>
                        {it.via ? <span className="text-ink-400"> via {txt(it.via)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <details className="mt-5 border-t border-ink-100 pt-3 dark:border-ink-800">
        <summary className="cursor-pointer select-none text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300">
          Retrieval log for this run: {status.filter((s) => s.status === 'ok' || s.status === 'cached').length} retrieved
          {failed.length ? `, ${failed.length} unavailable` : ''}
          {disabled.length ? `, ${disabled.length} disabled by an administrator` : ''}
          {report.fredMode === 'public-csv' ? '. FRED series read from the public CSV endpoint.' : ''}
        </summary>
        <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] md:grid-cols-2">
          {status.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3">
              <span className="text-ink-500 dark:text-ink-400">{txt(s.name)}</span>
              <span className={clsx('shrink-0 font-mono', s.status === 'failed' ? 'text-loss-500' : s.status === 'disabled' ? 'text-ink-400' : 'text-ink-600 dark:text-ink-300')}>
                {s.status === 'cached' ? 'ok (cached)' : s.status}
              </span>
            </li>
          ))}
        </ul>
        {failed.length ? (
          <ul className="mt-2 space-y-0.5 text-[11px] text-loss-500">
            {failed.map((s) => (
              <li key={s.id}>
                {txt(s.name)}: {s.error}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
        Kotka Fundamental Research provides macroeconomic context. It is not a trade signal and does not recommend any position. A trade decision also needs technical structure, liquidity, risk and a trade plan.
      </p>
    </Section>
  );
}
