import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';

// The page the reset email links to: /reset-password?token=...
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [valid, setValid] = useState(null);
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [state, setState] = useState(null);
  const mismatch = form.confirm && form.password !== form.confirm;

  useEffect(() => {
    api.get(`/auth/password-reset/check?token=${encodeURIComponent(token)}`).then((r) => setValid(r.valid)).catch(() => setValid(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch) return;
    setState({ busy: true });
    try {
      const r = await api.post('/auth/password-reset/confirm', { token, password: form.password });
      setState({ done: r.message });
    } catch (err) {
      if (err.code === 'link_expired') setValid(false);
      setState({ error: err.message });
    }
  };

  if (valid === null) return <AuthLayout title="Choose a new password" subtitle="Checking your link…" />;

  if (!valid && !state?.done) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work once, for 30 minutes. Ask for a new one and use the newest email.">
        <Link to="/forgot-password" className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-sm font-medium text-white dark:bg-accent-500 dark:text-ink-950">Send a new link</Link>
      </AuthLayout>
    );
  }

  if (state?.done) {
    return (
      <AuthLayout title="Password changed" subtitle={state.done}>
        <div className="flex items-center gap-2 text-sm text-profit-600 dark:text-profit-400"><CheckCircle2 className="h-4 w-4" /> You can sign in now.</div>
        <Link to="/login" className="mt-5 inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-sm font-medium text-white dark:bg-accent-500 dark:text-ink-950">Sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Changing it signs you out on every other device.">
      {state?.error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      <form onSubmit={submit} className="space-y-4">
        <Input label="New password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="At least 8 characters. A few unrelated words together work well." minLength={8} required autoFocus />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={mismatch ? 'Passwords don’t match.' : undefined} required />
        <Button type="submit" className="w-full" disabled={state?.busy || form.password.length < 8 || mismatch || !form.confirm}>
          {state?.busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
