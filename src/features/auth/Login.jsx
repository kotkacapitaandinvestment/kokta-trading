import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(form);
      if (result?.mfaRequired) {
        setChallenge(result.challenge);
        setForm((f) => ({ ...f, password: '' }));
      } else navigate('/app/dashboard');
    } catch (err) {
      setError(err.message || 'Could not sign in. Check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyMfa({ challenge, code });
      navigate('/app/dashboard');
    } catch (err) {
      // An expired step goes back to the password.
      if (err.code === 'mfa_expired') {
        setChallenge(null);
        setCode('');
      }
      setError(err.message || 'That code didn’t work. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const errorBox = error ? (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  ) : null;

  if (challenge) {
    return (
      <AuthLayout title="Two-step verification" subtitle={useRecovery ? 'Enter one of the recovery codes you saved when you turned this on.' : 'Enter the 6-digit code from your authenticator app.'}>
        {errorBox}
        <form onSubmit={handleCode} className="space-y-4">
          <Input
            label={useRecovery ? 'Recovery code' : 'Code'}
            name="code"
            autoComplete="one-time-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123456'}
            maxLength={useRecovery ? 20 : 6}
            value={code}
            onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />
          <Button type="submit" className="w-full" icon={ShieldCheck} disabled={loading || (useRecovery ? code.trim().length < 12 : code.length !== 6)}>
            {loading ? 'Checking…' : 'Verify and sign in'}
          </Button>
        </form>
        <div className="mt-5 flex items-center justify-between text-xs">
          <button type="button" className="font-medium text-accent-600 hover:underline dark:text-accent-400" onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(null); }}>
            {useRecovery ? 'Use the app code instead' : 'Lost your phone? Use a recovery code'}
          </button>
          <button type="button" className="text-ink-500 hover:underline dark:text-ink-400" onClick={() => { setChallenge(null); setCode(''); setError(null); }}>
            Back
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue your trading process.">
      {errorBox}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <div className="flex items-center justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
        Don't have an account?{' '}
        <Link to="/signup" className="font-medium text-accent-600 hover:underline dark:text-accent-400">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
