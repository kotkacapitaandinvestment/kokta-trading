import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import AdminTable from './components/AdminTable';
import { supportTickets } from '../../lib/mockData';

const statusTone = { open: 'loss', pending: 'warning', closed: 'neutral' };
const priorityTone = { high: 'loss', medium: 'warning', low: 'neutral' };

const columns = [
  { key: 'subject', label: 'Subject' },
  { key: 'user', label: 'User' },
  { key: 'priority', label: 'Priority', render: (r) => <Badge tone={priorityTone[r.priority]}>{r.priority}</Badge> },
  { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
  { key: 'updated', label: 'Updated' },
];

export default function AdminSupport() {
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Support Tickets" description="Triage and resolve user-submitted support requests." />
      <AdminTable columns={columns} rows={supportTickets} searchKeys={['subject', 'user']} exportable={false} />
    </div>
  );
}
