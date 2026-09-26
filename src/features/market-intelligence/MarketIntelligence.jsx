import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import MarketOverview from './MarketOverview';
import FundamentalResearch from './research/FundamentalResearch';

const VIEWS = [
  { value: 'overview', label: 'Market overview' },
  { value: 'research', label: 'Fundamental research' },
];

export default function MarketIntelligence() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'research' ? 'research' : 'overview';
  const instrument = (params.get('instrument') ?? '').toUpperCase().replace(/[^A-Z]/g, '');

  const setView = (v) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (v === 'overview') next.delete('view');
    else next.set('view', v);
    return next;
  });
  const setInstrument = (subject) => setParams((p) => {
    const next = new URLSearchParams(p);
    next.set('view', 'research');
    next.set('instrument', subject);
    return next;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Market Intelligence"
        description={
          view === 'research'
            ? 'Evidence-backed macroeconomic research from the IMF, central banks and official statistics. Context for decisions, never a trade signal.'
            : 'Structure, sentiment, and institutional context across every market you trade.'
        }
        actions={<Tabs tabs={VIEWS} active={view} onChange={setView} />}
      />
      {view === 'research' ? <FundamentalResearch instrument={instrument} onInstrumentChange={setInstrument} /> : <MarketOverview />}
    </div>
  );
}
