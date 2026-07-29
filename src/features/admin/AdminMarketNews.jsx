import { Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';

const news = [
  { id: 'n1', headline: 'Fed signals slower pace of cuts into Q4', market: 'USD', impact: 'high', published: '2026-07-29' },
  { id: 'n2', headline: 'Gold consolidates near record highs ahead of NFP', market: 'XAU', impact: 'medium', published: '2026-07-28' },
  { id: 'n3', headline: 'Tech earnings lift Nasdaq futures overnight', market: 'Indices', impact: 'medium', published: '2026-07-27' },
  { id: 'n4', headline: 'BTC volatility spikes on ETF flow data', market: 'Crypto', impact: 'high', published: '2026-07-26' },
];

const impactTone = { high: 'loss', medium: 'warning', low: 'neutral' };

const columns = [
  { key: 'headline', label: 'Headline' },
  { key: 'market', label: 'Market', render: (r) => <Badge tone="accent">{r.market}</Badge> },
  { key: 'impact', label: 'Impact', render: (r) => <Badge tone={impactTone[r.impact]}>{r.impact}</Badge> },
  { key: 'published', label: 'Published' },
];

export default function AdminMarketNews() {
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Market News"
        description="Curate the institutional commentary and news feed shown across the platform."
        actions={<Button icon={Plus}>New item</Button>}
      />
      <AdminTable columns={columns} rows={news} searchKeys={['headline', 'market']} exportable={false} />
    </div>
  );
}
