import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Card, { CardHeader, CardBody } from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import LoadError from '../components/LoadError';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/dialogs';

const local = (h) => new Date(Date.UTC(2026, 0, 5, h)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function UsageSettingsTab() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/usage/config').then(setConfig).catch((err) => setError(err.message));
  }, []);

  if (error) return <LoadError message={error} />;
  if (!config) return <div className="h-72 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const exempt = config.settings.staffExempt;

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api.put('/admin/usage/settings', { staffExempt: !exempt });
      setConfig((c) => ({ ...c, settings: r.settings }));
      toast(r.settings.staffExempt ? 'Staff aren’t held to limits.' : 'Staff now have the same limits as everyone.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Staff" action={config.canEditLimits ? null : <Badge tone="neutral">Only a Super Admin can change this</Badge>} />
        <CardBody>
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Admins and Super Admins aren’t held to usage limits</p>
              <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-ink-400">Their use is still recorded. Pausing a feature applies to staff too. To give one person different limits, use User usage.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={exempt}
              aria-label="Admins and Super Admins aren’t held to usage limits"
              disabled={busy || !config.canEditLimits}
              onClick={toggle}
              className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', exempt ? 'bg-ink-900 dark:bg-white' : 'bg-ink-200 dark:bg-ink-700')}
            >
              <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform dark:bg-ink-900', exempt ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="How usage is counted" subtitle="The server counts and enforces everything; the app only shows it." />
        <CardBody>
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            <li>
              Periods reset in UTC: each day at 00:00 UTC ({local(0)} your time), each week on Monday at 00:00 UTC, and each month on the 1st at 00:00 UTC.
            </li>
            <li>Kotka AI: every answered request counts once, whatever it looked up to answer. A chart reading is its own action, so it can have its own limit. An answer from a recent result costs nothing.</li>
            <li>Market Intelligence: each fresh load of prices, the calendar or a crypto overview counts once. Reloading the same view within 15 minutes counts once in total.</li>
            <li>Fundamental Research: only an update that actually runs counts. Reading a saved report is never limited.</li>
            <li>Nothing counts when a request is refused, when the provider or Kotka fails, or when nothing costly happened. A request that is interrupted part-way still counts, so it can’t be used to get free use.</li>
            <li>A retried request (same request key) isn’t counted twice.</li>
            <li>Rate limits are separate and stop bursts: Kotka AI chat and trade reviews allow 8 requests a minute, Community AI 15 every 10 minutes. Someone going too fast is told to slow down, not that they’ve reached a limit.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
