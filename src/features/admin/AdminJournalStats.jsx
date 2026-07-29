import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';

const mistakes = [
  { label: 'Entered before confirmation', pct: 32 },
  { label: 'Moved stop loss', pct: 21 },
  { label: 'Sized up after a loss', pct: 18 },
  { label: 'Ignored checklist', pct: 15 },
  { label: 'Held past invalidation', pct: 14 },
];

export default function AdminJournalStats() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Journal Statistics" description="How consistently the platform's traders are journaling, and what they're logging." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Entries Logged (30d)" value="28,110" delta="+5.4%" deltaTone="profit" />
        <StatTile label="Entries per Active User" value="3.2" delta="+0.3" deltaTone="profit" />
        <StatTile label="Screenshots Attached" value="64%" />
        <StatTile label="AI Reviews Requested" value="41%" delta="+6%" deltaTone="profit" />
      </div>
      <Card>
        <CardHeader title="Most Common Logged Mistakes" />
        <CardBody className="space-y-3">
          {mistakes.map((m) => (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-ink-600 dark:text-ink-300">{m.label}</span>
                <span className="font-medium text-ink-400">{m.pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div className="h-full rounded-full bg-loss-400" style={{ width: `${m.pct}%` }} />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
