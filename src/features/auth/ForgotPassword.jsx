import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll send a secure reset link to your email.">
      {sent ? (
        <div className="rounded-xl border border-profit-500/20 bg-profit-50 p-4 text-sm text-profit-600 dark:bg-profit-500/10 dark:text-profit-400">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Check your inbox
          </div>
          <p className="mt-1 text-ink-500 dark:text-ink-400">
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            name="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" className="w-full">
            Send reset link
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
