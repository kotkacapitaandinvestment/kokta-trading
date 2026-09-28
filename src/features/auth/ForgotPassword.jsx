import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, MailCheck } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';

// Emails a single-use reset link. The reply is the same whether or not the
// address has an account, so this page can't be used to find out who does.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const r = await api.post('/auth/password-reset', { email });
      setState({ sent: r.message });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter the email you signed up with and we’ll send you a link to choose a new one.">
      {state?.sent ? (
        <div role="status" className="rounded-xl border border-profit-500/20 bg-profit-50 p-4 text-sm text-profit-700 dark:bg-profit-500/10 dark:text-profit-400">
          <div className="flex items-center gap-2 font-medium">
            <MailCheck className="h-4 w-4" /> Check your email
          </div>
          <p className="mt-1.5 leading-relaxed">{state.sent}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {state?.error ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : null}
          <Input label="Email" type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Button type="submit" className="w-full" disabled={state?.busy || !email}>
            {state?.busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-ink-500 dark:text-ink-400">
        <Link to="/login" className="font-medium text-accent-600 hover:underline dark:text-accent-400">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
