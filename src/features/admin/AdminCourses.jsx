import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import AdminTable from './components/AdminTable';
import { useAdminCrud } from '../../lib/useAdminCrud';

const statusTone = { published: 'profit', draft: 'neutral' };

export default function AdminCourses() {
  const { items, loading, create, update, remove } = useAdminCrud('/admin/courses');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', lessons: 1 });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ title: form.title, lessons: Number(form.lessons) || 0, status: 'draft' });
      setForm({ title: '', lessons: 1 });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'title', label: 'Course' },
    { key: 'lessons', label: 'Lessons' },
    { key: 'enrolled', label: 'Enrolled', render: (r) => r.enrolled.toLocaleString() },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <button onClick={() => update(r.id, { status: r.status === 'published' ? 'draft' : 'published' })}>
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
        title="Courses"
        description="Manage structured learning paths for traders working through the platform."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            New course
          </Button>
        }
      />
      <AdminTable
        columns={columns}
        rows={items}
        searchKeys={['title']}
        exportable={false}
        emptyLabel={loading ? 'Loading…' : 'No courses yet'}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New course">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            name="title"
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            name="lessons"
            label="Number of lessons"
            type="number"
            min="0"
            value={form.lessons}
            onChange={(e) => setForm((f) => ({ ...f, lessons: e.target.value }))}
          />
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
