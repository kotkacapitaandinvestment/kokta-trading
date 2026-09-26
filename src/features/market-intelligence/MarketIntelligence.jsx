import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import FundamentalResearch from './research/FundamentalResearch';
import { MarketPulse, ReleaseCalendar } from './MarketContext';

// One page: end-of-day market context on top, then the fundamental research
// report for the selected pair or currency.
export default function MarketIntelligence() {
  const [params, setParams] = useSearchParams();
  const instrument = (params.get('instrument') ?? '').toUpperCase().replace(/[^A-Z]/g, '');

  const setInstrument = (subject, { scroll = false } = {}) => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('view');
      next.set('instrument', subject);
      return next;
    });
    if (scroll) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('research')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Intelligence"
        title="Market Intelligence"
        description="End-of-day market context and evidence-backed macro research from the IMF, central banks and official statistics. Context for decisions, never a trade signal."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <MarketPulse onSelect={(subject) => setInstrument(subject, { scroll: true })} />
        </div>
        <div className="xl:col-span-5 xl:pt-8">
          <ReleaseCalendar days={14} />
        </div>
      </div>

      <section id="research" aria-labelledby="research-title" className="scroll-mt-4">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-ink-200 pt-6 dark:border-ink-800">
          <h2 id="research-title" className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">Fundamental research</h2>
          <p className="text-xs text-ink-400">Scores are computed from official data; the narrative explains them.</p>
        </div>
        <FundamentalResearch instrument={instrument} onInstrumentChange={(s) => setInstrument(s)} />
      </section>
    </div>
  );
}
