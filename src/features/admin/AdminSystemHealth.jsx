import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { modelName, MODEL_STATE } from '../../lib/aiModelNames';

const STATE = {
  ok: { icon: CheckCircle2, tone: 'text-profit-600 dark:text-profit-400', label: 'Working' },
  warn: { icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400', label: 'Needs attention' },
  down: { icon: XCircle, tone: 'text-loss-500', label: 'Failing' },
  off: { icon: CircleDashed, tone: 'text-ink-400', label: 'Not set up' },
};

function ago(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Row({ state, title, detail, meta }) {
  const s = STATE[state];
  return (
    <div className="flex items-start gap-3 py-3">
      <s.icon className={clsx('mt-0.5 h-4 w-4 shrink-0', s.tone)} aria-label={s.label} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{title}</p>
        {detail ? <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{detail}</p> : null}
      </div>
      {meta ? <span className="shrink-0 text-right text-[11px] tabular-nums text-ink-400">{meta}</span> : null}
    </div>
  );
}

// Errors from people's browsers and the server, grouped. Resolve one when
// it's fixed (it reopens if it comes back); mute noise you don't need.
function ErrorsCard() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.get(`/admin/errors?status=${status}`).then(setData).catch((err) => toast(err.message, { tone: 'error' })), [status]);
  useEffect(() => { load(); }, [load]);
  const show = async (id) => {
    if (open?.id === id) return setOpen(null);
    try {
      setOpen((await api.get(`/admin/errors/${id}`)).error);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const set = async (id, next) => {
    try {
      await api.patch(`/admin/errors/${id}`, { status: next });
      toast(next === 'resolved' ? 'Marked as fixed. It reopens if it happens again.' : next === 'muted' ? 'Muted.' : 'Reopened.');
      setOpen(null);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Errors"
        subtitle="From people’s browsers and from the server, grouped by kind. Emails, tokens and ids are removed before anything is stored."
        action={
          <div className="flex gap-1 text-xs">
            {['open', 'resolved', 'muted'].map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={clsx('rounded-lg px-2.5 py-1 font-medium', status === s ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800')}>
                {s === 'open' ? 'Open' : s === 'resolved' ? 'Fixed' : 'Muted'}{data?.counts?.[s] ? ` ${data.counts[s]}` : ''}
              </button>
            ))}
          </div>
        }
      />
      {!data ? <CardBody><div className="h-24 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /></CardBody> : data.errors.length ? (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {data.errors.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <button type="button" onClick={() => show(e.id)} className="flex w-full items-start gap-3 text-left" aria-expanded={open?.id === e.id}>
                <Badge tone={e.source === 'server' ? 'loss' : 'warning'}>{e.source === 'server' ? 'Server' : 'App'}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-800 dark:text-ink-100">{e.message}</span>
                  <span className="block text-xs text-ink-400">{e.path ?? 'unknown place'} · {e.count} time{e.count === 1 ? '' : 's'} · last {ago(e.lastSeenAt)}{e.release ? ` · build ${e.release}` : ''}</span>
                </span>
              </button>
              {open?.id === e.id ? (
                <div className="mt-3 space-y-2">
                  {open.sample ? <p className="text-xs text-ink-500">Latest: {[open.sample.browser, open.sample.screen, open.sample.standalone ? 'installed app' : null].filter(Boolean).join(' · ')}. First seen {ago(open.firstSeenAt)}.</p> : null}
                  {open.stack ? <pre className="max-h-64 overflow-auto rounded-lg bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-700 dark:bg-ink-800 dark:text-ink-200">{open.stack}</pre> : <p className="text-xs text-ink-400">No stack trace was sent.</p>}
                  <div className="flex gap-2">
                    {e.status !== 'resolved' ? <Button size="sm" onClick={() => set(e.id, 'resolved')}>Mark as fixed</Button> : null}
                    {e.status !== 'muted' ? <Button size="sm" variant="ghost" onClick={() => set(e.id, 'muted')}>Mute</Button> : null}
                    {e.status !== 'open' ? <Button size="sm" variant="ghost" onClick={() => set(e.id, 'open')}>Reopen</Button> : null}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <CardBody><EmptyState size="inline" icon={CheckCircle2} title={status === 'open' ? 'No open errors' : status === 'resolved' ? 'Nothing marked as fixed' : 'Nothing muted'} description={status === 'open' ? 'Errors people run into show up here within a minute.' : undefined} /></CardBody>}
    </Card>
  );
}

export default function AdminSystemHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get('/admin/stats/system')
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const d = data;
  const cron = d?.cronJob;
  const cronState = !cron?.managed ? 'off' : cron.error ? 'down' : cron.status?.lastStatusOk ? 'ok' : cron.status ? 'warn' : 'warn';
  const researchState = !d?.research.enabled ? 'off' : d?.research.failed24h || d?.research.sourcesFailed.length ? 'warn' : 'ok';
  const aiState = !d?.ai.configured ? 'off' : d.ai.active.chat ? (d.ai.unhealthy.length ? 'warn' : 'ok') : 'down';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="System Status"
        description={<>Live checks of Kotka’s data storage, Kotka AI, the hourly update and connected services, and the errors people run into. The public version is at <Link to="/status" className="font-medium text-accent-600 hover:underline dark:text-accent-400">/status</Link>.</>}
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} disabled={loading} onClick={load}>
            {loading ? 'Checking…' : 'Check again'}
          </Button>
        }
      />
      {error ? <p role="alert" className="text-sm text-loss-500">{error}</p> : null}
      {!d ? (
        !error ? <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : null
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Kotka" subtitle={`Checked at ${new Date(d.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} />
            <CardBody className="divide-y divide-ink-100 dark:divide-ink-800">
              <Row state={d.database.ok ? 'ok' : 'down'} title="Data storage" detail={d.database.ok ? 'Saving and loading data normally.' : 'Kotka can’t reach its database right now. Most pages won’t load until this recovers.'} meta={d.database.ok ? (d.database.latencyMs < 500 ? 'Responding quickly' : 'Responding slowly') : null} />
              <Row
                state={aiState}
                title="Kotka AI"
                detail={
                  d.ai.configured
                    ? `${[['Chat', d.ai.active.chat], ['chart reading', d.ai.active.vision], ['research summaries', d.ai.active.narrative]].map(([what, m]) => `${what} ${m ? `working (${modelName(m)})` : 'not available'}`).join(' · ')}.${d.ai.unhealthy.length ? ` Kotka stopped using ${d.ai.unhealthy.length === 1 ? 'one backup model' : `${d.ai.unhealthy.length} backup models`}: ${d.ai.unhealthy.map((u) => `${modelName(u.model)} (${(MODEL_STATE[u.status] ?? u.status).toLowerCase()})`).join(', ')}.` : ''}`
                    : 'Kotka AI is off because its NVIDIA key isn’t set up. Add it in Connected services.'
                }
                meta={d.ai.configured ? `checked ${ago(d.ai.checkedAt)}` : null}
              />
              <Row
                state={cronState}
                title="Hourly update"
                detail={
                  !cron?.managed
                    ? 'Not set up. Research only refreshes when someone opens an out-of-date report. Set it up in Admin → Fundamental Research.'
                    : cron.error
                      ? 'Couldn’t check the schedule on cron-job.org just now. If this persists, check its key in Connected services.'
                      : cron.status
                        ? `${cron.status.lastStatusOk ? 'Last update went through' : cron.status.lastStatusCode === 0 ? 'Hasn’t run yet' : `Last update didn’t work: ${String(cron.status.lastStatus).toLowerCase()}`}${cron.status.nextExecution ? `. Next at ${new Date(cron.status.nextExecution).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.`
                        : 'The key is saved but the schedule isn’t created yet. Create an update link in Admin → Fundamental Research.'
                }
                meta={cron?.status?.lastExecution ? ago(cron.status.lastExecution) : null}
              />
              <Row
                state={researchState}
                title="Fundamental Research"
                detail={
                  d.research.enabled
                    ? `${d.research.runs24h} report${d.research.runs24h === 1 ? '' : 's'} updated in the last 24 hours${d.research.failed24h ? `, ${d.research.failed24h} didn’t finish` : ''}. ${d.research.sourcesOk} data sources working${d.research.sourcesFailed.length ? `; not responding: ${d.research.sourcesFailed.join(', ')}` : ''}.`
                    : 'Turned off in Fundamental Research settings.'
                }
                meta={ago(d.research.lastRunAt)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Connected services" subtitle={<Link to="/admin/integrations" className="text-accent-600 hover:underline dark:text-accent-400">Manage in Connected services</Link>} />
            <CardBody className="divide-y divide-ink-100 dark:divide-ink-800">
              {d.integrations.map((i) => (
                <Row
                  key={i.key}
                  state={i.configured && i.enabled ? 'ok' : i.configured ? 'warn' : 'off'}
                  title={i.name}
                  detail={`${i.role}${i.configured && !i.enabled ? '. Set up but switched off.' : ''}`}
                  meta={i.updatedAt ? `updated ${ago(i.updatedAt)}` : null}
                />
              ))}
            </CardBody>
          </Card>

          <ErrorsCard />

          <Card className="lg:col-span-2">
            <CardHeader title="Accounts and security, last 24 hours" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: 'New sign-ups', value: d.security.signups24h },
                { label: 'Failed sign-ins', value: d.security.failedLogins24h, hint: 'An account locks for 15 minutes after 8 wrong passwords' },
                { label: 'Verifications waiting', value: d.security.pendingKyc, to: '/admin/verifications' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800/60">
                  <p className="text-xs text-ink-500 dark:text-ink-400">{s.label}</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{s.value}</p>
                  {s.hint ? <p className="mt-0.5 text-[11px] text-ink-400">{s.hint}</p> : null}
                  {s.to && s.value ? <Link to={s.to} className="mt-0.5 block text-[11px] font-medium text-accent-600 hover:underline dark:text-accent-400">Review</Link> : null}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
