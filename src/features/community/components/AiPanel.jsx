import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, CircleHelp, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import { api } from '../../../lib/api';
import BrandMark from '../../../components/ui/BrandMark';

// Runs a Community AI action and tracks its state.
export function useAiAction() {
  const [state, setState] = useState(null); // { kind, loading, result, error }
  const run = async (kind, path, body) => {
    setState({ kind, loading: true });
    try {
      const { result, cached } = await api.post(path, body);
      setState({ kind, result, cached });
    } catch (err) {
      setState({ kind, error: err.message });
    }
  };
  return { state, run, clear: () => setState(null) };
}

const TITLES = { summary: 'Community summary', challenge: 'Thesis stress test', explain: 'Why it matters', chart: 'Chart read', factcheck: 'Fact check' };

function List({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={clsx('text-[11px] font-semibold uppercase tracking-wide', tone ?? 'text-ink-400')}>{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-300 dark:bg-ink-600" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Facts({ items, title = 'Verified facts' }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-lg bg-profit-50/60 p-3 dark:bg-profit-500/5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-profit-700 dark:text-profit-400">{title}</p>
      <ul className="mt-1 space-y-1.5">
        {items.map((f, i) => (
          <li key={i} className="text-sm text-ink-700 dark:text-ink-200">
            {f.fact ?? f.point}
            {f.source ? <span className="ml-1.5 rounded bg-white px-1 py-px font-mono text-[10px] text-ink-500 dark:bg-ink-900">{f.source}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ kind, r }) {
  if (kind === 'summary')
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-500 dark:text-ink-400">From {r.messageCount} messages by {r.participants} trader{r.participants === 1 ? '' : 's'}. Everything below is community opinion unless it is listed as a verified fact.</p>
        {r.consensus ? <div><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Main consensus</p><p className="mt-1 text-sm text-ink-800 dark:text-ink-100">{r.consensus}</p></div> : null}
        {r.disagreement ? <div><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Main disagreement</p><p className="mt-1 text-sm text-ink-800 dark:text-ink-100">{r.disagreement}</p></div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <List title="Arguments for a higher price" items={r.bullishArguments} tone="text-profit-700 dark:text-profit-400" />
          <List title="Arguments for a lower price" items={r.bearishArguments} tone="text-loss-600 dark:text-loss-400" />
        </div>
        <List title="Unresolved questions" items={r.unresolved} />
        <Facts items={r.verifiedFacts} />
        <List title="Claims made that Kotka could not verify" items={r.claimsNotVerified} tone="text-amber-700 dark:text-amber-400" />
      </div>
    );
  if (kind === 'challenge')
    return (
      <div className="space-y-3">
        <List title="Assumptions the thesis depends on" items={r.assumptions} />
        <Facts items={r.counterEvidence} title="Data that cuts against it" />
        <List title="Risks it doesn't address" items={r.risks} tone="text-loss-600 dark:text-loss-400" />
        {r.invalidation ? <div><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">What would prove it wrong</p><p className="mt-1 text-sm text-ink-800 dark:text-ink-100">{r.invalidation}</p></div> : null}
        <List title="Questions for the author" items={r.questions} />
      </div>
    );
  if (kind === 'explain')
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-100">{r.whyItMatters}</p>
        {r.markets?.length ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">How it can feed through</p>
            {r.markets.map((m) => <p key={m.symbol} className="text-sm text-ink-700 dark:text-ink-200"><span className="font-mono font-semibold">{m.display}</span>: {m.channel}</p>)}
          </div>
        ) : null}
        <List title="What to watch next" items={r.watch} />
        {r.caveats ? <p className="text-xs text-ink-500 dark:text-ink-400">Caveat: {r.caveats}</p> : null}
      </div>
    );
  if (kind === 'chart')
    return (
      <div className="space-y-3">
        {r.instrument ? <p className="text-xs text-ink-500">Chart: {r.instrument}</p> : null}
        <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-100">{r.structure}</p>
        <List title="Visible levels" items={r.levels} />
        <List title="Observations" items={r.observations} />
        {r.limits ? <p className="text-xs text-ink-500 dark:text-ink-400">What the image can't show: {r.limits}</p> : null}
      </div>
    );
  if (kind === 'factcheck') {
    const V = { supported: [CheckCircle2, 'text-profit-600 dark:text-profit-400', 'Supported by data'], contradicted: [XCircle, 'text-loss-500', 'Contradicted by data'], cannot_verify: [CircleHelp, 'text-ink-400', 'Cannot verify'] };
    return (
      <div className="space-y-3">
        {!r.claims?.length ? <p className="text-sm text-ink-500">No checkable factual claims found.</p> : null}
        {r.claims?.map((c, i) => {
          const [Icon, tone, label] = V[c.verdict];
          return (
            <div key={i} className="flex gap-2.5">
              <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', tone)} aria-label={label} />
              <div>
                <p className="text-sm text-ink-800 dark:text-ink-100">"{c.claim}"</p>
                <p className="text-xs text-ink-500 dark:text-ink-400"><span className={clsx('font-medium', tone)}>{label}.</span> {c.explanation} {c.source ? <span className="font-mono text-[10px]">[{c.source}]</span> : null}</p>
              </div>
            </div>
          );
        })}
        <List title="Opinions (not checkable)" items={r.opinions} />
      </div>
    );
  }
  return null;
}

export default function AiPanel({ state, onClose, className }) {
  if (!state) return null;
  return (
    <section className={clsx('rounded-2xl border border-accent-500/25 bg-gradient-to-b from-accent-50/60 to-white p-4 dark:from-accent-900/10 dark:to-ink-900', className)} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-50">
          <BrandMark size={18} /> {TITLES[state.kind] ?? 'Kotka AI'}
        </p>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        {state.loading ? (
          <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Kotka is reading the evidence…</p>
        ) : state.error ? (
          <p role="alert" className="text-sm text-loss-500">{state.error}</p>
        ) : (
          <Body kind={state.kind} r={state.result} />
        )}
      </div>
      {state.result ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-ink-100 pt-2 text-[11px] text-ink-400 dark:border-ink-800">
          <Sparkles className="h-3 w-3" /> Generated by Kotka AI{state.result.model ? ` (${state.result.model.split('/').pop()})` : ''}{state.cached ? ', from a recent run' : ''}. Not investment advice.
        </p>
      ) : null}
    </section>
  );
}
