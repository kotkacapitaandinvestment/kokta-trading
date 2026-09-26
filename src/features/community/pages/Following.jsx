import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../../../lib/api';
import { Avatar, UserName } from '../components/Identity';
import { FollowButton } from '../components/Buttons';
import { display } from '../components/inputs';
import Feed from './Feed';

export default function Following() {
  const [data, setData] = useState(null);
  const load = () => api.get('/community/following').then(setData).catch(() => setData({ users: [], markets: [], topics: [], ideas: [], events: [], topicCatalog: [] }));
  useEffect(() => { load(); }, []);
  const toggleTopic = async (t, on) => {
    if (on) await api.delete('/community/follow', { targetType: 'topic', targetId: t });
    else await api.post('/community/follow', { targetType: 'topic', targetId: t });
    load();
  };
  return (
    <div className="space-y-4">
      <section className="grid gap-4 rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900 md:grid-cols-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Traders ({data?.users.length ?? 0})</h2>
          <ul className="mt-2 space-y-2">
            {data?.users.slice(0, 8).map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <Avatar user={u} size={28} showOnline />
                <UserName user={u} className="flex-1 text-sm" showHandle={false} />
              </li>
            ))}
            {data && !data.users.length ? <li className="text-xs text-ink-400">You don't follow anyone yet. Follow traders from their posts or profiles.</li> : null}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Markets ({data?.markets.length ?? 0})</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data?.markets.map((s) => <Link key={s} to={`/app/community/markets/${s}`} className="rounded-lg bg-ink-50 px-2 py-1 font-mono text-xs text-ink-700 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-200">{display(s)}</Link>)}
            {data && !data.markets.length ? <p className="text-xs text-ink-400">Follow markets from the <Link to="/app/community/markets" className="underline">Markets</Link> tab.</p> : null}
          </div>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Topics</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data?.topicCatalog.map((t) => {
              const on = data.topics.includes(t);
              return <button key={t} type="button" aria-pressed={on} onClick={() => toggleTopic(t, on)} className={clsx('rounded-lg px-2 py-1 text-xs', on ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'bg-ink-50 text-ink-600 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-300')}>#{t}</button>;
            })}
          </div>
        </div>
      </section>
      <Feed fixedMode="following" showComposer={false} emptyText="Posts from traders you follow appear here, newest first." />
    </div>
  );
}
