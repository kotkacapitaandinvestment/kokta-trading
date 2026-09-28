import { useEffect, useState } from 'react';
import { Copy, LogOut, Monitor, ShieldCheck, ShieldOff } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { confirmDialog, toast } from '../../lib/dialogs';

const when = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Title({ title, description }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">{title}</h2>
      {description ? <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{description}</p> : null}
    </div>
  );
}

// Browsers signed in to this account, with a way to sign any of them out.
export function DevicesSection() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.get('/account/sessions').then((r) => setSessions(r.sessions)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const signOut = async (s) => {
    if (!(await confirmDialog({ title: `Sign out ${s.device}?`, message: 'That browser will need your password to get back in.', confirmLabel: 'Sign out' }))) return;
    try {
      await api.delete(`/account/sessions/${encodeURIComponent(s.id)}`);
      load();
    } catch (e) {
      toast(e.message, { tone: 'error' });
    }
  };
  const signOutOthers = async () => {
    if (!(await confirmDialog({ title: 'Sign out every other device?', message: 'Only this browser stays signed in. Use this if you signed in somewhere you don’t trust, or lost a device.', confirmLabel: 'Sign out others', danger: true }))) return;
    try {
      const r = await api.post('/account/sessions/revoke-others', {});
      toast(r.signedOut ? `Signed out ${r.signedOut} other device${r.signedOut === 1 ? '' : 's'}.` : 'No other devices were signed in.');
      load();
    } catch (e) {
      toast(e.message, { tone: 'error' });
    }
  };

  const others = (sessions ?? []).filter((s) => !s.current).length;
  return (
    <section className="max-w-xl">
      <Title title="Signed-in devices" description="Where your account is signed in right now. Changing your password also signs out every other device." />
      {error ? <p className="text-sm text-loss-500">{error}</p> : null}
      {!sessions && !error ? <div className="h-20 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
        {(sessions ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <Monitor className="h-4 w-4 shrink-0 text-ink-400" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-800 dark:text-ink-100">
                {s.device}
                {s.current ? <Badge tone="profit">This device</Badge> : null}
              </p>
              <p className="text-xs text-ink-400">Signed in {when(s.createdAt)} · last active {when(s.lastSeenAt)}</p>
            </div>
            {!s.current ? (
              <Button size="sm" variant="ghost" onClick={() => signOut(s)}>
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {others ? (
        <Button size="sm" variant="secondary" icon={LogOut} className="mt-3" onClick={signOutOthers}>
          Sign out all other devices
        </Button>
      ) : null}
    </section>
  );
}

// Two-step verification with an authenticator app.
export function TwoStepSection() {
  const { user, patchUser } = useAuth();
  const [step, setStep] = useState('idle'); // idle | password | scan | codes | disable
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [state, setState] = useState(null);
  const enabled = !!user?.mfaEnabled;
  const staff = ['admin', 'super_admin', 'moderator'].includes(user?.role);

  const reset = () => {
    setStep('idle');
    setPassword('');
    setCode('');
    setSetup(null);
    setState(null);
  };
  const run = async (fn) => {
    setState({ busy: true });
    try {
      await fn();
      setState(null);
    } catch (e) {
      setState({ error: e.message });
    }
  };

  const start = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api.post('/account/mfa/setup', { password });
      setSetup(r);
      setPassword('');
      setStep('scan');
    });
  };
  const confirm = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api.post('/account/mfa/enable', { code });
      setCodes(r.recoveryCodes);
      setCode('');
      setStep('codes');
      patchUser({ mfaEnabled: true });
    });
  };
  const turnOff = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/account/mfa/disable', { password, code });
      patchUser({ mfaEnabled: false });
      reset();
      toast('Two-step verification is off.');
    });
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast('Copied.'));

  return (
    <section className="max-w-xl">
      <Title
        title="Two-step verification"
        description="After your password, Kotka also asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy or 1Password). Someone who learns your password still can’t get in."
      />
      <div className="mb-4 flex items-center gap-2">
        {enabled ? <Badge tone="profit">On</Badge> : <Badge tone={staff ? 'warning' : 'neutral'}>Off</Badge>}
        {!enabled && staff ? <span className="text-xs text-amber-700 dark:text-amber-400">Strongly recommended for staff accounts.</span> : null}
      </div>

      {step === 'idle' ? (
        enabled ? (
          <Button size="sm" variant="ghost" icon={ShieldOff} onClick={() => setStep('disable')}>Turn off two-step verification</Button>
        ) : (
          <Button size="sm" icon={ShieldCheck} onClick={() => setStep('password')}>Set up two-step verification</Button>
        )
      ) : null}

      {step === 'password' ? (
        <form onSubmit={start} className="space-y-3">
          <Input label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={state?.busy || !password}>Continue</Button>
            <Button size="sm" variant="ghost" type="button" onClick={reset}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {step === 'scan' && setup ? (
        <form onSubmit={confirm} className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-600 dark:text-ink-300">
            <li>
              In your authenticator app, add an account and choose to enter a setup key. On your phone you can also{' '}
              <a href={setup.uri} className="font-medium text-accent-700 underline dark:text-accent-300">open it in the app directly</a>.
            </li>
            <li>
              Enter this key (account: your email, type: time-based):
              <span className="mt-1.5 flex items-center gap-2">
                <code className="break-all rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-sm tracking-wider text-ink-900 dark:bg-ink-800 dark:text-ink-50">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                <button type="button" onClick={() => copy(setup.secret)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Copy setup key"><Copy className="h-4 w-4" /></button>
              </span>
            </li>
            <li>Type the 6-digit code the app now shows.</li>
          </ol>
          <Input label="Code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={state?.busy || code.length !== 6}>Turn on</Button>
            <Button size="sm" variant="ghost" type="button" onClick={reset}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {step === 'codes' && codes ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Two-step verification is on. Save these recovery codes somewhere safe (a password manager is ideal). Each works once if you lose your phone. They won’t be shown again.
          </p>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-ink-100 p-3 font-mono text-sm text-ink-800 dark:border-ink-800 dark:text-ink-100">
            {codes.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(codes.join('\n'))}>Copy codes</Button>
            <Button size="sm" onClick={() => { setCodes(null); reset(); }}>I’ve saved them</Button>
          </div>
        </div>
      ) : null}

      {step === 'disable' ? (
        <form onSubmit={turnOff} className="space-y-3">
          <Input label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <Input label="Code from the app, or a recovery code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} required />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" type="submit" disabled={state?.busy || !password || code.length < 6}>Turn off</Button>
            <Button size="sm" variant="ghost" type="button" onClick={reset}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {state?.error ? <p role="alert" className="mt-3 text-sm text-loss-500">{state.error}</p> : null}
    </section>
  );
}
