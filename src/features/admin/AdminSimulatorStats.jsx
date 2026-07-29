import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import AdminTable from './components/AdminTable';

const rows = [
  { id: 'd1', difficulty: 'Beginner', sessions: 8420, avgScore: 74 },
  { id: 'd2', difficulty: 'Intermediate', sessions: 6210, avgScore: 66 },
  { id: 'd3', difficulty: 'Advanced', sessions: 3140, avgScore: 58 },
  { id: 'd4', difficulty: 'Professional', sessions: 1280, avgScore: 51 },
  { id: 'd5', difficulty: 'Institutional Chaos', sessions: 640, avgScore: 44 },
];

const columns = [
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'sessions', label: 'Sessions (30d)', render: (r) => r.sessions.toLocaleString() },
  { key: 'avgScore', label: 'Avg overall score', render: (r) => `${r.avgScore}/100` },
];

export default function AdminSimulatorStats() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Simulator Statistics" description="Engagement and scoring distribution across simulator difficulty levels." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Sessions (30d)" value="19,690" delta="+12%" deltaTone="profit" />
        <StatTile label="Avg Score" value="62/100" delta="+2" deltaTone="profit" />
        <StatTile label="Completion Rate" value="88%" />
        <StatTile label="Most Played" value="Beginner" />
      </div>
      <AdminTable columns={columns} rows={rows} searchKeys={['difficulty']} />
    </div>
  );
}
