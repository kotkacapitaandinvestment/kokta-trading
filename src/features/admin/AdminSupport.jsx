import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { LifeBuoy } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import LoadError from './components/LoadError';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';

const STATUS = { open: ['Waiting for us', 'warning'], answered: ['Replied', 'profit'], closed: ['Closed', 'neutral'] };
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const naira = (k) => `₦${(Number(k ?? 0) / 100).toLocaleString('en-NG')}`;

function Ticket({ id, onChanged }) {
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/admin/support/${id}`).then((r) => setT(r.ticket)).catch((err) => setError(err.message)), [id]);
  useEffect(() => { setT(null); load(); }, [load]);
  const send = async (close) => {
    setBusy(true);
    try {
      await api.post(`/admin/support/${id}/messages`, { body: reply, close });
      setReply('');
      toast(close ? 'Replied and closed. They’ve been emailed.' : 'Replied. They’ve been emailed and told in the app.');
      load();
      onChanged();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (status) => {
    await api.patch(`/admin/support/${id}`, { status }).then(() => { load(); onChanged(); }).catch((err) => toast(err.message, { tone: 'error' }));
  };
  if (error) return <LoadError message={error} />;
  if (!t) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  return (
    <Card>
      <CardHeader title={t.subject} subtitle={`${t.topicLabel} · ${t.user ? `${t.user.name}${t.user.username ? ` (@${t.user.username})` : ''}` : 'Deleted account'} · ${t.email} · opened ${when(t.createdAt)}`} action={<Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>} />
      <CardBody className="space-y-4">
        {t.match ? (
          <div className="rounded-xl border border-ink-100 p-3 text-sm dark:border-ink-800">
            <p className="font-medium text-ink-800 dark:text-ink-100">Match {t.match.code} · {t.match.status.toLowerCase()} · stake {naira(t.match.stakeKobo)}</p>
            <p className="mt-1 text-xs text-ink-500">{t.match.settledAt ? `Settled ${when(t.match.settledAt)}. ` : ''}{t.match.result?.draw ? 'Result: draw.' : t.match.result?.winnerId ? 'Result: decided.' : ''} Market record {t.match.marketHash.slice(0, 12)}… (generator v{t.match.generatorVersion}).</p>
            <p className="mt-1 text-xs"><Link to={`/app/game/matches/${t.match.id}`} className="font-medium text-accent-700 hover:underline dark:text-accent-300">Open the match report</Link> · <Link to="/admin/game?tab=matches" className="font-medium text-accent-700 hover:underline dark:text-accent-300">Matches in admin</Link></p>
          </div>
        ) : null}
        <ol className="space-y-3">
          {t.messages.map((m) => (
            <li key={m.id} className={clsx('max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed', m.fromStaff ? 'ml-auto bg-ink-900 text-white dark:bg-ink-700' : 'bg-ink-50 text-ink-800 dark:bg-ink-800 dark:text-ink-100')}>
              <p className="mb-1 text-[11px] font-semibold opacity-70">{m.fromStaff ? 'Kotka support' : 'Trader'} · {when(m.createdAt)}</p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ol>
        <div className="space-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          <label className="block">
            <span className="sr-only">Reply</span>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={5000} placeholder="Your reply. The trader sees it in the app and by email." className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => send(false)} disabled={busy || reply.trim().length < 2}>Send reply</Button>
            <Button size="sm" variant="secondary" onClick={() => send(true)} disabled={busy || reply.trim().length < 2}>Reply and close</Button>
            {t.status !== 'closed' ? <Button size="sm" variant="ghost" onClick={() => setStatus('closed')}>Close without replying</Button> : <Button size="sm" variant="ghost" onClick={() => setStatus('open')}>Reopen</Button>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminSupport() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const selected = params.get('ticket');
  const load = useCallback(() => api.get(`/admin/support?status=${status}`).then(setData).catch((err) => setError(err.message)), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Support" description="Help requests from traders, oldest waiting first. Replies are emailed to the trader and show in their app." />
      {error ? <LoadError message={error} /> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Requests"
            action={
              <div className="flex gap-1 text-xs">
                {Object.entries(STATUS).map(([s, [label]]) => (
                  <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={clsx('rounded-lg px-2.5 py-1 font-medium', status === s ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800')}>
                    {label}{data?.counts?.[s] ? ` ${data.counts[s]}` : ''}
                  </button>
                ))}
              </div>
            }
          />
          {!data ? <CardBody><div className="h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /></CardBody> : data.tickets.length ? (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {data.tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setParams({ ticket: t.id })} className={clsx('block w-full px-5 py-3 text-left', selected === t.id && 'bg-ink-50 dark:bg-ink-800/60')}>
                    <span className="block truncate text-sm font-medium text-ink-800 dark:text-ink-100">{t.subject}</span>
                    <span className="block text-xs text-ink-400">{t.topicLabel} · {t.user?.name ?? t.email} · {when(t.lastMessageAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <CardBody><EmptyState size="inline" icon={LifeBuoy} title={status === 'open' ? 'Nobody is waiting' : 'Nothing here'} description={status === 'open' ? 'New requests appear here and are emailed to the support address.' : undefined} /></CardBody>}
        </Card>
        <div className="lg:col-span-3">
          {selected ? <Ticket id={selected} onChanged={load} /> : <Card><CardBody><EmptyState size="section" icon={LifeBuoy} title="Choose a request" description="Pick one on the left to read it and reply." /></CardBody></Card>}
        </div>
      </div>
    </div>
  );
}
