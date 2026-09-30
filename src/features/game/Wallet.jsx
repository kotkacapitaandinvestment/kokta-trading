import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ExternalLink, Landmark, Loader2, CheckCircle2, AlertTriangle, Swords } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Select } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { confirmDialog, toast } from '../../lib/dialogs';
import { naira } from './format';
import GameNav from './GameNav';
import { CONTACT } from '../../lib/contact';

const DEP_STATUS = { initiated: ['Waiting for payment', 'neutral'], succeeded: ['Added', 'profit'], failed: ['Didn’t go through', 'loss'], expired: ['Expired', 'neutral'] };
const WD_STATUS = { requested: ['Waiting for review', 'warning'], processing: ['Sending', 'neutral'], paid: ['Paid', 'profit'], failed: ['Failed: money returned', 'loss'], rejected: ['Declined: money returned', 'loss'], cancelled: ['Cancelled', 'neutral'] };
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Deposit({ data, reload }) {
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState(data.payout.providers[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const r = data.rules;
  const kobo = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(kobo) && kobo >= r.minDepositKobo && kobo <= r.maxDepositKobo;
  const start = async () => {
    setBusy(true);
    try {
      const x = await api.post('/game/wallet/deposits', { amountKobo: kobo, provider });
      window.location.assign(x.checkoutUrl);
    } catch (err) {
      toast(err.message, { tone: 'error' });
      setBusy(false);
      reload();
    }
  };
  if (!r.depositsEnabled) return <p className="text-sm text-ink-500 dark:text-ink-400">Deposits are paused right now. Your balance is safe; please try again later.</p>;
  if (!data.payout.providers.length) return <p className="text-sm text-ink-500 dark:text-ink-400">Deposits aren’t set up yet. Please check back soon.</p>;
  return (
    <div className="max-w-md space-y-4">
      <div className="flex flex-wrap gap-2">
        {[1000, 2000, 5000, 10000].filter((n) => n * 100 >= r.minDepositKobo).map((n) => (
          <button key={n} type="button" onClick={() => setAmount(String(n))} className={clsx('rounded-lg border px-3 py-1.5 text-sm tabular-nums', Number(amount) === n ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900' : 'border-ink-200 dark:border-ink-700')}>₦{n.toLocaleString('en-NG')}</button>
        ))}
      </div>
      <Input label="Amount (₦)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} hint={`From ${naira(r.minDepositKobo)} to ${naira(r.maxDepositKobo)}. 1 Kotka Credit = ₦1.`} />
      {data.payout.providers.length > 1 ? (
        <Select label="Pay with" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {data.payout.providers.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </Select>
      ) : null}
      <Button onClick={start} disabled={!valid || busy} iconRight={ExternalLink}>{busy ? 'Opening checkout…' : `Pay ${valid ? naira(kobo) : ''} with ${data.payout.providers.find((p) => p.key === provider)?.name ?? 'Whop'}`}</Button>
      <p className="text-xs text-ink-400">You’ll finish paying on {data.payout.providers.find((p) => p.key === provider)?.name ?? 'the provider'}’s page, then come back here. Money is added when the provider confirms the payment.</p>
    </div>
  );
}

function Payout({ data, reload }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [banks, setBanks] = useState(null);
  const [bank, setBank] = useState('');
  const [acct, setAcct] = useState('');
  const { payout, rules, wallet } = data;
  const primary = payout.providers[0];
  const account = payout.accounts.find((a) => a.provider === primary?.key);
  const kobo = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(kobo) && kobo >= rules.minWithdrawalKobo && kobo <= wallet.availableKobo;

  useEffect(() => {
    if (primary?.key === 'paystack' && !banks) api.get('/game/wallet/payout/paystack/banks').then((r) => setBanks(r.banks)).catch(() => setBanks([]));
  }, [primary?.key, banks]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
      reload();
    }
  };
  const whopLink = (use) => run(async () => {
    const r = await api.post('/game/wallet/payout/whop', { use });
    window.location.assign(r.url);
  });
  const saveBank = () => run(async () => {
    const r = await api.post('/game/wallet/payout/paystack', { bankCode: bank, accountNumber: acct });
    toast(r.nameMatchesId ? `Saved: ${r.accountName}.` : `Saved: ${r.accountName}. That name doesn’t match your verified name, so withdrawals to it will be reviewed first.`, { tone: r.nameMatchesId ? 'success' : 'error' });
  });
  const request = () => run(async () => {
    const ok = await confirmDialog({ title: `Withdraw ${naira(kobo)}?`, message: rules.withdrawalApproval === 'manual' ? 'The amount is set aside now. The Kotka team reviews each withdrawal before it’s sent.' : 'The amount is set aside and sent to your payout account.', confirmLabel: 'Request withdrawal' });
    if (!ok) return;
    await api.post('/game/wallet/withdrawals', { amountKobo: kobo, provider: primary.key });
    setAmount('');
    toast('Withdrawal requested.');
  });

  if (!rules.withdrawalsEnabled) return <p className="text-sm text-ink-500 dark:text-ink-400">Withdrawals are paused right now. Your balance is safe; please try again later.</p>;
  if (!primary) return <p className="text-sm text-ink-500 dark:text-ink-400">Withdrawals aren’t set up yet. Please check back soon.</p>;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Where your money goes</h3>
        {primary.key === 'whop' ? (
          <>
            <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">Withdrawals are paid through Whop. Whop checks your identity once and lets you choose your bank. Approved withdrawals arrive in your Whop payout balance; move them to your bank from Whop’s payout portal.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={account ? 'secondary' : 'primary'} onClick={() => whopLink('account_onboarding')} disabled={busy} iconRight={ExternalLink}>{account ? 'Update your Whop details' : 'Set up payouts on Whop'}</Button>
              {account ? <Button size="sm" variant="ghost" onClick={() => whopLink('payouts_portal')} disabled={busy} iconRight={ExternalLink}>Open Whop payout portal</Button> : null}
            </div>
          </>
        ) : account ? (
          <p className="text-sm text-ink-600 dark:text-ink-300">
            {account.bankName} ····{account.accountLast4} · {account.accountName}
            {account.nameMatchesId === false ? <span className="block text-xs text-amber-700 dark:text-amber-400">This name doesn’t match your verified name, so withdrawals are reviewed first.</span> : null}
          </p>
        ) : null}
        {primary.key === 'paystack' ? (
          <div className="space-y-3">
            <Select label="Bank" value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="">{banks ? 'Choose your bank' : 'Loading banks…'}</option>
              {(banks ?? []).map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </Select>
            <Input label="Account number" inputMode="numeric" maxLength={10} value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, ''))} hint="The account should be in your own name." />
            <Button size="sm" onClick={saveBank} disabled={busy || !bank || acct.length !== 10}>{account ? 'Change account' : 'Save account'}</Button>
          </div>
        ) : null}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Withdraw</h3>
        <Input label="Amount (₦)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} hint={`Available: ${naira(wallet.availableKobo)}. The smallest withdrawal is ${naira(rules.minWithdrawalKobo)}.`} />
        <Button onClick={request} disabled={!valid || busy || !account}>{!account ? 'Set up payouts first' : 'Request withdrawal'}</Button>
        <p className="text-xs text-ink-400">Money locked in a match or already withdrawing can’t be withdrawn. Virtual trading capital from matches is game money and never withdrawable.</p>
      </div>
    </div>
  );
}

export default function Wallet() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(null);
  const tab = ['add', 'withdraw', 'history'].includes(params.get('tab')) ? params.get('tab') : 'add';
  const load = useCallback(() => api.get('/game/wallet').then(setData).catch((err) => setError(err.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  // Back from the checkout: ask Kotka (which asks the provider) until it's settled.
  const returning = params.get('deposit');
  useEffect(() => {
    if (!returning) return undefined;
    let n = 0;
    setChecking({ status: 'initiated' });
    const t = setInterval(async () => {
      n += 1;
      try {
        const r = await api.post(`/game/wallet/deposits/${returning}/check`);
        setChecking(r.deposit);
        if (r.deposit.status !== 'initiated' || n > 40) {
          clearInterval(t);
          load();
        }
      } catch {
        clearInterval(t);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [returning, load]);

  if (error) return <EmptyState icon={AlertTriangle} title="Your wallet didn’t load" description={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const w = data.wallet;

  return (
    <div className="space-y-6">
      <GameNav />
      <PageHeader
        eyebrow="Kotka Trading"
        title="Wallet"
        description="Real money, held as Kotka Credits (1 credit = ₦1). The capital you trade with inside a match is virtual, has no cash value, and is separate from this."
        actions={<Button as={Link} to="/app/game" icon={Swords}>Play</Button>}
      />

      {w.onHold ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-loss-500/30 bg-loss-50 p-3 text-sm text-loss-700 dark:bg-loss-500/10 dark:text-loss-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your wallet is on hold while a payment is reviewed, so staking and withdrawals are paused. Your balance is safe. <a href={`mailto:${CONTACT.support}`} className="font-medium underline">Contact support</a> if you have questions.</span>
        </div>
      ) : null}

      {checking ? (
        <div className={clsx('flex items-center gap-2 rounded-xl border p-3 text-sm', checking.status === 'succeeded' ? 'border-profit-500/30 bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400' : checking.status === 'failed' ? 'border-loss-500/30 bg-loss-50 text-loss-600 dark:bg-loss-500/10' : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300')}>
          {checking.status === 'initiated' ? <Loader2 className="h-4 w-4 animate-spin" /> : checking.status === 'succeeded' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {checking.status === 'initiated' ? 'Waiting for the payment to be confirmed. This usually takes a few seconds.' : checking.status === 'succeeded' ? `${naira(checking.amountKobo)} was added to your balance.` : 'That payment didn’t go through. Nothing was taken from your wallet.'}
          {checking.status !== 'initiated' ? <button type="button" className="ml-auto text-xs underline" onClick={() => { setChecking(null); params.delete('deposit'); setParams(params, { replace: true }); }}>Dismiss</button> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Competition credits', w.availableKobo + (w.promoAvailableKobo ?? 0), w.promoAvailableKobo ? `Includes ${naira(w.promoAvailableKobo)} promotional credits, which can’t be withdrawn` : 'Available to stake (1 credit = ₦1)'],
          ['Withdrawable', w.availableKobo, 'Available money you can take out'],
          ['Locked in matches', w.lockedKobo, 'Returned or paid out when matches end'],
          ['Wallet balance', w.totalKobo, w.pendingWithdrawKobo ? `Includes ${naira(w.pendingWithdrawKobo)} withdrawing` : 'Everything above, together'],
        ].map(([k, v, hint]) => (
          <Card key={k} className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{k}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink-900 dark:text-ink-50">{naira(v)}</p>
            <p className="mt-1 text-xs text-ink-400">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="overflow-x-auto">
        <Tabs tabs={[{ value: 'add', label: 'Add money' }, { value: 'withdraw', label: 'Withdraw' }, { value: 'history', label: 'Transactions' }]} active={tab} onChange={(t) => setParams({ tab: t })} />
      </div>

      {tab === 'add' ? (
        <Card>
          <CardBody className="space-y-6">
            <Deposit data={data} reload={load} />
            {data.deposits.length ? (
              <ul className="divide-y divide-ink-100 border-t border-ink-100 pt-2 text-sm dark:divide-ink-800 dark:border-ink-800">
                {data.deposits.map((d) => (
                  <li key={d.id} className="flex justify-between py-2">
                    <span className="text-ink-600 dark:text-ink-300">{naira(d.amountKobo)} via {d.providerName} · {when(d.createdAt)}</span>
                    <Badge tone={DEP_STATUS[d.status]?.[1]}>{DEP_STATUS[d.status]?.[0] ?? d.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {tab === 'withdraw' ? (
        <Card>
          <CardBody className="space-y-6">
            <Payout data={data} reload={load} />
            {data.withdrawals.length ? (
              <ul className="divide-y divide-ink-100 border-t border-ink-100 pt-2 text-sm dark:divide-ink-800 dark:border-ink-800">
                {data.withdrawals.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-ink-600 dark:text-ink-300">
                      {naira(x.amountKobo)} via {x.providerName} · {when(x.createdAt)}
                      {x.failureReason ? <span className="block text-xs text-ink-400">{x.failureReason}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={WD_STATUS[x.status]?.[1]}>{WD_STATUS[x.status]?.[0] ?? x.status}</Badge>
                      {x.status === 'requested' ? <Button size="sm" variant="ghost" onClick={() => api.post(`/game/wallet/withdrawals/${x.id}/cancel`).then(load).catch((err) => toast(err.message, { tone: 'error' }))}>Cancel</Button> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card>
          <CardHeader title="Transactions" subtitle="Every movement of your money, as recorded in Kotka’s ledger." />
          {data.entries.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">
                    {['When', 'What', 'Amount', 'Available after', 'Reference'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-ink-500">{when(e.createdAt)}</td>
                      <td className="px-5 py-2.5 text-ink-700 dark:text-ink-200">{e.label}</td>
                      <td className={clsx('px-5 py-2.5 tabular-nums', e.availableDeltaKobo > 0 ? 'text-profit-600 dark:text-profit-400' : e.availableDeltaKobo < 0 ? 'text-loss-500' : 'text-ink-500')}>{e.availableDeltaKobo ? naira(e.availableDeltaKobo, { sign: true }) : naira(e.amountKobo)}</td>
                      <td className="px-5 py-2.5 tabular-nums text-ink-600 dark:text-ink-300">{naira(e.availableAfterKobo)}</td>
                      <td className="px-5 py-2.5 font-mono text-[11px] text-ink-400">{e.matchId ? <Link to={`/app/game/matches/${e.matchId}`} className="hover:underline">match</Link> : (e.depositId ?? e.withdrawalId ?? e.id).slice(-8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody>
              <EmptyState size="inline" icon={Landmark} title="No transactions yet" description="Add money to start playing for stakes." />
            </CardBody>
          )}
        </Card>
      ) : null}
    </div>
  );
}
