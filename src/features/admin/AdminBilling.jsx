import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// Kotka has no billing yet: no checkout, subscriptions or revenue exist, so
// this page says so instead of showing illustrative numbers.
export default function AdminBilling() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get('/admin/stats/system').then(setStatus).catch(() => {});
  }, []);

  const paid = status?.platform?.paidPlansEnabled;
  const paystack = status?.integrations?.find((i) => i.key === 'paystack');

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Plans & Billing" description="Where subscriptions and revenue will live once paid plans launch." />

      <Card>
        <CardBody className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
            <CreditCard className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">{paid ? 'Paid plans are switched on' : 'Everything is free right now'}</h2>
              {status ? <Badge tone={paid ? 'accent' : 'profit'}>{paid ? 'Paid plans on' : 'Paid plans off'}</Badge> : null}
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              {paid
                ? 'Free accounts now get the free-plan Kotka AI limit, and any feature set to Premium is limited to Premium accounts. There’s no checkout yet, so a Super Admin gives someone Premium by changing their Role in Users.'
                : 'Every trader has every feature. Kotka AI has a daily limit for everyone, and staff have no limit. No one is charged.'}
            </p>
            <ul className="space-y-1.5 text-sm text-ink-600 dark:text-ink-300">
              <li>
                Paystack: {paystack ? (paystack.configured ? (paystack.enabled ? 'connected' : 'set up but switched off') : 'not connected') : '…'}. Checkout, subscriptions and invoices aren’t built yet.
              </li>
              <li>There’s no subscription or revenue data yet, so none is shown here.</li>
            </ul>
            {user?.role === 'super_admin' ? (
              <p className="text-xs text-ink-400">
                Switch paid plans and limits in <Link to="/admin/settings" className="font-medium text-accent-600 hover:underline dark:text-accent-400">Platform Settings</Link>.
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Before switching paid plans on" />
        <CardBody>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-600 marker:text-ink-400 dark:text-ink-300">
            <li>Decide which features are Premium. Today only Fundamental Research can be restricted (in its settings), plus the Kotka AI free-plan limit.</li>
            <li>Have your developer add Paystack checkout, so people who pay are upgraded to Premium automatically.</li>
            <li>Then turn on paid plans. Until checkout exists, turning them on only limits free accounts.</li>
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
