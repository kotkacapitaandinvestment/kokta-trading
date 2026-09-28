import { AlertTriangle } from 'lucide-react';
import EmptyState from '../../../components/ui/EmptyState';

// Shown when an admin page's figures fail to load, instead of a blank page.
export default function LoadError({ message }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Couldn’t load these figures"
      description={message ?? 'Please refresh the page to try again.'}
      action={<button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-ink-900 px-3 py-2 text-xs font-medium text-white dark:bg-accent-500 dark:text-ink-950">Refresh</button>}
    />
  );
}
