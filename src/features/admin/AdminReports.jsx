import { FileBarChart, Download } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

const reports = [
  { id: 'r1', title: 'Revenue Report — July 2026', type: 'Revenue', generated: '2026-07-29' },
  { id: 'r2', title: 'Growth Report — Q3 2026', type: 'Growth', generated: '2026-07-15' },
  { id: 'r3', title: 'User Cohort Report — July 2026', type: 'Users', generated: '2026-07-10' },
  { id: 'r4', title: 'Trading Activity Report — July 2026', type: 'Trading', generated: '2026-07-08' },
  { id: 'r5', title: 'AI Usage & Cost Report — July 2026', type: 'AI Usage', generated: '2026-07-05' },
  { id: 'r6', title: 'Subscription Report — Q2 2026', type: 'Subscriptions', generated: '2026-06-30' },
];

export default function AdminReports() {
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Reports" description="Generate and download revenue, growth, user, trading, AI usage, and subscription reports." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-ink-50 dark:bg-ink-800">
              <FileBarChart className="h-4 w-4 text-ink-700 dark:text-ink-200" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{r.title}</p>
            <p className="mt-1 text-xs text-ink-400">{r.type} · Generated {r.generated}</p>
            <Button variant="secondary" size="sm" icon={Download} className="mt-4 w-full">
              Download
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
