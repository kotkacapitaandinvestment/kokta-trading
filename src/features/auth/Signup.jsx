import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, MailCheck } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';

const RESEND_AFTER_S = 30;

// Two steps: your details, then the 6-digit code emailed to you. The account
// is only made with the code, which also confirms the email address.
export default function Signup() {
  const { startSignup, signup } = useAuth();
  const config = useAppConfig();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', newsletter: false });
  const [step, setStep] = useState('details');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (step !== 'code') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);
  const waitS = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));

  const sendCode = async () => {
    setError(null);
    setLoading(true);
    try {
      await startSignup(form);
      setSentAt(Date.now());
      setNow(Date.now());
      setStep('code');
    } catch (err) {
      setError(err.message || 'We couldn’t send the code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup({ ...form, code });
      navigate(config.kycRequired ? '/verify' : '/app/dashboard');
    } catch (err) {
      // A problem with the details (not the code) sends you back to fix them.
      if (err.data?.field && err.data.field !== 'code') setStep('details');
      setError(err.message || 'Could not create your account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (config.loaded && !config.signupsOpen) {
    return (
      <AuthLayout title="Sign-ups are paused" subtitle="We're not accepting new accounts right now. Please check back soon.">
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-600 hover:underline dark:text-accent-400">
            Sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const errorBox = error ? (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  ) : null;

  if (step === 'code') {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a 6-digit code to ${form.email}. It works for 15 minutes.`}>
        {errorBox}
        <form onSubmit={createAccount} className="space-y-4">
          <Input
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            hint="Can’t find it? Check your spam folder. If this email already has a Kotka account, we’ll have emailed you a sign-in link instead."
            autoFocus
            required
          />
          <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" onClick={() => { setStep('details'); setCode(''); setError(null); }} className="font-medium text-ink-600 hover:underline dark:text-ink-300">
            Use a different email
          </button>
          <button type="button" onClick={sendCode} disabled={loading || waitS > 0} className="inline-flex items-center gap-1.5 font-medium text-accent-600 hover:underline disabled:cursor-default disabled:text-ink-400 disabled:no-underline dark:text-accent-400">
            <MailCheck className="h-4 w-4" />
            {waitS > 0 ? `Send a new code in ${waitS}s` : 'Send a new code'}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={config.kycRequired ? 'Free to use. After this, a two-minute identity check and you are in.' : 'Free to use. Start building institutional discipline today.'}
    >
      {errorBox}
      <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} className="space-y-4">
        <Input
          label="Full name"
          name="name"
          placeholder="Alex Morgan"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          label="Email"
          type="email"
          name="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          hint="We’ll email you a 6-digit code to confirm it."
          required
        />
        <Input
          label="Password"
          type="password"
          name="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          hint="A few unrelated words together are easy to remember and hard to guess."
          minLength={8}
          required
        />
        <label className="flex items-start gap-2.5 text-sm text-ink-600 dark:text-ink-300">
          <input type="checkbox" checked={form.newsletter} onChange={(e) => setForm({ ...form, newsletter: e.target.checked })} className="mt-0.5 h-4 w-4 rounded accent-ink-900" />
          <span>Send me Kotka news and product updates by email. You can stop them any time in Settings.</span>
        </label>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending code…' : 'Continue'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent-600 hover:underline dark:text-accent-400">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
