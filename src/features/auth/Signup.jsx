import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';

export default function Signup() {
  const { signup, loginWithProvider } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await signup(form);
    setLoading(false);
    navigate('/app/dashboard');
  };

  const handleProvider = async (provider) => {
    setLoading(true);
    await loginWithProvider(provider);
    setLoading(false);
    navigate('/app/dashboard');
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start building institutional discipline today.">
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
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Input
          label="Password"
          type="password"
          name="password"
          placeholder="Minimum 8 characters"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          minLength={8}
          required
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-ink-100 dark:bg-ink-800" />
        <span className="text-xs text-ink-400">or continue with</span>
        <div className="h-px flex-1 bg-ink-100 dark:bg-ink-800" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => handleProvider('google')} disabled={loading}>
          Google
        </Button>
        <Button variant="secondary" onClick={() => handleProvider('apple')} disabled={loading}>
          Apple
        </Button>
      </div>

      <p className="mt-8 text-center text-sm text-ink-500 dark:text-ink-400">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent-600 hover:underline dark:text-accent-400">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
