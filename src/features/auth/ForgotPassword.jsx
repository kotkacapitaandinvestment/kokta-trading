import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import { useAppConfig } from '../../context/AppConfigContext';

// Kotka has no email provider yet, so there is no self-serve reset link.
// Say so plainly instead of pretending one was sent.
export default function ForgotPassword() {
  const { supportEmail } = useAppConfig();

  return (
    <AuthLayout title="Forgot your password?" subtitle="Self-serve reset by email is not available yet.">
      <div className="rounded-xl border border-ink-100 bg-ink-50 p-4 text-sm text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300">
        <div className="flex items-center gap-2 font-medium text-ink-800 dark:text-ink-100">
          <LifeBuoy className="h-4 w-4 text-accent-600 dark:text-accent-400" /> Contact support
        </div>
        <p className="mt-1.5 leading-relaxed">
          {supportEmail ? (
            <>
              Email{' '}
              <a href={`mailto:${supportEmail}?subject=Password%20reset`} className="font-medium text-accent-600 hover:underline dark:text-accent-400">
                {supportEmail}
              </a>{' '}
              from the address you signed up with and we will help you get back in.
            </>
          ) : (
            'Contact the Kotka team from the address you signed up with and we will help you get back in.'
          )}
        </p>
        <p className="mt-2 text-xs text-ink-400">If you are still signed in on another device, you can change your password in Settings.</p>
      </div>

      <p className="mt-8 text-center text-sm text-ink-500 dark:text-ink-400">
        <Link to="/login" className="font-medium text-accent-600 hover:underline dark:text-accent-400">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
