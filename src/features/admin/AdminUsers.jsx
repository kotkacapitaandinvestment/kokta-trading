import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';
import { usePersistedState } from '../../lib/usePersistedState';
import { adminUsers } from '../../lib/mockData';

const statusTone = { active: 'profit', suspended: 'warning', banned: 'loss' };

export default function AdminUsers() {
  const [users, setUsers] = usePersistedState('admin.users', adminUsers);
  const [busyId, setBusyId] = useState(null);

  const updateUser = (id, patch) => {
    setBusyId(id);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    setTimeout(() => setBusyId(null), 300);
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
    { key: 'lastActive', label: 'Last Active' },
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
      <AdminTable columns={columns} rows={users} searchKeys={['name', 'email', 'plan', 'status']} />
    </div>
  );
}
