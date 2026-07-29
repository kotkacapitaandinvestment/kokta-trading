import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Select } from '../../components/ui/Input';
import AdminTable from './components/AdminTable';
import { useAdminCrud } from '../../lib/useAdminCrud';

const impactTone = { high: 'loss', medium: 'warning', low: 'neutral' };
const markets = ['USD', 'EUR', 'GBP', 'XAU', 'Indices', 'Crypto'];
const impacts = ['low', 'medium', 'high'];

export default function AdminMarketNews() {
  const { items, loading, create, remove } = useAdminCrud('/admin/market-news');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ headline: '', market: 'USD', impact: 'medium' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create(form);
      setForm({ headline: '', market: 'USD', impact: 'medium' });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'headline', label: 'Headline' },
    { key: 'market', label: 'Market', render: (r) => <Badge tone="accent">{r.market}</Badge> },
    { key: 'impact', label: 'Impact', render: (r) => <Badge tone={impactTone[r.impact]}>{r.impact}</Badge> },
    { key: 'publishedAt', label: 'Published', render: (r) => new Date(r.publishedAt).toLocaleDateString() },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(r.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Market News"
        description="Curate the institutional commentary and news feed shown across the platform."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            New item
          </Button>
        }
      />
      <AdminTable
        columns={columns}
        rows={items}
        searchKeys={['headline', 'market']}
        exportable={false}
        emptyLabel={loading ? 'Loading…' : 'No market news yet'}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New market news item">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            name="headline"
            label="Headline"
            value={form.headline}
            onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select name="market" label="Market" value={form.market} onChange={(e) => setForm((f) => ({ ...f, market: e.target.value }))}>
              {markets.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
            <Select name="impact" label="Impact" value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value }))}>
              {impacts.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
