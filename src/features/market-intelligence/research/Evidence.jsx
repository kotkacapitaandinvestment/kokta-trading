import { createContext, useContext, useMemo, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import { KindTag, SourceLink, formatValue, formatDate, fmt, txt } from './primitives';

const EvidenceContext = createContext({ open: () => {}, get: () => null });

export function EvidenceProvider({ report, children }) {
  const [activeId, setActiveId] = useState(null);
  const index = useMemo(() => {
    const map = {};
    for (const c of Object.values(report?.currencies ?? {})) Object.assign(map, c.observations);
    return map;
  }, [report]);
  const value = useMemo(() => ({ open: setActiveId, get: (id) => index[id] ?? null }), [index]);
  const obs = activeId ? index[activeId] : null;

  return (
    <EvidenceContext.Provider value={value}>
      {children}
      <Modal open={!!obs} onClose={() => setActiveId(null)} title="Evidence and provenance" width="max-w-xl">
        {obs ? <Provenance obs={obs} /> : null}
      </Modal>
    </EvidenceContext.Provider>
  );
}

export const useEvidence = () => useContext(EvidenceContext);

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-400">{label}</dt>
      <dd className="min-w-0 text-ink-800 dark:text-ink-100">{children}</dd>
    </div>
  );
}

function Provenance({ obs }) {
  const tier = obs.source?.tier;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-900 dark:text-ink-50">{txt(obs.label)}</p>
        <KindTag kind={obs.dataType} />
      </div>
      {obs.value !== null && obs.value !== undefined ? (
        <p className="mt-2 font-mono text-2xl tabular-nums text-ink-900 dark:text-ink-50">{formatValue(obs.value, obs.unit)}</p>
      ) : null}
      {obs.text ? <blockquote className="mt-2 border-l-2 border-accent-500 pl-3 text-sm text-ink-700 dark:text-ink-200">{obs.text}</blockquote> : null}
      <dl className="mt-3 divide-y divide-ink-50 dark:divide-ink-800">
        <Row label="Period">{obs.periodLabel || 'n/a'}</Row>
        {obs.previousValue !== null && obs.previousValue !== undefined ? (
          <Row label="Previous">
            <span className="font-mono tabular-nums">{formatValue(obs.previousValue, obs.unit)}</span> <span className="text-ink-400">({txt(obs.previousPeriodLabel)})</span>
          </Row>
        ) : null}
        {obs.forecastPeriod ? <Row label="Forecast period">{obs.forecastPeriod}</Row> : null}
        <Row label="Publication date">{obs.publicationDate ? formatDate(obs.publicationDate) : <span className="text-ink-400">Not provided by the source API</span>}</Row>
        <Row label="Retrieved">{formatDate(obs.retrievedAt, { time: true })}</Row>
        <Row label="Data type">{obs.dataType === 'ACTUAL' ? 'Actual (official data)' : txt(obs.dataType)}</Row>
        <Row label="Source">
          <div className="space-y-0.5">
            <SourceLink href={obs.source?.url}>{txt(obs.source?.name)}</SourceLink>
            {obs.source?.via ? <p className="text-xs text-ink-400">via {txt(obs.source.via)}</p> : null}
            <p className="text-xs text-ink-400">{tier === 'curated' ? 'Curated from the original publication by a Kotka administrator' : tier ? `Source tier ${tier}` : ''}</p>
          </div>
        </Row>
        {obs.derivedFrom ? <Row label="Derived from">{obs.derivedFrom.join(', ')}</Row> : null}
      </dl>
      {obs.spark?.length > 2 ? <Sparkline values={obs.spark} /> : null}
    </div>
  );
}

function Sparkline({ values }) {
  const w = 480;
  const h = 64;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = values.map((v, i) => [pad + (i / (values.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)]);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs text-ink-400">
        Last {values.length} observations, range {fmt(min)} to {fmt(max)}
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" role="img" aria-label={`Last ${values.length} observations, from ${fmt(values[0])} to ${fmt(values[values.length - 1])}`}>
        <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-ink-400 dark:text-ink-500" />
        <circle cx={lx} cy={ly} r="4" className="fill-accent-600 stroke-white dark:stroke-ink-900" strokeWidth="2" />
      </svg>
    </div>
  );
}

// Compact clickable reference to one piece of evidence.
export function EvidenceChip({ id }) {
  const { open, get } = useEvidence();
  const obs = get(id);
  if (!obs) return null;
  return (
    <button
      type="button"
      onClick={() => open(id)}
      className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-ink-100 bg-ink-50/60 px-2 py-1 text-left text-xs transition-colors hover:border-accent-500/50 hover:bg-accent-50 dark:border-ink-800 dark:bg-ink-800/60 dark:hover:bg-accent-900/20"
      title={txt(obs.label)}
    >
      <span className="line-clamp-2 min-w-0 text-ink-600 dark:text-ink-300">{txt(obs.label)}</span>
      {obs.value !== null && obs.value !== undefined ? <span className="shrink-0 font-mono tabular-nums text-ink-900 dark:text-ink-50">{formatValue(obs.value, obs.unit)}</span> : null}
      <span className="shrink-0 text-ink-400">{obs.periodLabel}</span>
    </button>
  );
}

export function EvidenceList({ ids, limit = 6 }) {
  const { get } = useEvidence();
  const list = [...new Set(ids ?? [])].filter((id) => get(id)).slice(0, limit);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((id) => (
        <EvidenceChip key={id} id={id} />
      ))}
    </div>
  );
}
