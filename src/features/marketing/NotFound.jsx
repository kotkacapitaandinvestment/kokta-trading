import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { CONTACT, mailto } from '../../lib/contact';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-ink-950">
      <span className="text-sm font-semibold text-accent-600 dark:text-accent-400">Kotka</span>
      <h1 className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Button as={Link} to="/" className="mt-6">
        Back to home
      </Button>
      <p className="mt-6 text-xs text-ink-400">
        Can’t find what you need? Email <a className="font-medium text-accent-600 hover:underline dark:text-accent-400" href={mailto(CONTACT.info)}>{CONTACT.info}</a>
      </p>
    </div>
  );
}
