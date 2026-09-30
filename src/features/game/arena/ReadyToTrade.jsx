// Ready to Trade: say you're open to a match, and see who else is.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Swords } from 'lucide-react';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import { Avatar } from '../../community/components/Identity';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/dialogs';

export default function ReadyToTrade({ me, traders, count, verified, onChallenge, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(!!me?.ready);
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api.post('/game/ready', { on: !on });
      setOn(r.ready);
      toast(r.ready ? 'You’re shown as ready to trade while you’re on Kotka Trading.' : 'You’re no longer shown as ready to trade.');
      onChanged?.();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-ink-800 dark:text-ink-100">
            <span className={clsx('h-2 w-2 rounded-full', count ? 'bg-profit-500' : 'bg-ink-300 dark:bg-ink-600')} />
            {count ? `${count} trader${count === 1 ? '' : 's'} ready to trade` : 'Nobody is marked ready right now'}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">Ready traders can be challenged straight away. You only show as ready while you’re on Kotka Trading.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Ready to trade"
          disabled={busy || !verified}
          onClick={toggle}
          title={verified ? undefined : 'Verify your identity to play for a stake'}
          className={clsx('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-profit-500' : 'bg-ink-200 dark:bg-ink-700')}
        >
          <span className={clsx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
        </button>
      </div>
      {traders.length ? (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {traders.map((t) => (
            <li key={t.person.id} className="flex items-center gap-3 py-2.5">
              <Avatar user={t.person} size={34} />
              <div className="min-w-0 flex-1">
                {t.person.username ? (
                  <Link to={`/app/game/traders/${t.person.username}`} className="block truncate text-sm font-medium text-ink-800 hover:underline dark:text-ink-100">{t.person.name}</Link>
                ) : (
                  <span className="block truncate text-sm font-medium text-ink-800 dark:text-ink-100">{t.person.name}</span>
                )}
                <span className="block text-xs text-ink-400">Level {t.level} · {t.matches ? `${t.wins} won of ${t.matches} · average score ${t.avgScore ?? '—'}` : 'No competitions yet'}</span>
              </div>
              <Button size="sm" variant="secondary" icon={Swords} disabled={!verified} onClick={() => onChallenge(t.person)}>Challenge</Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState size="inline" icon={Swords} title="No one else is ready yet" description="Turn on Ready to Trade so others can challenge you, or use Quick Match to be paired automatically." />
      )}
    </div>
  );
}
