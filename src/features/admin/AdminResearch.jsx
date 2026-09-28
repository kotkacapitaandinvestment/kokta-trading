import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Copy, KeyRound, Landmark, Loader2, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { conditionWord } from '../../lib/plain';
import { confirmDialog } from '../../lib/dialogs';
import EmptyState from '../../components/ui/EmptyState';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never');

function Toggle({ checked, onChange, disabled, label, hint }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-sm text-ink-700 dark:text-ink-200">{label}</p>
        {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent-500' : 'bg-ink-200 dark:bg-ink-700')}
      >
        <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

async function forceRefresh(subject) {
  const res = await fetch(`/api/research/${subject}/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? data.error ?? 'Couldn’t update this report. Try again in a few minutes.');
  }
  const text = await res.text();
  const events = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const err = events.find((e) => e.type === 'error');
  if (err) throw new Error(err.message);
  return events.find((e) => e.type === 'done');
}

function StatusCard({ status, onRefreshed }) {
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const run = async (subject) => {
    setBusy((b) => ({ ...b, [subject]: true }));
    setErrors((e) => ({ ...e, [subject]: null }));
    try {
      await forceRefresh(subject);
      onRefreshed();
    } catch (err) {
      setErrors((e) => ({ ...e, [subject]: err.message }));
    } finally {
      setBusy((b) => ({ ...b, [subject]: false }));
    }
  };
  return (
    <Card>
      <CardHeader title="Research status" subtitle={`Last hourly update: ${when(status?.lastCronRunAt)}`} />
      <CardBody className="-mx-0 overflow-x-auto px-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
              <th className="px-5 py-2 font-medium">Market</th>
              <th className="px-2 py-2 font-medium">Outlook score</th>
              <th className="px-2 py-2 font-medium">Condition</th>
              <th className="px-2 py-2 font-medium">Summary written by</th>
              <th className="px-2 py-2 font-medium">Last researched</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {!status ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-sm text-ink-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading research status…
                </td>
              </tr>
            ) : null}
            {(status?.reports ?? []).map((r) => (
              <tr key={`${r.kind}-${r.subject}`} className="border-b border-ink-50 dark:border-ink-800/60">
                <td className="px-5 py-2 font-mono text-xs text-ink-800 dark:text-ink-100">{/^[A-Z]{6}$/.test(r.subject) ? `${r.subject.slice(0, 3)}/${r.subject.slice(3)}` : r.subject}</td>
                <td className="px-2 py-2 font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{r.score ?? '–'}{r.confidence !== null ? <span className="text-ink-400"> · {r.confidence}% confidence</span> : null}</td>
                <td className="px-2 py-2 text-xs text-ink-600 dark:text-ink-300">{r.condition ? conditionWord(r.condition) : 'Not researched'}</td>
                <td className="px-2 py-2 text-xs text-ink-500">{r.narrativeSource === 'ai' ? 'Kotka AI (checked)' : r.narrativeSource === 'rules' ? 'Standard template' : '–'}</td>
                <td className="px-2 py-2 text-xs">
                  {r.freshness ? (
                    <span className={r.freshness.stale ? 'text-amber-700 dark:text-amber-400' : 'text-ink-600 dark:text-ink-300'}>
                      {when(r.freshness.lastUpdated)}
                      {r.freshness.stale ? ' (out of date)' : ''}
                    </span>
                  ) : (
                    <span className="text-ink-400">Never</span>
                  )}
                  {errors[r.subject] ? <p className="text-loss-500">{errors[r.subject]}</p> : null}
                </td>
                <td className="px-5 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={busy[r.subject] ? Loader2 : RefreshCw} disabled={busy[r.subject]} onClick={() => run(r.subject)}>
                    {busy[r.subject] ? 'Updating…' : 'Update now'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

// Reports written before the plain names keep the old ones; show those in words too.
const LEGACY_SOURCE = [
  [/^IMF WEO vintage catalogue$/, 'IMF list of forecast editions'],
  [/^IMF World Economic Outlook \(current\)$/, 'IMF economic forecasts (latest)'],
  [/^IMF World Economic Outlook \((.+) vintage\)$/, 'IMF economic forecasts ($1 edition)'],
  [/^IMF World Economic Outlook$/, 'IMF economic forecasts'],
  [/^IMF COFER.*$/, 'IMF data on central bank currency reserves'],
  [/^Calendar: FOMC$/, 'US Federal Reserve meeting dates'],
  [/^Calendar: ECB$/, 'European Central Bank meeting dates'],
  [/^Calendar: BLS$/, 'US jobs and inflation release dates'],
  [/^Calendar: BEA$/, 'US growth and spending release dates'],
  [/^Calendar: EUROSTAT$/, 'Eurostat release dates'],
];
const sourceName = (name) => {
  for (const [re, plain] of LEGACY_SOURCE) if (re.test(name)) return name.replace(re, plain);
  return name;
};

function SourceHealth({ status }) {
  const list = status?.sourceHealth ?? [];
  return (
    <Card>
      <CardHeader title="Data sources" subtitle={!status ? 'Loading…' : status.sourceHealthAt ? `As of the last research update, ${when(status.sourceHealthAt)}` : 'No research updates yet'} />
      <CardBody>
        {list.length ? (
          <ul className="space-y-1.5">
            {list.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-ink-600 dark:text-ink-300">{sourceName(s.name)}</span>
                <span className={clsx('flex shrink-0 items-center gap-1', s.status === 'failed' ? 'text-loss-500' : s.status === 'disabled' ? 'text-ink-400' : 'text-profit-600 dark:text-profit-400')}>
                  {s.status === 'failed' ? <XCircle className="h-3.5 w-3.5" /> : s.status === 'disabled' ? null : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {{ ok: 'Working', cached: 'Working (saved copy)', failed: 'Not responding', disabled: 'Turned off' }[s.status] ?? s.status}
                </span>
              </li>
            ))}
          </ul>
        ) : status ? (
          <p className="text-sm text-ink-400">Update research once to see how every data source is doing.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function SettingsCard({ data, canEdit, onSaved }) {
  const [form, setForm] = useState(data.settings);
  const [newPair, setNewPair] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const cat = data.catalog;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { settings } = await api.put('/admin/research/settings', form);
      setForm(settings);
      setMessage({ ok: true, text: 'Saved. Reports use these settings from their next update.' });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const addPair = () => {
    const p = newPair.toUpperCase().replace(/[^A-Z]/g, '');
    if (p.length === 6 && !form.pairs.includes(p)) set('pairs', [...form.pairs, p]);
    setNewPair('');
  };

  return (
    <Card>
      <CardHeader title="Settings" subtitle={canEdit ? 'Changes apply from the next research update.' : 'View only. Only a Super Admin can change these settings.'} />
      <CardBody className="space-y-6">
        <div className="divide-y divide-ink-50 dark:divide-ink-800/60">
          <Toggle label="Show Fundamental Research to traders" hint="When off, traders see a short “not available right now” notice. Admins can still update research." checked={form.enabled} onChange={(v) => set('enabled', v)} disabled={!canEdit} />
          <Toggle label="AI-written summaries" hint="When off, reports use a standard written summary built from the numbers." checked={form.aiNarrative} onChange={(v) => set('aiNarrative', v)} disabled={!canEdit} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Available to" value={form.availability} onChange={(e) => set('availability', e.target.value)} disabled={!canEdit}>
            <option value="all">All traders</option>
            <option value="premium">Premium and above (once paid plans are on)</option>
          </Select>
          <Input label="Update reports every (hours)" hint="How often reports update automatically." type="number" min={1} max={168} value={form.refreshHours} onChange={(e) => set('refreshHours', e.target.value)} disabled={!canEdit} />
          <Input label="Upcoming events to show (days ahead)" hint="How far ahead reports list rate decisions and data releases." type="number" min={7} max={120} value={form.catalystHorizonDays} onChange={(e) => set('catalystHorizonDays', e.target.value)} disabled={!canEdit} />
        </div>
        <Input
          label="AI model for summaries (advanced)"
          value={form.model}
          placeholder={cat.defaultModel}
          hint={`Leave blank to use Kotka’s tested default. If a model stops working, Kotka switches to another tested one automatically. ${data.integrations.nvidia ? 'Uses the NVIDIA key from Connected services.' : 'NVIDIA isn’t connected, so reports use the standard written summary. Connect it in Connected services.'}`}
          onChange={(e) => set('model', e.target.value)}
          disabled={!canEdit}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700 dark:text-ink-200">Supported currencies</p>
          <div className="flex flex-wrap gap-2">
            {cat.currencies.map((c) => {
              const on = form.currencies.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => set('currencies', on ? form.currencies.filter((x) => x !== c.code) : [...form.currencies, c.code])}
                  className={clsx('rounded-lg border px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed', on ? 'border-accent-500 bg-accent-50 text-ink-900 dark:bg-accent-900/20 dark:text-ink-50' : 'border-ink-200 text-ink-500 dark:border-ink-700')}
                >
                  <span className="font-mono font-medium">{c.code}</span> <span className="text-ink-400">{c.coverage === 'full' ? 'full' : 'basic'}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">Full: national statistics, market expectations, central bank statements and official event calendars. Basic: international data only (IMF and the Bank for International Settlements).</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700 dark:text-ink-200">Supported pairs</p>
          <div className="flex flex-wrap gap-2">
            {form.pairs.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1 font-mono text-xs dark:border-ink-700">
                {p}
                {canEdit ? (
                  <button type="button" onClick={() => set('pairs', form.pairs.filter((x) => x !== p))} className="text-ink-400 hover:text-loss-500" aria-label={`Remove ${p}`}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {canEdit ? (
              <span className="inline-flex items-center gap-1">
                <input value={newPair} onChange={(e) => setNewPair(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPair())} placeholder="e.g. AUDJPY" className="h-7 w-24 rounded-lg border border-ink-200 bg-white px-2 font-mono text-xs text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
                <Button size="sm" variant="ghost" icon={Plus} onClick={addPair}>Add</Button>
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">Both currencies of a pair must be turned on above. Otherwise the pair is removed when you save.</p>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-ink-700 dark:text-ink-200">Research data sources</p>
          <div className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {Object.entries(cat.sources).map(([key, label]) => (
              <Toggle key={key} label={label} checked={form.sources[key] !== false} onChange={(v) => set('sources', { ...form.sources, [key]: v })} disabled={!canEdit} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">Turning a source off leaves its figures out of every report (shown as “not available”) and makes reports less certain. Access keys for NVIDIA, FRED and Massive are in Connected services.</p>
        </div>

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving} icon={saving ? Loader2 : undefined}>{saving ? 'Saving…' : 'Save settings'}</Button>
            {message ? <span className={clsx('text-sm', message.ok ? 'text-profit-600' : 'text-loss-500')}>{message.text}</span> : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function CronCard({ settings, cronJob, lastCronRunAt, canEdit, onRotated }) {
  const [issued, setIssued] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const managed = cronJob?.managed;
  const job = cronJob?.status;

  const rotate = async () => {
    const warning = managed
      ? 'Kotka will update the scheduled job for you automatically.'
      : 'The current scheduled-job link will stop working until you paste the new one into cron-job.org.';
    if (settings.cron.configured && !(await confirmDialog({ title: 'Create a new update link?', message: warning, confirmLabel: 'Create new link' }))) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post('/admin/research/cron-token', {});
      if (data.managed) setResult(data);
      else setIssued(data);
      onRotated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(issued.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const badge = managed && job ? (job.enabled ? (job.lastStatusOk || job.lastStatusCode === 0 ? 'profit' : 'warning') : 'loss') : settings.cron.configured ? 'profit' : 'warning';
  const badgeText = managed && job ? (job.enabled ? 'Running hourly' : 'Paused on cron-job.org') : settings.cron.configured ? 'Link active' : 'Not set up';

  return (
    <Card>
      <CardHeader
        title="Hourly update"
        subtitle={managed ? `Kotka keeps this set up for you. Last update: ${when(lastCronRunAt)}.` : `Last update: ${when(lastCronRunAt)}.`}
        action={<Badge tone={badge}>{badgeText}</Badge>}
      />
      <CardBody className="space-y-3 text-sm text-ink-600 dark:text-ink-300">
        <p>Every hour, Kotka refreshes up to {settings.cron.batchSize} of the oldest research reports, pulls in news and events, sends reminders and checks the AI models still work. The schedule itself runs on cron-job.org.</p>

        {managed && job ? (
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
              <dt className="text-ink-400">Next run</dt>
              <dd className="mt-0.5 text-ink-800 dark:text-ink-100">{when(job.nextExecution)}</dd>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
              <dt className="text-ink-400">Last run</dt>
              <dd className="mt-0.5 text-ink-800 dark:text-ink-100">{job.lastExecution ? when(job.lastExecution) : 'Not yet'}</dd>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800">
              <dt className="text-ink-400">Last result</dt>
              <dd className={clsx('mt-0.5', job.lastStatusOk ? 'text-profit-600 dark:text-profit-400' : job.lastStatusCode === 0 ? 'text-ink-800 dark:text-ink-100' : 'text-loss-500')}>{job.lastStatus}</dd>
            </div>
          </dl>
        ) : null}
        {managed && cronJob.error ? <p className="text-xs text-loss-500">Kotka couldn’t check the schedule on cron-job.org just now. It will try again; if this persists, check the key in Connected services.</p> : null}
        {!managed ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-500 dark:text-ink-400">
              <li>Create an update link below and copy it (it’s shown only once).</li>
              <li>In cron-job.org, add a job that opens that link every 60 minutes.</li>
            </ol>
            <p className="text-xs text-ink-400">Or add your cron-job.org key in Connected services and Kotka will set this up and keep it in sync for you.</p>
          </>
        ) : null}

        {result ? (
          <p className="rounded-lg bg-profit-50 p-3 text-xs text-profit-700 dark:bg-profit-500/10 dark:text-profit-400">
            Done. The schedule on cron-job.org was {result.created ? 'created' : 'updated'} with the new link, so the next hourly update will use it.
          </p>
        ) : null}
        {error ? <p className="rounded-lg bg-loss-50 p-3 text-xs text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">{error}</p> : null}
        {issued ? (
          <div className="rounded-lg border border-accent-500/40 bg-accent-50 p-3 dark:bg-accent-900/20">
            <p className="mb-1 text-xs font-medium text-ink-800 dark:text-ink-100">Your update link (copy it now: it won’t be shown again)</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink-800 dark:text-ink-100">{issued.url}</code>
              <Button size="sm" variant="secondary" icon={copied ? CheckCircle2 : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
          </div>
        ) : null}
        {canEdit ? (
          <Button variant="secondary" size="sm" icon={busy ? Loader2 : KeyRound} disabled={busy} onClick={rotate}>
            {busy ? 'Creating…' : settings.cron.configured ? 'Create a new link' : 'Create update link'}
          </Button>
        ) : (
          <p className="text-xs text-ink-400">Only a Super Admin can change the update link.</p>
        )}
      </CardBody>
    </Card>
  );
}

const FACTOR_LABEL = { valuation: 'Currency valuation', imf_view: 'IMF view', central_bank: 'Central bank', fiscal: 'Government finances', external: 'Trade and payments', financial_stability: 'Financial stability', general: 'General' };
// Verdicts are stored exactly as the report words them (in capitals); show them in sentence case.
const sentence = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);
const EMPTY_ASSESSMENT = { currency: 'EUR', factor: 'valuation', institution: 'International Monetary Fund', title: '', classification: 'BROADLY IN LINE', statement: '', url: '', publishedAt: '' };

function AssessmentsCard({ catalog }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ASSESSMENT);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = () => api.get('/admin/research/assessments').then((d) => setItems(d.items)).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/admin/research/assessments', { ...form, classification: form.factor === 'valuation' ? form.classification : null });
      setOpen(false);
      setForm(EMPTY_ASSESSMENT);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id) => {
    if (!(await confirmDialog({ title: 'Delete this assessment?', message: 'Reports will stop citing it the next time they update.', confirmLabel: 'Delete', danger: true }))) return;
    await api.delete(`/admin/research/assessments/${id}`);
    load();
  };
  return (
    <Card>
      <CardHeader
        title="Official assessments you’ve added"
        subtitle="Add official views Kotka can’t fetch automatically, such as the IMF’s view on whether a currency is over- or undervalued. Always link the original report."
        action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>Add</Button>}
      />
      <CardBody>
        {!items ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : items.length ? (
          <ul className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {items.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink-800 dark:text-ink-100">
                    <span className="font-mono text-xs">{a.currency}</span> {a.title}
                    {a.classification ? <span className="ml-1.5 text-xs text-ink-400">{sentence(a.classification)}</span> : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{a.statement}</p>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent-700 underline dark:text-accent-300">{a.institution}, {new Date(a.publishedAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</a>
                </div>
                <button type="button" onClick={() => remove(a.id)} className="text-ink-300 hover:text-loss-500" aria-label="Delete assessment">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">None added yet. Without one, reports say the IMF hasn’t published a valuation, and Kotka won’t guess one.</p>
        )}
      </CardBody>
      <Modal open={open} onClose={() => setOpen(false)} title="Add an official assessment" width="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Currency" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {catalog.currencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </Select>
            <Select label="Topic" value={form.factor} onChange={(e) => set('factor', e.target.value)}>
              {catalog.assessmentFactors.map((f) => (
                <option key={f} value={f}>{FACTOR_LABEL[f] ?? f}</option>
              ))}
            </Select>
          </div>
          <Input label="Institution" value={form.institution} onChange={(e) => set('institution', e.target.value)} />
          <Input label="Title" placeholder="e.g. External Sector Report 2026: euro area assessment" value={form.title} onChange={(e) => set('title', e.target.value)} />
          {form.factor === 'valuation' ? (
            <Select label="Verdict (as worded in the report)" value={form.classification} onChange={(e) => set('classification', e.target.value)}>
              {catalog.valuationClasses.map((c) => (
                <option key={c} value={c}>{sentence(c)}</option>
              ))}
            </Select>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">Statement</span>
            <textarea
              value={form.statement}
              onChange={(e) => set('statement', e.target.value)}
              rows={4}
              placeholder="Quote the source directly wherever possible."
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input label="Link to the report" type="url" placeholder="https://www.imf.org/..." value={form.url} onChange={(e) => set('url', e.target.value)} />
            </div>
            <Input label="Publication date" type="date" value={form.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />
          </div>
          {error ? <p className="text-sm text-loss-500">{error}</p> : null}
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save assessment'}</Button>
        </form>
      </Modal>
    </Card>
  );
}

function RunsCard() {
  const [runs, setRuns] = useState(null);
  useEffect(() => {
    api.get('/admin/research/runs').then((d) => setRuns(d.runs)).catch(() => setRuns([]));
  }, []);
  return (
    <Card>
      <CardHeader title="Recent research updates" />
      <CardBody className="overflow-x-auto px-0">
        {!runs ? (
          <p className="px-5 text-sm text-ink-400">Loading…</p>
        ) : runs.length ? (
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
                <th className="px-5 py-2 font-medium">Started</th>
                <th className="px-2 py-2 font-medium">Market</th>
                <th className="px-2 py-2 font-medium">Started by</th>
                <th className="px-2 py-2 font-medium">Result</th>
                <th className="px-2 py-2 font-medium">Time taken</th>
                <th className="px-5 py-2 font-medium">Data that didn’t load</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-ink-50 align-top dark:border-ink-800/60">
                  <td className="px-5 py-2 text-ink-600 dark:text-ink-300">{when(r.startedAt)}</td>
                  <td className="px-2 py-2 font-mono text-ink-800 dark:text-ink-100">{/^[A-Z]{6}$/.test(r.subject) ? `${r.subject.slice(0, 3)}/${r.subject.slice(3)}` : r.subject}</td>
                  <td className="px-2 py-2 text-ink-600 dark:text-ink-300">{{ cron: 'Hourly update', user: 'Trader request', admin: 'Admin request' }[r.trigger] ?? r.trigger}{r.user ? ` (${r.user.name})` : ''}</td>
                  <td className={clsx('px-2 py-2 font-medium', r.status === 'failed' ? 'text-loss-500' : r.status === 'running' ? 'text-amber-700 dark:text-amber-400' : 'text-profit-600 dark:text-profit-400')}>
                    {{ done: 'Finished', succeeded: 'Finished', failed: 'Didn’t finish', running: 'In progress' }[r.status] ?? r.status}
                    {r.error ? <p className="font-normal text-loss-500" title={r.error}>Something went wrong while writing this report. It will be retried on the next hourly update.</p> : null}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums text-ink-600 dark:text-ink-300">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)} seconds` : '–'}</td>
                  <td className="px-5 py-2 text-ink-500">{r.failedSources.length ? r.failedSources.map((s) => sourceName(s.name)).join('; ') : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState size="inline" icon={Landmark} title="No reports written yet" description="Reports appear here each time Kotka researches a currency or pair, on schedule or when a trader asks." />
        )}
      </CardBody>
    </Card>
  );
}

export default function AdminResearch() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const loadSettings = () => api.get('/admin/research/settings').then(setData).catch((err) => setError(err.message));
  const loadStatus = () => api.get('/admin/research/status').then(setStatus).catch(() => {});
  useEffect(() => {
    loadSettings();
    loadStatus();
  }, []);

  if (error) return <p className="text-sm text-loss-500">Could not load research administration: {error}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-ink-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading research administration
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Fundamental Research" description="Choose which markets and data Kotka researches, how often reports update, and add official assessments." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <StatusCard status={status} onRefreshed={loadStatus} />
        </div>
        <SourceHealth status={status} />
      </div>
      <SettingsCard data={data} canEdit={canEdit} onSaved={() => { loadSettings(); loadStatus(); }} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CronCard settings={data.settings} cronJob={data.cronJob} lastCronRunAt={status?.lastCronRunAt} canEdit={canEdit} onRotated={loadSettings} />
        <AssessmentsCard catalog={data.catalog} />
      </div>
      <RunsCard />
    </div>
  );
}
