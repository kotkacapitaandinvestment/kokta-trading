import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { confirmDialog, promptDialog, toast } from '../../lib/dialogs';

const statusTone = { active: 'profit', suspended: 'warning', banned: 'loss' };
const kycTone = { approved: 'profit', pending: 'warning', rejected: 'loss', none: 'neutral' };
const kycLabel = { approved: 'Verified', pending: 'In review', rejected: 'Needs changes', none: 'Not submitted' };
const ROLE_LABEL = { trader: 'Trader', premium: 'Premium', admin: 'Admin', super_admin: 'Super Admin' };
const RANK = { trader: 0, premium: 0, admin: 1, super_admin: 2 };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { paidPlansEnabled } = useAppConfig();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const isSuper = me?.role === 'super_admin';

  useEffect(() => {
    api
      .get('/admin/users')
      .then(({ users }) => setUsers(users))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updateUser = async (u, patch, confirmText) => {
    if (confirmText && !(await confirmDialog({ title: confirmText.split('?')[0] + '?', message: confirmText.split('?').slice(1).join('?').trim() || undefined, confirmLabel: patch.status === 'banned' ? 'Ban' : patch.status === 'suspended' ? 'Suspend' : 'Confirm', danger: ['banned', 'suspended'].includes(patch.status) }))) return;
    setBusyId(u.id);
    setError(null);
    try {
      const { user } = await api.patch(`/admin/users/${u.id}`, patch);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? user : x)));
    } catch (err) {
      setError(`${u.email}: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  // Mirrors the server's rules so buttons that would be refused aren't shown.
  const canManage = (u) => u.id !== me?.id && (isSuper || RANK[u.role] < RANK[me?.role]);

  const columns = [
    {
      key: 'name',
      label: 'User',
      csv: (u) => `${u.name} <${u.email}>`,
      render: (u) => (
        <div>
          <p className="font-medium text-ink-800 dark:text-ink-100">
            {u.name}
            {u.id === me?.id ? <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span> : null}
          </p>
          <p className="text-xs text-ink-400">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      render: (u) =>
        isSuper && u.id !== me?.id ? (
          <select
            aria-label={`Role for ${u.email}`}
            value={u.role}
            disabled={busyId === u.id}
            onChange={(e) => updateUser(u, { role: e.target.value }, `Change ${u.email} to ${ROLE_LABEL[e.target.value]}?`)}
            className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          >
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        ) : (
          <Badge tone={RANK[u.role] > 0 ? 'accent' : 'neutral'}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
        ),
    },
    ...(paidPlansEnabled ? [{ key: 'plan', label: 'Plan' }] : []),
    {
      key: 'kycStatus',
      label: 'Verification',
      csv: (u) => kycLabel[u.kycStatus],
      render: (u) => (RANK[u.role] > 0 ? <span className="text-xs text-ink-400">Exempt</span> : <Badge tone={kycTone[u.kycStatus]}>{kycLabel[u.kycStatus]}</Badge>),
    },
    { key: 'status', label: 'Status', render: (u) => <Badge tone={statusTone[u.status]}>{{ active: 'Active', suspended: 'Suspended', banned: 'Banned' }[u.status] ?? u.status}</Badge> },
    { key: 'joined', label: 'Joined' },
    { key: 'lastActive', label: 'Last sign-in', render: (u) => u.lastActive ?? 'Never' },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) => (
          <div className="flex flex-wrap gap-1.5">
            <Button as={Link} to={`/admin/audit-logs?user=${u.id}`} size="sm" variant="ghost">Activity</Button>
            {canManage(u) ? (
            <>
            {u.status !== 'active' ? (
              <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => updateUser(u, { status: 'active' })}>
                Reinstate
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => updateUser(u, { status: 'suspended' }, `Suspend ${u.email}? They are signed out immediately.`)}>
                Suspend
              </Button>
            )}
            {u.status !== 'banned' ? (
              <Button size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => updateUser(u, { status: 'banned' }, `Ban ${u.email}? They are signed out and cannot sign back in.`)}>
                Ban
              </Button>
            ) : null}
            </>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Every account on the platform. Suspending or banning signs the person out within a minute."
        actions={
          <Button as={Link} to="/admin/verifications" variant="secondary" size="sm">
            Review verifications
          </Button>
        }
      />
      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      <AdminTable
        columns={columns}
        rows={users}
        searchKeys={['name', 'email', 'role', 'status', 'kycStatus']}
        exportName="kotka-users"
        emptyLabel={loading ? 'Loading users…' : 'No users found'}
      />
    </div>
  );
}
