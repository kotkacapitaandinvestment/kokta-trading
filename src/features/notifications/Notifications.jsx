import { useEffect, useState } from 'react';
import { ListChecks, NotebookPen, ShieldAlert, Sparkles, CheckCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { usePersistedState } from '../../lib/usePersistedState';
import { api } from '../../lib/api';

const iconFor = { checklist: ListChecks, journal: NotebookPen, risk: ShieldAlert };

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = usePersistedState('notifications.readIds', []);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api
      .get('/me/notifications')
      .then(({ notifications }) => setItems(notifications.map((n) => ({ ...n, read: readIds.includes(n.id) }))))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? items : items.filter((n) => (filter === 'unread' ? !n.read : n.type === filter));

  const markAllRead = () => {
    const ids = items.map((n) => n.id);
    setReadIds((prev) => [...new Set([...prev, ...ids])]);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id) => {
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'journal', label: 'Journal' },
    { id: 'risk', label: 'Risk' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Checklist reminders, journal nudges, and risk warnings — computed live from today's activity."
        actions={
          <Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAllRead}>
            Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === t.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="You're all caught up" description="No notifications match this filter." />
      ) : (
        <Card className="divide-y divide-ink-50 dark:divide-ink-800/60">
          {filtered.map((n) => {
            const Icon = iconFor[n.type] ?? Sparkles;
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.read ? 'bg-ink-50 dark:bg-ink-800' : 'bg-accent-50 dark:bg-accent-900/20'}`}>
                  <Icon className={`h-4 w-4 ${n.read ? 'text-ink-400' : 'text-accent-600 dark:text-accent-400'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${n.read ? 'text-ink-600 dark:text-ink-300' : 'text-ink-900 dark:text-ink-50'}`}>{n.title}</p>
                    <span className="shrink-0 text-xs text-ink-400">{n.time}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-400">{n.body}</p>
                </div>
                {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-500" /> : null}
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
