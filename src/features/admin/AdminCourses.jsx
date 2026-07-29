import { Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import AdminTable from './components/AdminTable';

const courses = [
  { id: 'co1', title: 'Institutional Order Flow Foundations', lessons: 12, enrolled: 2140, status: 'published' },
  { id: 'co2', title: 'Risk Management for Prop Traders', lessons: 8, enrolled: 3320, status: 'published' },
  { id: 'co3', title: 'Trading Psychology & Discipline', lessons: 10, enrolled: 4110, status: 'published' },
  { id: 'co4', title: 'Advanced Smart Money Concepts', lessons: 14, enrolled: 980, status: 'draft' },
];

const statusTone = { published: 'profit', draft: 'neutral' };

const columns = [
  { key: 'title', label: 'Course' },
  { key: 'lessons', label: 'Lessons' },
  { key: 'enrolled', label: 'Enrolled', render: (r) => r.enrolled.toLocaleString() },
  { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
];

export default function AdminCourses() {
  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Courses"
        description="Manage structured learning paths for traders working through the platform."
        actions={<Button icon={Plus}>New course</Button>}
      />
      <AdminTable columns={columns} rows={courses} searchKeys={['title']} exportable={false} />
    </div>
  );
}
