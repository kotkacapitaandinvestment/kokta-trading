import { useState } from 'react';
import { Plus, Trash2, Send, Undo2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Select } from '../../components/ui/Input';
import AdminTable from './components/AdminTable';
import { useAdminCrud } from '../../lib/useAdminCrud';
import { confirmDialog, promptDialog, toast } from '../../lib/dialogs';

const statusTone = { published: 'profit', draft: 'neutral' };
const AUDIENCES = ['All users', 'Traders', 'Premium'];
const EMPTY = { title: '', body: '', audience: 'All users' };

export default function AdminAnnouncements() {
  const { items, loading, create, update, remove } = useAdminCrud('/admin/announcements');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const guard = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    await guard(async () => {
      await create({ ...form, status: 'draft' });
      setForm(EMPTY);
      setShowForm(false);
    });
    setSaving(false);
  };

  const columns = [
    {
      key: 'title',
      label: 'Announcement',
      render: (r) => (
        <div className="max-w-md">
          <p className="font-medium text-ink-800 dark:text-ink-100">{r.title}</p>
          {r.body ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{r.body}</p> : null}
        </div>
      ),
    },
    { key: 'audience', label: 'Audience' },
    { key: 'publishedAt', label: 'Published', render: (r) => (r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : 'Not yet') },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{{ draft: 'Draft', published: 'Published' }[r.status] ?? r.status}</Badge> },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.status === 'published' ? (
            <Button size="sm" variant="ghost" icon={Undo2} onClick={() => guard(() => update(r.id, { status: 'draft' }))}>Unpublish</Button>
          ) : (
            <Button size="sm" variant="secondary" icon={Send} onClick={() => guard(() => update(r.id, { status: 'published' }))}>Publish</Button>
          )}
          <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => (await confirmDialog({ title: `Delete “${r.title}”?`, message: 'Traders will no longer see it. This can’t be undone.', confirmLabel: 'Delete', danger: true })) && guard(() => remove(r.id))}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Announcements"
        description="Published announcements appear in traders' notifications and at the top of their dashboard for 14 days."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            New announcement
          </Button>
        }
      />
      {error ? <p role="alert" className="mb-4 text-sm text-loss-500">{error}</p> : null}
      <AdminTable columns={columns} rows={items} searchKeys={['title', 'body', 'audience']} exportable={false} emptyLabel={loading ? 'Loading…' : 'No announcements yet'} />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New announcement">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input name="title" label="Title" maxLength={140} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">Message</span>
            <textarea
              value={form.body}
              maxLength={1000}
              rows={4}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
            />
            <span className="mt-1 block text-xs text-ink-400">Optional. Plain text, up to 1000 characters.</span>
          </label>
          <Select name="audience" label="Audience" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
            {AUDIENCES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <p className="text-xs text-ink-400">Saved as a draft. Publish it from the list when it is ready.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
