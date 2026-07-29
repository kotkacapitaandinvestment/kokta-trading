import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';
import { api } from '../../lib/api';

const statusTone = { active: 'profit', suspended: 'warning', banned: 'loss' };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.get('/admin/users').then(({ users }) => setUsers(users)).finally(() => setLoading(false));
  }, []);

  const updateUser = async (id, patch) => {
    setBusyId(id);
    try {
      const { user } = await api.patch(`/admin/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'User',
      render: (u) => (
        <div>
          <p className="font-medium text-ink-800 dark:text-ink-100">{u.name}</p>
          <p className="text-xs text-ink-400">{u.email}</p>
        </div>
      ),
    },
    { key: 'role', label: 'Role', render: (u) => <Badge tone="accent">{u.role}</Badge> },
    { key: 'plan', label: 'Plan' },
    { key: 'status', label: 'Status', render: (u) => <Badge tone={statusTone[u.status]}>{u.status}</Badge> },
    { key: 'lastActive', label: 'Last Active', render: (u) => u.lastActive ?? '—' },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) => (
        <div className="flex flex-wrap gap-1.5">
          {u.status !== 'active' ? (
            <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => updateUser(u.id, { status: 'active' })}>
              Reinstate
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => updateUser(u.id, { status: 'suspended' })}>
              Suspend
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => updateUser(u.id, { status: 'banned' })}>
            Ban
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === u.id}
            onClick={() => updateUser(u.id, { plan: u.plan === 'Free' ? 'Pro' : 'Free', role: u.plan === 'Free' ? 'premium' : 'trader' })}
          >
            {u.plan === 'Free' ? 'Assign Premium' : 'Remove Premium'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Search, verify, suspend, and manage subscriptions for every trader on the platform."
      />
      <AdminTable columns={columns} rows={users} searchKeys={['name', 'email', 'plan', 'status']} emptyLabel={loading ? 'Loading users…' : 'No users found'} />
    </div>
  );
}
