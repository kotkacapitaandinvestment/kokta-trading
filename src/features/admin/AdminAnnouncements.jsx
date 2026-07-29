import { Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';
import { announcements } from '../../lib/mockData';

const statusTone = { published: 'profit', scheduled: 'accent', draft: 'neutral' };

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'audience', label: 'Audience' },
  { key: 'published', label: 'Date' },
  { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
];

export default function AdminAnnouncements() {
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Announcements"
        description="Publish platform-wide announcements and push notifications."
        actions={<Button icon={Plus}>New announcement</Button>}
      />
      <AdminTable columns={columns} rows={announcements} searchKeys={['title', 'audience']} exportable={false} />
    </div>
  );
}
