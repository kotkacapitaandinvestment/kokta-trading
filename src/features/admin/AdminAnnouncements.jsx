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
const audiences = ['All users', 'Free', 'Premium', 'Institutional'];

export default function AdminAnnouncements() {
  const { items, loading, create, update, remove } = useAdminCrud('/admin/announcements');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', audience: 'All users' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ title: form.title, audience: form.audience, status: 'draft' });
      setForm({ title: '', audience: 'All users' });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = (r) => {
    const publishing = r.status !== 'published';
    update(r.id, { status: publishing ? 'published' : 'draft', publishedAt: publishing ? new Date().toISOString() : null });
  };

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'audience', label: 'Audience' },
    {
      key: 'publishedAt',
      label: 'Date',
      render: (r) => (r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : '—'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <button onClick={() => togglePublish(r)}>
          <Badge tone={statusTone[r.status]}>{r.status}</Badge>
        </button>
      ),
    },
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
        title="Announcements"
        description="Publish platform-wide announcements and push notifications."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            New announcement
          </Button>
        }
      />
      <AdminTable
        columns={columns}
        rows={items}
        searchKeys={['title', 'audience']}
        exportable={false}
        emptyLabel={loading ? 'Loading…' : 'No announcements yet'}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New announcement">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            name="title"
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Select name="audience" label="Audience" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
            {audiences.map((a) => (
              <option key={a}>{a}</option>
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
