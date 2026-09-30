// Open challenges: who's looking for an opponent, and what happened to
// the challenges taken in the last half hour.
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import { Avatar } from '../../community/components/Identity';
import { naira, minutes, virtual } from '../format';

const STATUS = {
  looking: ['Looking for trader', 'accent'],
  found: ['Opponent found', 'neutral'],
  starting: ['Starting soon', 'warning'],
  in_match: ['In match', 'profit'],
};

function Trader({ person }) {
  if (!person) return null;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar user={person} size={30} />
      {person.username ? (
        <Link to={`/app/game/traders/${person.username}`} className="truncate font-medium text-ink-800 hover:underline dark:text-ink-100">{person.name}</Link>
      ) : (
        <span className="truncate font-medium text-ink-800 dark:text-ink-100">{person.name}</span>
      )}
    </span>
  );
}

export default function OpenChallenges({ rows, available, verified, onJoin, onCancel }) {
  if (!rows.length) return <EmptyState size="inline" icon={Trophy} title="No open challenges right now" description="Post one yourself and any verified trader can accept it, or use Quick Match." />;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-400 dark:border-ink-800">
            {['Trader', 'Stake', 'Length', 'Virtual capital', 'Market', 'Status', ''].map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {rows.map((m) => {
            const [label, tone] = STATUS[m.status];
            return (
              <tr key={m.id}>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Trader person={m.creator} />
                    {m.opponent && m.status !== 'looking' ? <span className="shrink-0 text-xs text-ink-400">vs {m.opponent.name}</span> : null}
                  </div>
                </td>
                <td className="px-5 py-2.5 tabular-nums text-ink-800 dark:text-ink-100">{naira(m.stakeKobo)}</td>
                <td className="px-5 py-2.5 text-ink-600 dark:text-ink-300">{minutes(m.durationSec)}</td>
                <td className="px-5 py-2.5 tabular-nums text-ink-600 dark:text-ink-300">{virtual(m.startingCapital)}</td>
                <td className="px-5 py-2.5 text-ink-600 dark:text-ink-300">Duel{m.pair ? ` · ${m.pair}` : ''}</td>
                <td className="px-5 py-2.5"><Badge tone={tone}>{label}</Badge></td>
                <td className="px-5 py-2.5 text-right">
                  {m.status !== 'looking' ? null : m.mine ? (
                    <Button size="sm" variant="ghost" onClick={() => onCancel(m)}>Cancel</Button>
                  ) : (
                    <Button size="sm" onClick={() => onJoin(m)} disabled={!verified || m.stakeKobo > available}>
                      {m.stakeKobo > available ? 'Not enough balance' : 'Join'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
