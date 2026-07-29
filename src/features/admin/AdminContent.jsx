import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Select } from '../../components/ui/Input';
import AdminTable from './components/AdminTable';
import { useAdminCrud } from '../../lib/useAdminCrud';

const statusTone = { published: 'profit', draft: 'neutral' };
const types = ['Article', 'Lesson', 'Market Update', 'Video', 'FAQ'];

export default function AdminContent() {
  const { items, loading, create, update, remove } = useAdminCrud('/admin/content');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'Article' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ title: form.title, type: form.type, status: 'draft' });
      setForm({ title: '', type: 'Article' });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'type', label: 'Type', render: (r) => <Badge tone="accent">{r.type}</Badge> },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <button onClick={() => update(r.id, { status: r.status === 'published' ? 'draft' : 'published' })}>
          <Badge tone={statusTone[r.status]}>{r.status}</Badge>
        </button>
      ),
    },
    { key: 'updatedAt', label: 'Last updated', render: (r) => new Date(r.updatedAt).toLocaleDateString() },
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
        title="Content"
        description="Publish articles, trading lessons, market updates, videos, and FAQs."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            New content
          </Button>
        }
      />
      <AdminTable
        columns={columns}
        rows={items}
        searchKeys={['title', 'type']}
        exportable={false}
        emptyLabel={loading ? 'Loading…' : 'No content yet'}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New content">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            name="title"
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Select name="type" label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
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
