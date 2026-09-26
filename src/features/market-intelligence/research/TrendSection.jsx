import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Tabs from '../../../components/ui/Tabs';
import { useTheme } from '../../../context/ThemeContext';
import { CHART_COLORS, RESEARCH_SERIES } from '../../../lib/chartColors';
import { directionWord, formatDate, reportCodes, Section, txt } from './primitives';

const FACTOR_LABELS = {
  monetary_policy: 'monetary policy',
  policy_differential: 'policy differential',
  growth: 'growth',
  inflation: 'inflation',
  imf_revisions: 'IMF revisions',
  fiscal: 'fiscal',
  external: 'external',
  financial_stability: 'financial stability',
  valuation: 'valuation',
  reserves: 'reserves',
};

function ChartTooltip({ active, payload, label, series }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs shadow-pop dark:border-ink-700 dark:bg-ink-900">
      <p className="mb-1 text-ink-400">{label}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded" style={{ backgroundColor: p.color }} />
            <span className="font-semibold text-ink-900 dark:text-ink-50">{p.value}</span>
            <span className="text-ink-400">{s?.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function endDot(color, surface, lastIndex, label) {
  return function Dot({ cx, cy, index }) {
    if (index !== lastIndex || cx === undefined) return <g key={`dot-${index}`} />;
    return (
      <g key={`end-${index}`}>
        <circle cx={cx} cy={cy} r={4} fill={color} stroke={surface} strokeWidth={2} />
        {label ? (
          <text x={cx + 8} y={cy + 4} fontSize={11} className="fill-ink-600 dark:fill-ink-300">
            {label}
          </text>
        ) : null}
      </g>
    );
  };
}

function TrendChart({ data, series, reference }) {
  // Direct end labels only when the series end far enough apart; otherwise
  // the legend and tooltip carry identity (stacked labels detach from lines).
  const ends = series.map((s) => data[data.length - 1]?.[s.key]).filter((v) => v !== null && v !== undefined);
  const labelEnds = series.length > 1 && ends.length === series.length && Math.max(...ends) - Math.min(...ends) >= 8;
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const grid = dark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light;
  const tick = dark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light;
  const surface = dark ? '#0C0C0E' : '#FFFFFF';
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 44, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: tick }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: tick }} width={44} />
          {reference ? <ReferenceLine y={reference.y} stroke={tick} strokeOpacity={0.6} label={{ value: reference.label, position: 'insideTopLeft', fontSize: 10, fill: tick }} /> : null}
          <Tooltip cursor={{ stroke: tick, strokeWidth: 1 }} content={<ChartTooltip series={series} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="linear"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={endDot(s.color, surface, data.length - 1, labelEnds ? s.key : null)}
              activeDot={{ r: 5, stroke: surface, strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-500 dark:text-ink-400">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function TrendTable({ rows, series }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead>
          <tr className="border-b border-ink-100 text-ink-400 dark:border-ink-800">
            <th className="px-5 py-2 font-medium">As of</th>
            {series.map((s) => (
              <th key={s.key} className="px-2 py-2 text-right font-medium">{s.label}</th>
            ))}
            <th className="px-5 py-2 font-medium">Basis</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-ink-50 dark:border-ink-800/60">
              <td className="px-5 py-1.5 font-sans text-ink-700 dark:text-ink-200">{r.label}</td>
              {series.map((s) => (
                <td key={s.key} className="px-2 py-1.5 text-right text-ink-900 dark:text-ink-50">{r[s.key] ?? 'n/a'}</td>
              ))}
              <td className="px-5 py-1.5 font-sans text-ink-400">{r.reconstructed ? 'Reconstructed' : 'Current research'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TrendSection({ report, history }) {
  const [view, setView] = useState('chart');
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const isPair = report.kind === 'pair';
  const codes = reportCodes(report);
  const subjectTrend = report.trends?.[report.subject];
  const colorFor = (i) => (i === 0 ? RESEARCH_SERIES.base : RESEARCH_SERIES.quote)[dark ? 'dark' : 'light'];

  const toRows = (keys) => {
    const base = report.trends[keys[0]]?.points ?? [];
    return base.map((p, i) => ({ label: p.label, reconstructed: p.reconstructed, ...Object.fromEntries(keys.map((k) => [k, report.trends[k]?.points?.[i]?.score ?? null])) }));
  };

  const pairSeries = [{ key: report.subject, label: `${report.subject} relative score`, color: RESEARCH_SERIES.base[dark ? 'dark' : 'light'] }];
  const ccySeries = codes.map((code, i) => ({ key: code, label: `${code} fundamental score`, color: colorFor(i) }));
  const pairRows = isPair ? toRows([report.subject]) : [];
  const ccyRows = toRows(codes);
  const basis = (subjectTrend?.basis ?? []).map((k) => FACTOR_LABELS[k] ?? k);

  return (
    <Section
      title="Fundamental trend"
      subtitle={`${isPair && subjectTrend?.direction?.label === 'STRENGTHENING' ? `Shifting toward ${report.base}` : isPair && subjectTrend?.direction?.label === 'WEAKENING' ? `Shifting toward ${report.quote}` : directionWord(subjectTrend?.direction?.label)} over the last six month-ends.`}
      action={<Tabs tabs={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} active={view} onChange={setView} />}
    >
      {view === 'chart' ? (
        <div className={isPair ? 'grid grid-cols-1 gap-6 xl:grid-cols-2' : ''}>
          {isPair ? (
            <div>
              <p className="mb-2 text-xs text-ink-500 dark:text-ink-400">{report.subject} relative score (above 50 favours {report.pair.base})</p>
              <TrendChart data={pairRows} series={pairSeries} reference={{ y: 50, label: 'Balanced' }} />
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs text-ink-500 dark:text-ink-400">{isPair ? 'Each currency on its own evidence' : `${report.subject} fundamental score`}</p>
            <Legend series={ccySeries} />
            <TrendChart data={ccyRows} series={ccySeries} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {isPair ? <TrendTable rows={pairRows} series={pairSeries} /> : null}
          <TrendTable rows={ccyRows} series={ccySeries} />
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
        {txt(
          `Month-end points are reconstructed by re-running the same scoring rules on the data as it would have been published at each date; later data revisions mean they can differ from a real-time reading. For comparability the trend uses only factors available at every point (${basis.join(', ')}), so the latest point can differ slightly from the headline score.`,
        )}
      </p>
      {history?.length ? (
        <p className="mt-2 text-[11px] text-ink-400">
          Kotka has recorded {history.length} research report{history.length === 1 ? '' : 's'} for {report.subject}, the first on {formatDate(history[0].createdAt)}.
        </p>
      ) : null}
    </Section>
  );
}
