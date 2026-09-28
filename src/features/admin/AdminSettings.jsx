import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../lib/api';
import { CONTACT } from '../../lib/contact';

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{label}</p>
        {hint ? <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-ink-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-ink-900 dark:bg-white' : 'bg-ink-200 dark:bg-ink-700')}
      >
        <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform dark:bg-ink-900', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState({});
  const [state, setState] = useState(null);

  useEffect(() => {
    api
      .get('/admin/platform/settings')
      .then(({ settings, updatedAt, updatedBy, canEdit }) => {
        setSaved(settings);
        setDraft(settings);
        setMeta({ updatedAt, updatedBy, canEdit });
      })
      .catch((err) => setState({ error: err.message }));
  }, []);

  if (!draft) {
    return (
      <div>
        <PageHeader eyebrow="Admin" title="Platform Settings" />
        {state?.error ? <p className="text-sm text-loss-500">{state.error}</p> : <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />}
      </div>
    );
  }

  const set = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setState(null);
  };
  const dirty = Object.keys(draft).some((k) => draft[k] !== saved[k]);
  const disabled = !meta.canEdit;

  const save = async () => {
    setState({ saving: true });
    try {
      const res = await api.put('/admin/platform/settings', draft);
      setSaved(res.settings);
      setDraft(res.settings);
      setMeta((m) => ({ ...m, updatedAt: res.updatedAt, updatedBy: res.updatedBy }));
      setState({ ok: 'Saved. Changes take effect within a minute.' });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        eyebrow="Admin"
        title="Platform Settings"
        description="Switches that apply to every account. Each change is noted in the Audit Log."
      />

      <Card>
        <CardHeader title="Access" subtitle="Who can join and what they need to do first." />
        <CardBody className="divide-y divide-ink-100 dark:divide-ink-800">
          <Toggle
            label="Accept new sign-ups"
            hint="When off, the sign-up page says sign-ups are paused. Existing accounts are unaffected."
            checked={draft.signupsOpen}
            onChange={(v) => set('signupsOpen', v)}
            disabled={disabled}
          />
          <Toggle
            label="Require identity verification"
            hint="Traders must give their legal name, date of birth, country, phone and address before using Kotka. They keep access while it’s being reviewed. Staff don’t need to."
            checked={draft.kycRequired}
            onChange={(v) => set('kycRequired', v)}
            disabled={disabled}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Plans"
          subtitle="Everything is free while paid plans are off."
          action={<Badge tone={draft.paidPlansEnabled ? 'accent' : 'profit'}>{draft.paidPlansEnabled ? 'Paid plans on' : 'All features free'}</Badge>}
        />
        <CardBody className="space-y-5">
          <Toggle
            label="Turn on paid plans"
            hint="Free accounts get the lower Kotka AI limit below straight away, and features set to Premium (such as Fundamental Research, if you chose that) are limited to Premium accounts. No one is charged, as there’s no checkout yet. Leave this off until payments are ready."
            checked={draft.paidPlansEnabled}
            onChange={(v) => set('paidPlansEnabled', v)}
            disabled={disabled}
          />
          <div className="grid grid-cols-1 gap-4 border-t border-ink-100 pt-5 dark:border-ink-800 sm:grid-cols-2">
            <Input
              label="Daily Kotka AI limit (all traders)"
              type="number"
              min="0"
              max="10000"
              hint="Messages each trader can send per day. Resets at midnight UTC (1am in Lagos). 0 means no limit. Staff have no limit."
              value={draft.aiFairUseDailyLimit}
              onChange={(e) => set('aiFairUseDailyLimit', e.target.value === '' ? '' : Number(e.target.value))}
              disabled={disabled}
            />
            <Input
              label="Daily Kotka AI limit (free plan)"
              type="number"
              min="0"
              max="10000"
              hint={draft.paidPlansEnabled ? 'Messages per day on the free plan. Set it lower than the limit on the left to make a difference.' : 'Only applies once paid plans are on. Set it lower than the limit on the left to make a difference.'}
              value={draft.aiDailyLimitFree}
              onChange={(e) => set('aiDailyLimitFree', e.target.value === '' ? '' : Number(e.target.value))}
              disabled={disabled}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Support" subtitle="Where traders are sent for account help: the sign-in pages, the account menu, verification, account notices and replies to Kotka emails." />
        <CardBody>
          <div className="max-w-sm">
            <Input
              label="Support email"
              type="email"
              placeholder={CONTACT.support}
              hint={`Leave blank to use ${CONTACT.support}.`}
              value={draft.supportEmail}
              onChange={(e) => set('supportEmail', e.target.value)}
              disabled={disabled}
            />
          </div>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/95 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95 lg:-mx-8 lg:px-8">
        <p className="text-xs text-ink-400">
          {meta.updatedAt ? `Last changed ${new Date(meta.updatedAt).toLocaleString()}${meta.updatedBy ? ` by ${meta.updatedBy.name}` : ''}.` : 'Using defaults. Nothing has been changed yet.'}
          {disabled ? ' Only a Super Admin can change these.' : ''}
        </p>
        <div className="flex items-center gap-3">
          {state?.ok ? (
            <span className="flex items-center gap-1.5 text-xs text-profit-600 dark:text-profit-400"><CheckCircle2 className="h-3.5 w-3.5" />{state.ok}</span>
          ) : null}
          {state?.error ? (
            <span role="alert" className="flex items-center gap-1.5 text-xs text-loss-500"><AlertCircle className="h-3.5 w-3.5" />{state.error}</span>
          ) : null}
          {dirty ? <Button variant="ghost" size="sm" onClick={() => setDraft(saved)}>Discard</Button> : null}
          <Button size="sm" disabled={disabled || !dirty || state?.saving} onClick={save}>
            {state?.saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
