import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// The page the confirmation email links to: /verify-email?token=...
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, patchUser } = useAuth();
  const [state, setState] = useState( { busy: true } );
  const ran = useRef( false );

  useEffect( () => {
    if ( ran.current ) return;
    ran.current = true;
    api
      .post( '/auth/verify-email', { token: params.get( 'token' ) ?? '' } )
      .then( () => {
        setState( { ok: true } );
        patchUser( { emailVerified: true } );
      } )
      .catch( ( err ) => setState( { error: err.message } ) );
  }, [params, patchUser] );

  const next = user ? '/app/dashboard' : '/login';
  if ( state.busy ) return <AuthLayout title="Confirming your email" subtitle="One moment…" />;
  if ( state.ok ) {
    return (
      <AuthLayout title="Email confirmed" subtitle="Thanks. We’ll use this address for your account and to help you back in if you forget your password.">
        <div className="flex items-center gap-2 text-sm text-profit-600 dark:text-profit-400"><CheckCircle2 className="h-4 w-4" /> All set.</div>
        <Link to={next} className="mt-5 inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-sm font-medium text-white dark:bg-accent-500 dark:text-ink-950">{user ? 'Go to your dashboard' : 'Sign in'}</Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="This link didn’t work" subtitle={state.error}>
      <Link to={user ? '/app/settings?section=notifications' : '/login'} className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-sm font-medium text-white dark:bg-accent-500 dark:text-ink-950">{user ? 'Send a new link from Settings' : 'Sign in to send a new link'}</Link>
    </AuthLayout>
  );
}

