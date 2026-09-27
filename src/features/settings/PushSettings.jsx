import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { BellRing, Download, Loader2, Share, Smartphone, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';
import { disablePush, enablePush, useInstallPrompt, usePushState } from '../../lib/pwa';

const PUSH_KINDS = [
  ['messages', 'Direct and group messages'],
  ['mentions', 'Mentions'],
  ['replies', 'Replies to you'],
  ['ideas', 'Trade ideas you follow'],
  ['events', 'Event reminders'],
  ['markets', 'Unusual moves in your markets'],
  ['announcements', 'Announcements from Kotka'],
  ['achievements', 'Goal Room achievements'],
  ['follows', 'New followers'],
  ['activity', 'Reactions, comments and poll votes'],
  ['news', 'Central-bank releases'],
];

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40', checked ? 'bg-ink-900 dark:bg-white' : 'bg-ink-200 dark:bg-ink-700')}
    >
      <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform dark:bg-ink-900', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function StatusLine({ push, busy, onEnable, onDisable, onTest, test }) {
  const { support, subscribed } = push;
  if (support === 'needs-install') {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        On iPhone and iPad, push works from the Home Screen app. In Safari tap <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" />, then <span className="font-medium text-ink-700 dark:text-ink-200">Add to Home Screen</span>, open Kotka from there and come back here.
      </p>
    );
  }
  if (support === 'unsupported') return <p className="text-sm text-ink-500 dark:text-ink-400">This browser doesn't support push notifications. Chrome, Edge, Firefox and Safari 16.4+ do.</p>;
  if (support === 'denied') return <p className="text-sm text-ink-500 dark:text-ink-400">Notifications are blocked for Kotka in this browser. Allow them in the site settings (the icon left of the address), then reload.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {subscribed ? (
        <>
          <Button size="sm" variant="secondary" onClick={onTest} disabled={busy}>Send a test</Button>
          <Button size="sm" variant="ghost" onClick={onDisable} disabled={busy}>Turn off here</Button>
        </>
      ) : (
        <Button size="sm" onClick={onEnable} disabled={busy || !push.ready} icon={busy ? Loader2 : BellRing} className={busy ? '[&>svg]:animate-spin' : undefined}>
          Turn on for this device
        </Button>
      )}
      {test ? <span className={clsx('text-xs', test.error ? 'text-loss-500' : 'text-ink-500 dark:text-ink-400')}>{test.error ?? test.message}</span> : null}
    </div>
  );
}

export default function PushSettings() {
  const push = usePushState();
  const installer = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null);
  const [devices, setDevices] = useState(null);
  const [prefs, setPrefs] = useState(null);

  const loadDevices = () => api.get('/push/devices').then((r) => setDevices(r.devices)).catch(() => setDevices([]));
  useEffect(() => {
    loadDevices();
    api.get('/community/me').then((r) => setPrefs(r.prefs?.push ?? null)).catch(() => {});
  }, [push.subscribed]);

  const run = async (fn) => {
    setBusy(true);
    setTest(null);
    try {
      await fn();
    } catch (err) {
      setTest({ error: err.message });
    } finally {
      setBusy(false);
      loadDevices();
    }
  };
  const sendTest = () =>
    run(async () => {
      const r = await api.post('/push/test', {});
      setTest({ message: r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It should arrive in a few seconds.` : 'The test didn’t go through. Turn notifications off and on again for this device.' });
    });
  const removeDevice = async (id) => {
    await api.post('/push/unsubscribe', { id }).catch(() => {});
    loadDevices();
  };
  const setKind = (k, v) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    api.put('/community/me/preferences', { push: { [k]: v } }).catch(() => {});
  };

  const others = (devices ?? []).filter((d) => d.endpoint !== push.endpoint);

  return (
    <div className="mb-8 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">Push notifications</h3>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Alerts on your phone or computer when Kotka is closed. Nothing is sent while you have Kotka open in front of you.</p>
      </div>

      <div className="rounded-xl border border-ink-100 p-4 dark:border-ink-800">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-800 dark:text-ink-100">
          <Smartphone className="h-4 w-4 text-ink-400" /> This device
          {push.subscribed ? <span className="rounded-full bg-profit-500/10 px-2 py-0.5 text-[11px] font-medium text-profit-600 dark:text-profit-400">On</span> : null}
        </div>
        <StatusLine push={push} busy={busy} test={test} onEnable={() => run(enablePush)} onDisable={() => run(disablePush)} onTest={sendTest} />
        {others.length ? (
          <div className="mt-4 border-t border-ink-100 pt-3 dark:border-ink-800">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-ink-400">Other devices</p>
            <ul className="space-y-1">
              {others.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 text-sm text-ink-600 dark:text-ink-300">
                  <span className="min-w-0 truncate">{d.name} <span className="text-xs text-ink-400">· since {new Date(d.createdAt).toLocaleDateString()}</span></span>
                  <button type="button" onClick={() => removeDevice(d.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800" aria-label={`Stop push to ${d.name}`}><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {installer.canInstall ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-ink-200 px-4 py-3 dark:border-ink-700">
          <p className="text-sm text-ink-600 dark:text-ink-300">Install Kotka as an app: its own window, a home-screen icon and faster start.</p>
          <Button size="sm" variant="secondary" icon={Download} onClick={installer.install}>Install</Button>
        </div>
      ) : null}

      {prefs ? (
        <div>
          <p className="mb-1 text-sm font-medium text-ink-700 dark:text-ink-200">What reaches your devices</p>
          <p className="mb-2 text-xs text-ink-400">Applies to every device with push on. Items switched off under Community never send a push.</p>
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {PUSH_KINDS.map(([k, label]) => (
              <li key={k} className="flex items-center justify-between gap-4 border-b border-ink-100 py-2.5 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">
                {label}
                <Switch checked={prefs[k] !== false} onChange={(v) => setKind(k, v)} label={label} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
