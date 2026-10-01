import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { BookOpen, LifeBuoy, MessageSquare } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Select } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';

const STATUS = { open: ['Waiting for Kotka', 'warning'], answered: ['Kotka replied', 'profit'], closed: ['Closed', 'neutral'] };
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function NewRequest({ topics, preset, onCreated }) {
  const [form, setForm] = useState({ topic: preset.topic ?? 'other', subject: preset.subject ?? '', body: '', matchId: preset.matchId ?? '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { ticket } = await api.post('/support/tickets', form);
      toast('Sent. The Kotka team will reply here and by email.');
      onCreated(ticket);
    } catch (err) {
      if (err.data?.ticketId) onCreated({ id: err.data.ticketId });
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Select label="What’s it about?" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
        {Object.entries(topics).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </Select>
      {form.topic === 'match' ? <Input label="Match" value={form.matchId} onChange={(e) => setForm({ ...form, matchId: e.target.value.trim() })} hint="Open the match result and choose “Report a problem with this match” to fill this in." required /> : null}
      <Input label="Title" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={120} placeholder="A few words about the problem" required />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">What happened?</span>
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={6} maxLength={5000} required className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" placeholder="What you were doing, what you expected, and what happened instead." />
        <span className="mt-1 block text-xs text-ink-400">Never include your password or a login code. Kotka staff will never ask for them.</span>
      </label>
      <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to Kotka support'}</Button>
    </form>
  );
}

function Thread({ id }) {
  const navigate = useNavigate();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/support/tickets/${id}`).then((r) => setT(r.ticket)).catch((err) => setError(err.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    setBusy(true);
    try {
      setT((await api.post(`/support/tickets/${id}/messages`, { body: reply })).ticket);
      setReply('');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    await api.post(`/support/tickets/${id}/close`).then(load).catch((err) => toast(err.message, { tone: 'error' }));
  };
  if (error) return <EmptyState icon={LifeBuoy} title="That request didn’t load" description={error} action={<Button variant="secondary" onClick={() => navigate('/app/support')}>Back to your requests</Button>} />;
  if (!t) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  return (
    <Card>
      <CardHeader title={t.subject} subtitle={`${t.topicLabel} · opened ${when(t.createdAt)}`} action={<Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>} />
      <CardBody className="space-y-3">
        {t.matchId ? <p className="text-sm"><Link to={`/app/game/matches/${t.matchId}`} className="font-medium text-accent-700 hover:underline dark:text-accent-300">Open the match</Link></p> : null}
        <ol className="space-y-3">
          {t.messages.map((m) => (
            <li key={m.id} className={clsx('max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed', m.fromStaff ? 'bg-ink-900 text-white dark:bg-ink-700' : 'ml-auto bg-accent-50 text-ink-800 dark:bg-accent-900/20 dark:text-ink-100')}>
              <p className="mb-1 text-[11px] font-semibold opacity-70">{m.fromStaff ? 'Kotka support' : 'You'} · {when(m.createdAt)}</p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ol>
        {t.status !== 'closed' ? (
          <div className="space-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
            <label className="block">
              <span className="sr-only">Your reply</span>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000} placeholder="Add a reply" className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={send} disabled={busy || reply.trim().length < 2}>Send reply</Button>
              <Button size="sm" variant="ghost" onClick={close}>This is sorted: close it</Button>
            </div>
          </div>
        ) : <p className="text-xs text-ink-400">This request is closed. Open a new one if you need more help.</p>}
      </CardBody>
    </Card>
  );
}

export default function Support() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const creating = params.get('new') !== null;
  const load = useCallback(() => api.get('/support/tickets').then(setData).catch((err) => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);
  const preset = { topic: params.get('topic') ?? undefined, matchId: params.get('match') ?? undefined, subject: params.get('match') ? 'A problem with a match' : undefined };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Help" title="Help and support" description="Answers to common questions, and a direct line to the Kotka team." actions={<Button as={Link} to="/help" variant="secondary" icon={BookOpen}>Help centre</Button>} />
      {id ? <Thread id={id} /> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title={creating ? 'New request' : 'Your requests'} action={creating ? <Button size="sm" variant="ghost" onClick={() => setParams({})}>Cancel</Button> : <Button size="sm" icon={MessageSquare} onClick={() => setParams({ new: '1' })}>New request</Button>} />
            <CardBody>
              {error ? <p role="alert" className="text-sm text-loss-500">{error}</p> : !data ? <div className="h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : creating ? (
                <NewRequest topics={data.topics} preset={preset} onCreated={(t) => { load(); navigate(`/app/support/${t.id}`); }} />
              ) : data.tickets.length ? (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {data.tickets.map((t) => (
                    <li key={t.id}>
                      <Link to={`/app/support/${t.id}`} className="flex items-center justify-between gap-3 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-800 dark:text-ink-100">{t.subject}</span>
                          <span className="block text-xs text-ink-400">{t.topicLabel} · {when(t.lastMessageAt)}</span>
                        </span>
                        <Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState size="inline" icon={LifeBuoy} title="No requests yet" description="If something isn’t working, or you have a question about money or a match, send the team a request." action={<Button size="sm" onClick={() => setParams({ new: '1' })}>New request</Button>} />}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Quick answers" />
            <CardBody className="space-y-2 text-sm">
              {[['/help#security', 'Two-step verification and signing in'], ['/help#wallet', 'Adding and withdrawing money'], ['/help#game', 'How competitions, fees and prizes work'], ['/help#problems', 'Reporting a problem with a match'], ['/status', 'Is Kotka working right now?']].map(([to, label]) => (
                <Link key={to} to={to} className="block rounded-lg px-3 py-2 text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800">{label}</Link>
              ))}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
