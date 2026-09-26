import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Never');

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
    throw new Error(data.message ?? data.error ?? `Refresh failed (${res.status})`);
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
      <CardHeader title="Research status" subtitle={`Last scheduled run: ${when(status?.lastCronRunAt)}`} />
      <CardBody className="-mx-0 overflow-x-auto px-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
              <th className="px-5 py-2 font-medium">Instrument</th>
              <th className="px-2 py-2 font-medium">Score</th>
              <th className="px-2 py-2 font-medium">Condition</th>
              <th className="px-2 py-2 font-medium">Narrative</th>
              <th className="px-2 py-2 font-medium">Last researched</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {!status ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-sm text-ink-400">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading research status
                </td>
              </tr>
            ) : null}
            {(status?.reports ?? []).map((r) => (
              <tr key={`${r.kind}-${r.subject}`} className="border-b border-ink-50 dark:border-ink-800/60">
                <td className="px-5 py-2 font-mono text-xs text-ink-800 dark:text-ink-100">{r.subject}</td>
                <td className="px-2 py-2 font-mono text-xs tabular-nums text-ink-800 dark:text-ink-100">{r.score ?? 'n/a'}{r.confidence !== null ? <span className="text-ink-400"> · conf {r.confidence}</span> : null}</td>
                <td className="px-2 py-2 text-xs text-ink-600 dark:text-ink-300">{r.condition ?? 'Not researched'}</td>
                <td className="px-2 py-2 text-xs text-ink-500">{r.narrativeSource === 'ai' ? 'AI (verified)' : r.narrativeSource === 'rules' ? 'Rules' : 'n/a'}</td>
                <td className="px-2 py-2 text-xs">
                  {r.freshness ? (
                    <span className={r.freshness.stale ? 'text-amber-700 dark:text-amber-400' : 'text-ink-600 dark:text-ink-300'}>
                      {when(r.freshness.lastUpdated)}
                      {r.freshness.stale ? ' (stale)' : ''}
                    </span>
                  ) : (
                    <span className="text-ink-400">Never</span>
                  )}
                  {errors[r.subject] ? <p className="text-loss-500">{errors[r.subject]}</p> : null}
                </td>
                <td className="px-5 py-2 text-right">
                  <Button size="sm" variant="ghost" icon={busy[r.subject] ? Loader2 : RefreshCw} disabled={busy[r.subject]} onClick={() => run(r.subject)}>
                    {busy[r.subject] ? 'Running' : 'Refresh'}
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

function SourceHealth({ status }) {
  const list = status?.sourceHealth ?? [];
  return (
    <Card>
      <CardHeader title="Source health" subtitle={!status ? 'Loading' : status.sourceHealthAt ? `From the latest completed run, ${when(status.sourceHealthAt)}` : 'No completed runs yet'} />
      <CardBody>
        {list.length ? (
          <ul className="space-y-1.5">
            {list.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-ink-600 dark:text-ink-300">{s.name}</span>
                <span className={clsx('flex shrink-0 items-center gap-1 font-mono', s.status === 'failed' ? 'text-loss-500' : s.status === 'disabled' ? 'text-ink-400' : 'text-profit-600 dark:text-profit-400')}>
                  {s.status === 'failed' ? <XCircle className="h-3.5 w-3.5" /> : s.status === 'disabled' ? null : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        ) : status ? (
          <p className="text-sm text-ink-400">Run research once to see the status of every source.</p>
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
      setMessage({ ok: true, text: 'Settings saved.' });
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
      <CardHeader title="Configuration" subtitle={canEdit ? 'Changes apply to the next research run.' : 'Read-only. Only a Super Admin can change research configuration.'} />
      <CardBody className="space-y-6">
        <div className="divide-y divide-ink-50 dark:divide-ink-800/60">
          <Toggle label="Fundamental Research enabled" hint="When off, traders see an unavailable notice; admins can still run research." checked={form.enabled} onChange={(v) => set('enabled', v)} disabled={!canEdit} />
          <Toggle label="AI-written narrative" hint="When off, reports use the deterministic rules narrative only." checked={form.aiNarrative} onChange={(v) => set('aiNarrative', v)} disabled={!canEdit} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Available to" value={form.availability} onChange={(e) => set('availability', e.target.value)} disabled={!canEdit}>
            <option value="all">All traders</option>
            <option value="premium">Premium and above</option>
          </Select>
          <Input label="Refresh every (hours)" type="number" min={1} max={168} value={form.refreshHours} onChange={(e) => set('refreshHours', e.target.value)} disabled={!canEdit} />
          <Input label="Refreshes per trader per day" type="number" min={0} value={form.userRefreshLimitPerDay} onChange={(e) => set('userRefreshLimitPerDay', e.target.value)} disabled={!canEdit} />
          <Input label="Catalyst horizon (days)" type="number" min={7} max={120} value={form.catalystHorizonDays} onChange={(e) => set('catalystHorizonDays', e.target.value)} disabled={!canEdit} />
        </div>
        <Input
          label="Narrative model (NVIDIA)"
          value={form.model}
          placeholder={cat.defaultModel}
          hint={`Leave blank to use the verified default (${cat.defaultModel}). ${data.integrations.nvidia ? 'Uses the NVIDIA key from Integrations.' : 'The NVIDIA integration is not configured, so reports use the rules narrative.'}`}
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
                  <span className="font-mono font-medium">{c.code}</span> <span className="text-ink-400">{c.coverage === 'full' ? 'full coverage' : 'core coverage'}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">Full coverage adds national statistics, market expectations, central bank statements and official event calendars. Core coverage uses IMF and BIS data only.</p>
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
          <p className="mt-1.5 text-xs text-ink-400">Both currencies of a pair must be enabled above.</p>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-ink-700 dark:text-ink-200">Research data sources</p>
          <div className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {Object.entries(cat.sources).map(([key, label]) => (
              <Toggle key={key} label={label} checked={form.sources[key] !== false} onChange={(v) => set('sources', { ...form.sources, [key]: v })} disabled={!canEdit} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">A disabled source is reported as DATA NOT AVAILABLE in every report and lowers confidence. API keys (NVIDIA, FRED, Massive) are managed in Integrations.</p>
        </div>

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving} icon={saving ? Loader2 : undefined}>{saving ? 'Saving' : 'Save configuration'}</Button>
            {message ? <span className={clsx('text-sm', message.ok ? 'text-profit-600' : 'text-loss-500')}>{message.text}</span> : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function CronCard({ settings, lastCronRunAt, canEdit, onRotated }) {
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rotate = async () => {
    if (settings.cron.configured && !window.confirm('Generate a new token? The current cron-job.org URL will stop working.')) return;
    setBusy(true);
    try {
      setIssued(await api.post('/admin/research/cron-token', {}));
      onRotated();
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(issued.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Card>
      <CardHeader
        title="Scheduled refresh (cron-job.org)"
        subtitle={settings.cron.configured ? `Token active (ends in ${settings.cron.tokenHint}). Last scheduled run: ${when(lastCronRunAt)}.` : 'Not configured. Reports refresh only when someone opens a stale report.'}
        action={<Badge tone={settings.cron.configured ? 'profit' : 'warning'}>{settings.cron.configured ? 'Active' : 'Not configured'}</Badge>}
      />
      <CardBody className="space-y-3 text-sm text-ink-600 dark:text-ink-300">
        <p>Each call refreshes up to {settings.cron.batchSize} of the stalest enabled pairs in the background and answers immediately, so it fits cron-job.org's free-tier request timeout.</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-500 dark:text-ink-400">
          <li>Generate a token below and copy the URL (it is shown only once).</li>
          <li>In cron-job.org, create a job with that URL, method GET, every 60 minutes.</li>
          <li>The job's history should show HTTP 202 responses; runs appear under Recent runs as "cron".</li>
        </ol>
        {issued ? (
          <div className="rounded-lg border border-accent-500/40 bg-accent-50 p-3 dark:bg-accent-900/20">
            <p className="mb-1 text-xs font-medium text-ink-800 dark:text-ink-100">Cron URL (copy it now; it will not be shown again)</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink-800 dark:text-ink-100">{issued.url}</code>
              <Button size="sm" variant="secondary" icon={copied ? CheckCircle2 : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-500">Alternatively, call /api/research/cron with the header "{issued.header.split(' ').slice(0, 2).join(' ')} …".</p>
          </div>
        ) : null}
        {canEdit ? (
          <Button variant="secondary" size="sm" icon={busy ? Loader2 : KeyRound} disabled={busy} onClick={rotate}>
            {settings.cron.configured ? 'Generate new token' : 'Generate token'}
          </Button>
        ) : (
          <p className="text-xs text-ink-400">Only a Super Admin can generate the cron token.</p>
        )}
      </CardBody>
    </Card>
  );
}

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
    if (!window.confirm('Delete this assessment? Reports will stop citing it on their next run.')) return;
    await api.delete(`/admin/research/assessments/${id}`);
    load();
  };
  return (
    <Card>
      <CardHeader
        title="Curated institutional assessments"
        subtitle="For assessments with no machine-readable source, such as IMF External Sector Report valuations or Article IV conclusions. Every entry must cite the original publication."
        action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>Add</Button>}
      />
      <CardBody>
        {!items ? (
          <p className="text-sm text-ink-400">Loading</p>
        ) : items.length ? (
          <ul className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {items.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink-800 dark:text-ink-100">
                    <span className="font-mono text-xs">{a.currency}</span> {a.title}
                    {a.classification ? <span className="ml-1.5 text-xs text-ink-400">{a.classification}</span> : null}
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
          <p className="text-sm text-ink-400">None recorded. Without a formal assessment, reports show "IMF FORMAL VALUATION: NOT AVAILABLE" and Kotka does not infer one.</p>
        )}
      </CardBody>
      <Modal open={open} onClose={() => setOpen(false)} title="Add institutional assessment" width="max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Currency" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {catalog.currencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </Select>
            <Select label="Factor" value={form.factor} onChange={(e) => set('factor', e.target.value)}>
              {catalog.assessmentFactors.map((f) => (
                <option key={f} value={f}>{f.replace('_', ' ')}</option>
              ))}
            </Select>
          </div>
          <Input label="Institution" value={form.institution} onChange={(e) => set('institution', e.target.value)} />
          <Input label="Title" placeholder="e.g. External Sector Report 2026: euro area assessment" value={form.title} onChange={(e) => set('title', e.target.value)} />
          {form.factor === 'valuation' ? (
            <Select label="Classification (exactly as assessed)" value={form.classification} onChange={(e) => set('classification', e.target.value)}>
              {catalog.valuationClasses.map((c) => (
                <option key={c} value={c}>{c}</option>
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
              <Input label="Source URL" type="url" placeholder="https://www.imf.org/..." value={form.url} onChange={(e) => set('url', e.target.value)} />
            </div>
            <Input label="Publication date" type="date" value={form.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />
          </div>
          {error ? <p className="text-sm text-loss-500">{error}</p> : null}
          <Button type="submit" disabled={saving}>{saving ? 'Saving' : 'Save assessment'}</Button>
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
      <CardHeader title="Recent runs" />
      <CardBody className="overflow-x-auto px-0">
        {!runs ? (
          <p className="px-5 text-sm text-ink-400">Loading</p>
        ) : runs.length ? (
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] text-ink-400 dark:border-ink-800">
                <th className="px-5 py-2 font-medium">Started</th>
                <th className="px-2 py-2 font-medium">Instrument</th>
                <th className="px-2 py-2 font-medium">Trigger</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Duration</th>
                <th className="px-5 py-2 font-medium">Unavailable sources</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-ink-50 align-top dark:border-ink-800/60">
                  <td className="px-5 py-2 text-ink-600 dark:text-ink-300">{when(r.startedAt)}</td>
                  <td className="px-2 py-2 font-mono text-ink-800 dark:text-ink-100">{r.subject}</td>
                  <td className="px-2 py-2 text-ink-600 dark:text-ink-300">{r.trigger}{r.user ? ` (${r.user.name})` : ''}</td>
                  <td className={clsx('px-2 py-2 font-medium', r.status === 'failed' ? 'text-loss-500' : r.status === 'running' ? 'text-amber-700 dark:text-amber-400' : 'text-profit-600 dark:text-profit-400')}>
                    {r.status}
                    {r.error ? <p className="font-normal text-loss-500">{r.error}</p> : null}
                  </td>
                  <td className="px-2 py-2 font-mono tabular-nums text-ink-600 dark:text-ink-300">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : 'n/a'}</td>
                  <td className="px-5 py-2 text-ink-500">{r.failedSources.length ? r.failedSources.map((s) => s.name).join('; ') : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 text-sm text-ink-400">No research runs yet.</p>
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
      <PageHeader eyebrow="Admin" title="Fundamental Research" description="Sources, coverage, refresh cadence and curated assessments for Kotka Fundamental Research." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <StatusCard status={status} onRefreshed={loadStatus} />
        </div>
        <SourceHealth status={status} />
      </div>
      <SettingsCard data={data} canEdit={canEdit} onSaved={() => { loadSettings(); loadStatus(); }} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CronCard settings={data.settings} lastCronRunAt={status?.lastCronRunAt} canEdit={canEdit} onRotated={loadSettings} />
        <AssessmentsCard catalog={data.catalog} />
      </div>
      <RunsCard />
    </div>
  );
}
