import { useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import { api } from '../../../lib/api';
import { useCommunity } from '../CommunityContext';
import { INSTRUMENT_OPTIONS, display } from '../components/inputs';

export default function Onboarding() {
  const { suggestedUsername, profile, refresh } = useCommunity();
  const [username, setUsername] = useState(suggestedUsername ?? '');
  const [headline, setHeadline] = useState('');
  const [markets, setMarkets] = useState(['EURUSD', 'XAUUSD']);
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState(null);
  const toggle = (s) => setMarkets((m) => (m.includes(s) ? m.filter((x) => x !== s) : [...m, s]));
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      await api.put('/community/me/profile', { username, headline, followMarkets: markets });
      await refresh();
    } catch (err) {
      setState({ error: err.message, field: err.data?.field });
    }
  };
  return (
    <div className="mx-auto max-w-2xl py-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-400">Kotka Community</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">Where traders work out what the market is doing.</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">Market rooms, trade ideas you can challenge, official events and private conversations. Set up your public identity first.</p>
      <form onSubmit={submit} className="mt-8 space-y-6 rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-800 dark:text-ink-100">Username</span>
          <div className="flex items-center rounded-lg border border-ink-200 bg-white focus-within:border-accent-500 dark:border-ink-700 dark:bg-ink-800">
            <span className="pl-3 text-sm text-ink-400">@</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={20} required className="h-10 flex-1 bg-transparent px-1 text-sm text-ink-900 outline-none dark:text-ink-50" />
          </div>
          <span className={clsx('mt-1 block text-xs', state?.field === 'username' ? 'text-loss-500' : 'text-ink-400')}>{state?.field === 'username' ? state.error : '3 to 20 characters. This is how others mention you.'}</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-800 dark:text-ink-100">Headline <span className="font-normal text-ink-400">(optional)</span></span>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} placeholder="e.g. Discretionary trader · Forex · Macro" className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
          {state?.field === 'headline' ? <span className="mt-1 block text-xs text-loss-500">{state.error}</span> : null}
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-800 dark:text-ink-100">Markets to follow</legend>
          <div className="space-y-2">
            {INSTRUMENT_OPTIONS.map(([group, list]) => (
              <div key={group} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 text-xs text-ink-400">{group}</span>
                {list.map((s) => (
                  <button key={s} type="button" aria-pressed={markets.includes(s)} onClick={() => toggle(s)} className={clsx('rounded-lg px-2.5 py-1 font-mono text-xs', markets.includes(s) ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'bg-ink-50 text-ink-600 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-300')}>{display(s)}</button>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2.5 text-sm text-ink-600 dark:text-ink-300">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-accent-600" />
          <span>I'll follow the <Link to="/app/community/guidelines" target="_blank" className="font-medium text-accent-700 underline dark:text-accent-300">Community Guidelines</Link>: debate ideas not people, no scams, no guaranteed-return claims, no impersonation.</span>
        </label>
        {state?.error && !state.field ? <p role="alert" className="text-sm text-loss-500">{state.error}</p> : null}
        <Button type="submit" disabled={!agree || username.length < 3 || state?.busy}>{state?.busy ? 'Setting up…' : 'Enter Community'}</Button>
        <p className="text-xs text-ink-400">Signed in as {profile?.name}. You can change these later in your profile.</p>
      </form>
    </div>
  );
}
