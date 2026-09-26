import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';

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
        description="Live checks of the database, AI models, scheduled jobs and connected services. Nothing here is assumed; each line is what the check just saw."
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
            <CardHeader title="Core" subtitle={`Checked ${new Date(d.checkedAt).toLocaleTimeString()}${d.runtime.deployment ? ` · build ${d.runtime.deployment}` : ''} · ${d.runtime.region}`} />
            <CardBody className="divide-y divide-ink-100 dark:divide-ink-800">
              <Row state={d.database.ok ? 'ok' : 'down'} title="Database" detail={d.database.ok ? 'Postgres responded to a query.' : d.database.error} meta={d.database.ok ? `${d.database.latencyMs} ms` : null} />
              <Row
                state={aiState}
                title="Kotka AI models"
                detail={
                  d.ai.configured
                    ? `Chat: ${d.ai.active.chat ?? 'none available'} · Vision: ${d.ai.active.vision ?? 'none'} · Research: ${d.ai.active.narrative ?? 'none'}${d.ai.unhealthy.length ? `. Skipped after failing checks: ${d.ai.unhealthy.map((u) => `${u.model.split('/').pop()} (${u.status})`).join(', ')}.` : '.'}`
                    : 'The NVIDIA integration is not configured, so Kotka AI is off.'
                }
                meta={d.ai.configured ? `checked ${ago(d.ai.checkedAt)}` : null}
              />
              <Row
                state={cronState}
                title="Scheduled job (cron-job.org)"
                detail={
                  !cron?.managed
                    ? 'No cron-job.org key is configured; research refreshes only when someone opens a stale report.'
                    : cron.error
                      ? cron.error
                      : cron.status
                        ? `Job #${cron.jobId}: last run ${cron.status.lastStatus}${cron.status.nextExecution ? `, next ${new Date(cron.status.nextExecution).toLocaleTimeString()}` : ''}.`
                        : 'Key configured but no job has been created yet. Rotate the cron token in Fundamental Research to create it.'
                }
                meta={cron?.status?.lastExecution ? ago(cron.status.lastExecution) : null}
              />
              <Row
                state={researchState}
                title="Fundamental Research"
                detail={
                  d.research.enabled
                    ? `${d.research.runs24h} runs in 24h, ${d.research.failed24h} failed. Last run ${d.research.lastRunStatus ?? 'n/a'}; ${d.research.sourcesOk} sources reachable${d.research.sourcesFailed.length ? `, failing: ${d.research.sourcesFailed.join(', ')}` : ''}.`
                    : 'Disabled by an administrator.'
                }
                meta={ago(d.research.lastRunAt)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Connected services" subtitle={<Link to="/admin/integrations" className="text-accent-600 hover:underline dark:text-accent-400">Manage in Integrations</Link>} />
            <CardBody className="divide-y divide-ink-100 dark:divide-ink-800">
              {d.integrations.map((i) => (
                <Row
                  key={i.key}
                  state={i.configured && i.enabled ? 'ok' : i.configured ? 'warn' : 'off'}
                  title={i.name}
                  detail={`${i.role}${i.configured && !i.enabled ? '. Configured but disabled.' : ''}`}
                  meta={i.updatedAt ? `updated ${ago(i.updatedAt)}` : null}
                />
              ))}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Accounts and security, last 24 hours" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: 'New sign-ups', value: d.security.signups24h },
                { label: 'Failed sign-ins', value: d.security.failedLogins24h, hint: 'Lockout after 8 per email in 15 min' },
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
