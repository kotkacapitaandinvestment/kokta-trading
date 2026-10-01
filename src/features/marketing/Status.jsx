import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, XCircle } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';
import { CONTACT } from '../../lib/contact';

// Public status page. Every state comes from a live check or a recorded
// sample; days with no samples are shown as "no data", never as working.
const STATE = {
  ok: { icon: CheckCircle2, text: 'Working', tone: 'text-profit-600 dark:text-profit-400', bar: 'bg-profit-500' },
  degraded: { icon: AlertTriangle, text: 'Slow or partly working', tone: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-400' },
  down: { icon: XCircle, text: 'Not working', tone: 'text-loss-500', bar: 'bg-loss-500' },
  off: { icon: CircleDashed, text: 'Not switched on', tone: 'text-ink-400', bar: 'bg-ink-200 dark:bg-ink-700' },
};
const OVERALL = {
  ok: ['Everything is working', 'bg-profit-500/10 text-profit-700 dark:text-profit-300'],
  degraded: ['Some parts are slow or partly working', 'bg-amber-400/15 text-amber-900 dark:text-amber-200'],
  down: ['Something isn’t working', 'bg-loss-500/10 text-loss-700 dark:text-loss-300'],
};
const shortDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short' });

function Day({ d }) {
  const label = d.samples ? `${shortDate(d.date)}: ${d.samples} check${d.samples === 1 ? '' : 's'}, ${d.down ? `${d.down} not working` : d.degraded ? `${d.degraded} slow` : 'all working'}` : `${shortDate(d.date)}: no checks recorded`;
  const tone = !d.samples ? 'bg-ink-100 dark:bg-ink-800' : d.down ? STATE.down.bar : d.degraded ? STATE.degraded.bar : STATE.ok.bar;
  return <span role="img" aria-label={label} title={label} className={clsx('h-7 min-w-0 flex-1 rounded-[2px]', tone)} />;
}

export default function Status() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setBusy(true);
    fetch('/api/status', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('The status check didn’t answer.'))))
      .then((j) => { setData(j); setError(null); })
      .catch(() => setError('We couldn’t reach Kotka to check. If this keeps happening, Kotka itself may be down.'))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60e3);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="min-h-[100dvh] bg-ink-50 dark:bg-ink-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka status</span>
          </Link>
          <button type="button" onClick={load} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-white disabled:opacity-60 dark:text-ink-300 dark:hover:bg-ink-900">
            <RefreshCw className={clsx('h-3.5 w-3.5', busy && 'animate-spin')} /> Check again
          </button>
        </header>

        {error ? <p role="alert" className="rounded-xl bg-loss-500/10 p-4 text-sm text-loss-700 dark:text-loss-300">{error}</p> : null}
        {!data && !error ? <div role="status" className="h-72 animate-pulse rounded-2xl bg-white dark:bg-ink-900" aria-label="Checking" /> : null}

        {data ? (
          <>
            <div className={clsx('rounded-2xl px-5 py-4 text-base font-semibold', OVERALL[data.overall][1])} role="status">
              {OVERALL[data.overall][0]}
              <span className="mt-0.5 block text-xs font-normal">Checked {new Date(data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. This page checks again every minute.</span>
            </div>

            <ul className="mt-6 divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white dark:divide-ink-800 dark:bg-ink-900">
              {data.components.map((c) => {
                const s = STATE[c.state] ?? STATE.off;
                const hist = data.history.find((h) => h.key === c.key);
                return (
                  <li key={c.key} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{c.name}</h2>
                        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{c.about}</p>
                      </div>
                      <span className={clsx('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium', s.tone)}>
                        <s.icon className="h-4 w-4" /> {s.text}
                      </span>
                    </div>
                    {c.detail && c.state !== 'ok' ? <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{c.detail}</p> : null}
                    {c.state !== 'off' && hist ? (
                      <div className="mt-3">
                        <div className="flex gap-px">{hist.days.map((d) => <Day key={d.date} d={d} />)}</div>
                        <div className="mt-1 flex justify-between text-[11px] text-ink-400">
                          <span>{hist.days.length} days ago</span>
                          <span>{hist.uptimePct !== null ? `${hist.uptimePct}% of checks working` : 'No checks recorded yet'}</span>
                          <span>Today</span>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              {data.since ? `History from ${new Date(data.since).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}, from Kotka’s scheduled checks. ` : 'History fills in as Kotka’s scheduled checks run. '}
              Something wrong that isn’t shown here? Email <a href={`mailto:${CONTACT.support}`} className="font-medium text-accent-800 underline dark:text-accent-300">{CONTACT.support}</a>.
            </p>
            <p className="mt-2 text-xs"><Link to="/help" className="font-medium text-accent-800 hover:underline dark:text-accent-300">Help centre</Link></p>
          </>
        ) : null}
      </div>
    </div>
  );
}
