import PageHeader from '../../components/ui/PageHeader';
import AdminTable from './components/AdminTable';
import { auditLogs } from '../../lib/mockData';

const columns = [
  { key: 'time', label: 'Timestamp' },
  { key: 'actor', label: 'Actor' },
  { key: 'action', label: 'Action' },
];

export default function AdminAuditLogs() {
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Audit Logs" description="Immutable record of every administrative and system action taken on the platform." />
      <AdminTable columns={columns} rows={auditLogs} searchKeys={['actor', 'action']} />
    </div>
  );
}
