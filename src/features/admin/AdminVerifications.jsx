import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, BadgeCheck, Check, Clock3, Eye, Search, ShieldCheck, UserX, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';

const TABS = [
  { value: 'pending', label: 'In review' },
  { value: 'rejected', label: 'Needs changes' },
  { value: 'approved', label: 'Verified' },
  { value: 'all', label: 'All' },
];
const statusTone = { pending: 'warning', approved: 'profit', rejected: 'loss' };
const statusLabel = { pending: 'In review', approved: 'Verified', rejected: 'Needs changes' };

function ago(date) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ageFrom(dob) {
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

function Field({ label, children, mono }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className={clsx('mt-0.5 text-sm text-ink-800 dark:text-ink-100', mono && 'font-mono tabular-nums')}>{children || 'Not given'}</dd>
    </div>
  );
}

function Detail({ id, onDecided }) {
  const [kyc, setKyc] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setKyc(null);
    setError(null);
    setNote('');
    setRejecting(false);
    api.get(`/admin/kyc/${id}`).then(({ kyc }) => setKyc(kyc)).catch((err) => setError(err.message));
  }, [id]);

  const decide = async (decision) => {
    setBusy(true);
    setError(null);
    try {
      const { kyc: updated } = await api.post(`/admin/kyc/${id}/decision`, { decision, note: decision === 'rejected' ? note : undefined, submittedAt: kyc.submittedAt });
      setKyc((prev) => ({ ...prev, ...updated }));
      onDecided(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !kyc) return <p className="flex items-center gap-2 p-6 text-sm text-loss-500"><AlertCircle className="h-4 w-4" />{error}</p>;
  if (!kyc) return <div className="m-6 h-72 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />;

  const d = kyc.details;
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink-900 dark:text-ink-50">{d ? [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') : kyc.user.name}</h2>
          <p className="text-xs text-ink-400">
            Account: {kyc.user.name} · {kyc.user.email}
          </p>
        </div>
        <Badge tone={statusTone[kyc.status]}>{statusLabel[kyc.status]}</Badge>
      </div>

      {d ? (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink-100 pt-5 dark:border-ink-800">
          <Field label="Date of birth" mono>{d.dateOfBirth} <span className="text-ink-400">({ageFrom(d.dateOfBirth)})</span></Field>
          <Field label="Country">{kyc.countryName}</Field>
          <Field label="Phone" mono>{d.phone}</Field>
          <Field label="Submitted">{new Date(kyc.submittedAt).toLocaleString()}</Field>
          <div className="col-span-2">
            <Field label="Address">
              {[d.address?.line1, d.address?.line2].filter(Boolean).join(', ')}
              <br />
              {[d.address?.city, d.address?.region, d.address?.postalCode].filter(Boolean).join(', ')}
            </Field>
          </div>
        </dl>
      ) : (
        <p className="mt-6 text-sm text-loss-500">We can’t open these details. Use Request changes to ask the trader to submit them again.</p>
      )}

      {kyc.reviewedAt ? (
        <p className="mt-5 text-xs text-ink-400">
          {{ approved: 'Verified', rejected: 'Sent back' }[kyc.status] ?? statusLabel[kyc.status]} on {new Date(kyc.reviewedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          {kyc.reviewer ? ` by ${kyc.reviewer.name}` : ''}
          {kyc.reviewNote ? <span className="mt-1 block text-ink-500 dark:text-ink-300">Note to trader: {kyc.reviewNote}</span> : null}
        </p>
      ) : null}

      <p className="mt-5 flex items-center gap-1.5 text-[11px] text-ink-400">
        <Eye className="h-3 w-3" /> Kotka noted in the Audit Log that you opened this.
      </p>

      {error ? <p role="alert" className="mt-4 text-sm text-loss-500">{error}</p> : null}

      {kyc.status !== 'approved' || rejecting ? (
        <div className="mt-6 border-t border-ink-100 pt-5 dark:border-ink-800">
          {rejecting ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">What should the trader fix?</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="For example: the date of birth looks wrong, please check it."
                  className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
                />
                <span className="mt-1 block text-xs text-ink-400">Shown to the trader. Their access is paused until they resubmit.</span>
              </label>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" disabled={busy || !note.trim()} onClick={() => decide('rejected')}>Send back</Button>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Check} disabled={busy || !d} onClick={() => decide('approved')}>Approve</Button>
              {kyc.status !== 'rejected' ? (
                <Button size="sm" variant="secondary" icon={X} disabled={busy} onClick={() => setRejecting(true)}>Request changes</Button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 border-t border-ink-100 pt-5 dark:border-ink-800">
          <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>Revoke and request changes</Button>
          <p className="mt-1.5 text-xs text-ink-400">Their access is paused until they submit their details again.</p>
        </div>
      )}
    </div>
  );
}

export default function AdminVerifications() {
  const [tab, setTab] = useState('pending');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('status', tab);
    if (query.trim()) params.set('q', query.trim());
    return api
      .get(`/admin/kyc?${params}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [tab, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const onDecided = (updated) => {
    load();
    setSelected(updated.id);
  };

  const counts = data?.counts;

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Verifications"
        description="Review the identity details traders submit. Traders keep full access while their details are in review."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'In review', value: counts?.pending, icon: Clock3, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'Needs changes', value: counts?.rejected, icon: AlertCircle, tone: 'text-loss-500' },
          { label: 'Verified', value: counts?.approved, icon: BadgeCheck, tone: 'text-profit-600 dark:text-profit-400' },
          { label: 'Not submitted', value: counts?.notSubmitted, icon: UserX, tone: 'text-ink-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
            <p className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              <s.icon className={clsx('h-3.5 w-3.5', s.tone)} />
              {s.label}
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{s.value ?? '-'}</p>
          </div>
        ))}
      </div>

      {error ? <p role="alert" className="mb-4 text-sm text-loss-500">{error}</p> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className={clsx('overflow-hidden lg:col-span-5', selected && 'order-2 lg:order-none')}>
          <div className="space-y-3 border-b border-ink-100 p-3 dark:border-ink-800">
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-ink-50 p-1 dark:bg-ink-800">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={clsx(
                    'shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    tab === t.value ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100',
                  )}
                >
                  {t.label}
                  {t.value !== 'all' && counts?.[t.value] ? <span className="ml-1 tabular-nums text-ink-400">{counts[t.value]}</span> : null}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email"
                className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
              />
            </div>
          </div>
          {!data ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-ink-50 dark:bg-ink-800" />)}
            </div>
          ) : data.profiles.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={ShieldCheck} title={tab === 'pending' ? 'Nothing waiting for review' : 'No verifications here'} description={tab === 'pending' ? 'New submissions appear here as traders sign up.' : undefined} />
            </div>
          ) : (
            <ul className="max-h-[36rem] divide-y divide-ink-100 overflow-y-auto scrollbar-thin dark:divide-ink-800">
              {data.profiles.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelected(p.id)}
                    aria-current={selected === p.id ? 'true' : undefined}
                    className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', selected === p.id ? 'bg-accent-50 dark:bg-accent-900/20' : 'hover:bg-ink-50 dark:hover:bg-ink-800/50')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">{p.user.name}</p>
                      <p className="truncate text-xs text-ink-400">{p.user.email} · {p.countryName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {tab === 'all' ? <Badge tone={statusTone[p.status]} className="!px-2 !py-0.5 !text-[10px]">{statusLabel[p.status]}</Badge> : null}
                      <p className="mt-0.5 text-[11px] tabular-nums text-ink-400">{ago(p.submittedAt)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-7 lg:self-start">
          {selected ? (
            <Detail id={selected} onDecided={onDecided} />
          ) : (
            <div className="p-6">
              <EmptyState icon={Eye} title="Select a submission" description="Personal details stay hidden until you open a record, and each view is noted in the Audit Log." />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
