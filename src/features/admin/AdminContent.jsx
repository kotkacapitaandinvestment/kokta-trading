import { Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';

const content = [
  { id: 'ct1', title: 'Understanding Liquidity Sweeps', type: 'Article', status: 'published', updated: '2026-07-24' },
  { id: 'ct2', title: 'Order Flow Fundamentals', type: 'Lesson', status: 'published', updated: '2026-07-18' },
  { id: 'ct3', title: 'Weekly Market Update — Jul 28', type: 'Market Update', status: 'published', updated: '2026-07-28' },
  { id: 'ct4', title: 'Position Sizing Deep Dive', type: 'Video', status: 'draft', updated: '2026-07-27' },
  { id: 'ct5', title: 'FAQ: Kotka AI Usage Limits', type: 'FAQ', status: 'published', updated: '2026-07-12' },
];

const statusTone = { published: 'profit', draft: 'neutral' };

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type', render: (r) => <Badge tone="accent">{r.type}</Badge> },
  { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
  { key: 'updated', label: 'Last updated' },
];

export default function AdminContent() {
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Content"
        description="Publish articles, trading lessons, market updates, videos, and FAQs."
        actions={<Button icon={Plus}>New content</Button>}
      />
      <AdminTable columns={columns} rows={content} searchKeys={['title', 'type']} exportable={false} />
    </div>
  );
}
