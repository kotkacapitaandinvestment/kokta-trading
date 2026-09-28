import { useState } from 'react';
import { CheckCircle2, MailWarning } from 'lucide-react';
import Button from '../../components/ui/Button';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/dialogs';

// Email address status and the optional newsletter. Account and security
// emails (password resets, sign-in alerts) always go out; they can't be
// switched off, because they protect the account.
export default function EmailSettings() {
  const { user, patchUser } = useAuth();
  const [busy, setBusy] = useState(null);

  const resend = async () => {
    setBusy('verify');
    try {
      const r = await api.post('/account/verify-email/resend', {});
      if (r.alreadyVerified) patchUser({ emailVerified: true });
      toast(r.alreadyVerified ? 'Your email is already confirmed.' : `We’ve sent a new link to ${user.email}.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const setNewsletter = async (optIn) => {
    setBusy('news');
    try {
      const r = await api.put('/account/newsletter', { optIn });
      patchUser({ newsletter: r.user.newsletter });
      toast(optIn ? 'You’ll get Kotka news and product updates.' : 'You won’t get the newsletter any more.');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">Email</h2>
      <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Account and security emails (password resets, new sign-in alerts) always come from no-reply@kotkafinance.online.</p>
      <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 dark:divide-ink-800 dark:border-ink-800">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">{user?.email}</p>
            {user?.emailVerified ? (
              <p className="flex items-center gap-1 text-xs text-profit-600 dark:text-profit-400"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmed</p>
            ) : (
              <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><MailWarning className="h-3.5 w-3.5" /> Not confirmed yet.</p>
            )}
          </div>
          {!user?.emailVerified ? (
            <Button size="sm" variant="secondary" disabled={busy === 'verify'} onClick={resend}>{busy === 'verify' ? 'Sending…' : 'Send confirmation link'}</Button>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-800 dark:text-ink-100">Kotka news and product updates</p>
            <p className="text-xs text-ink-400">An occasional email about new features. Unsubscribe any time.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!user?.newsletter}
            aria-label="Kotka news and product updates"
            disabled={busy === 'news'}
            onClick={() => setNewsletter(!user?.newsletter)}
            className={`h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${user?.newsletter ? 'bg-accent-500' : 'bg-ink-200 dark:bg-ink-700'}`}
          >
            <span className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${user?.newsletter ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
