// Recent results and this week's leading traders, from real matches only.
import { Link } from 'react-router-dom';
import { Crown, Swords } from 'lucide-react';
import EmptyState from '../../../components/ui/EmptyState';
import { Avatar } from '../../community/components/Identity';
import { minutes } from '../format';

const ago = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const Name = ({ person }) =>
  person.username ? (
    <Link to={`/app/game/traders/${person.username}`} className="font-medium text-ink-800 hover:underline dark:text-ink-100">{person.name}</Link>
  ) : (
    <span className="font-medium text-ink-800 dark:text-ink-100">{person.name}</span>
  );

export function RecentResults({ rows }) {
  if (!rows.length) return <EmptyState size="inline" icon={Swords} title="No competitions finished yet" description="Results show here as matches settle." />;
  return (
    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
      {rows.map((m) => {
        const [first, second] = m.players;
        return (
          <li key={m.id} className="py-2.5 text-sm">
            <p className="flex flex-wrap items-center gap-x-1.5">
              <Name person={first.person} />
              <span className="text-ink-500 dark:text-ink-400">{m.refund ? 'and' : m.draw ? 'drew with' : 'beat'}</span>
              <Name person={second.person} />
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {m.refund ? 'Neither traded, stakes returned' : `Kotka Score ${first.score?.toFixed(1)} vs ${second.score?.toFixed(1)}`} · {m.pair ?? 'Kotka market'} · {minutes(m.durationSec)} · {ago(m.settledAt)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function FeaturedTraders({ rows }) {
  if (!rows.length) return <EmptyState size="inline" icon={Crown} title="No one on the board this week yet" description="Three competitions in a week puts you on the leaderboard." />;
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.person.id} className="flex items-center gap-3">
          <span className="w-5 text-center text-sm font-semibold tabular-nums text-accent-600 dark:text-accent-400">{r.rank}</span>
          <Avatar user={r.person} size={34} />
          <div className="min-w-0 flex-1 text-sm">
            <Name person={r.person} />
            <p className="text-xs text-ink-400">Level {r.level} · {r.wins} won of {r.matches}</p>
          </div>
          <span className="text-right">
            <span className="block text-base font-semibold tabular-nums text-ink-900 dark:text-ink-50">{r.avgScore}</span>
            <span className="block text-[10px] uppercase tracking-wide text-ink-400">avg score</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
