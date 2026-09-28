import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';

export default function Signup() {
  const { signup } = useAuth();
  const config = useAppConfig();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', newsletter: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(form);
      navigate(config.kycRequired ? '/verify' : '/app/dashboard');
    } catch (err) {
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

  return (
    <AuthLayout
      title="Create your account"
      subtitle={config.kycRequired ? 'Free to use. After this, a two-minute identity check and you are in.' : 'Free to use. Start building institutional discipline today.'}
    >
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-4">
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
          hint="We’ll send a link to confirm it."
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
          {loading ? 'Creating account…' : 'Create account'}
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
