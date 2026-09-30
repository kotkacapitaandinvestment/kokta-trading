import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Copy } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Input, { Select } from '../../components/ui/Input';
import LoadError from './components/LoadError';
import { api } from '../../lib/api';
import { confirmDialog, promptDialog, toast } from '../../lib/dialogs';
import { naira } from '../game/format';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'matches', label: 'Matches' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'risk', label: 'Risk & compliance' },
  { value: 'settings', label: 'Settings' },
];
const when = (d) => (d ? new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const WD_TONE = { requested: 'warning', processing: 'neutral', paid: 'profit', failed: 'loss', rejected: 'loss', cancelled: 'neutral' };

function useData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.get(path).then(setData).catch((err) => setError(err.message)), [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, load };
}

function Overview() {
  const { data, error } = useData('/admin/game/overview');
  if (error) return <LoadError message={error} />;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const tiles = [
    ['Kotka fees held', naira(data.houseKobo), 'The house wallet'],
    ['Fees, last 30 days', naira(data.fees30dKobo), ''],
    ['Staked today', naira(data.stakedTodayKobo), `${naira(data.staked30dKobo)} in 30 days`],
    ['Deposits, 30 days', naira(data.deposits30dKobo), `${naira(data.withdrawalsPaid30dKobo)} paid out`],
    ['Players’ money', naira(data.playerFunds.availableKobo + data.playerFunds.lockedKobo + data.playerFunds.pendingWithdrawKobo), `${naira(data.playerFunds.lockedKobo)} locked in matches`],
    ['Withdrawals waiting', data.pendingWithdrawals.count, naira(data.pendingWithdrawals.amountKobo)],
    ['Disputed matches', data.disputed, 'Stakes locked until reviewed'],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([k, v, h]) => (
          <Card key={k} className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{k}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{v}</p>
            {h ? <p className="mt-1 text-xs text-ink-400">{h}</p> : null}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Matches in the last 30 days" />
        <CardBody>
          {Object.keys(data.matches30d).length ? (
            <ul className="flex flex-wrap gap-2">{Object.entries(data.matches30d).map(([s, n]) => <li key={s}><Badge tone="neutral">{s.toLowerCase().replace(/_/g, ' ')}: {n}</Badge></li>)}</ul>
          ) : <p className="text-sm text-ink-400">No matches yet.</p>}
        </CardBody>
      </Card>
    </div>
  );
}

function Withdrawals() {
  const [status, setStatus] = useState('requested');
  const { data, error, load } = useData(`/admin/game/withdrawals${status ? `?status=${status}` : ''}`);
  const run = async (fn) => {
    try {
      await fn();
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
      load();
    }
  };
  const approve = (w) => run(async () => {
    if (!(await confirmDialog({ title: `Send ${naira(w.amountKobo)} to ${w.user?.name}?`, message: `This sends real money through ${w.providerName}${w.account?.nameMatchesId === false ? '. The bank account name doesn’t match their verified name.' : '.'}`, confirmLabel: 'Approve and send', danger: w.account?.nameMatchesId === false }))) return;
    const r = await api.post(`/admin/game/withdrawals/${w.id}/approve`);
    toast(r.withdrawal.status === 'paid' ? 'Paid.' : 'Sent; waiting for the provider to confirm.');
  });
  const reject = (w) => run(async () => {
    const note = await promptDialog({ title: 'Decline this withdrawal?', message: 'The money goes back to their available balance. They see your note.', label: 'Reason', confirmLabel: 'Decline', danger: true });
    if (!note) return;
    await api.post(`/admin/game/withdrawals/${w.id}/reject`, { note });
  });
  const resolve = (w, outcome) => run(async () => {
    const note = await promptDialog({ title: outcome === 'paid' ? 'Mark as paid?' : 'Mark as failed and return the money?', message: 'Only do this after checking the provider’s dashboard.', label: 'What the provider shows', confirmLabel: outcome === 'paid' ? 'Mark paid' : 'Mark failed', danger: outcome === 'failed' });
    if (!note) return;
    await api.post(`/admin/game/withdrawals/${w.id}/resolve`, { outcome, note });
  });
  if (error) return <LoadError message={error} />;
  return (
    <Card>
      <CardHeader title="Withdrawals" subtitle="Real money leaving Kotka. Check the name and the amount before approving." action={
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800">
          {[['requested', 'Waiting for review'], ['processing', 'Sending'], ['paid', 'Paid'], ['failed', 'Failed'], ['rejected', 'Declined'], ['', 'All']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      } />
      {!data ? <CardBody><div className="h-32 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /></CardBody> : data.withdrawals.length ? (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {data.withdrawals.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink-800 dark:text-ink-100">{naira(w.amountKobo)} · {w.user?.name} <span className="text-xs text-ink-400">{w.user?.email}</span></p>
                <p className="text-xs text-ink-400">
                  {w.providerName} · {w.account ? (w.account.bankName ? `${w.account.bankName} ····${w.account.accountLast4} · ${w.account.accountName}` : `Whop account ${w.account.externalId}`) : 'no payout account'} · {when(w.createdAt)}
                </p>
                {w.account?.nameMatchesId === false ? <p className="text-xs text-amber-700 dark:text-amber-400">The bank account name doesn’t match their verified name.</p> : null}
                {w.failureReason ? <p className="text-xs text-ink-400">{w.failureReason}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={WD_TONE[w.status]}>{w.status}</Badge>
                {w.status === 'requested' ? <><Button size="sm" variant="ghost" onClick={() => reject(w)}>Decline</Button><Button size="sm" onClick={() => approve(w)}>Approve</Button></> : null}
                {w.status === 'processing' ? <><Button size="sm" variant="ghost" onClick={() => resolve(w, 'failed')}>Mark failed</Button><Button size="sm" variant="secondary" onClick={() => resolve(w, 'paid')}>Mark paid</Button></> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <CardBody><EmptyState size="inline" title="Nothing here" description="Withdrawals appear here as traders request them." /></CardBody>}
    </Card>
  );
}

function Matches() {
  const [status, setStatus] = useState('live');
  const { data, error, load } = useData(`/admin/game/matches?status=${status}`);
  const act = async (m, kind) => {
    const reason = await promptDialog({ title: kind === 'refund' ? 'Return both stakes?' : 'Mark this match as disputed?', message: kind === 'refund' ? 'Both players get their stake back in full. This can’t be undone.' : 'It won’t settle until someone refunds it.', label: 'Reason', confirmLabel: kind === 'refund' ? 'Refund' : 'Mark disputed', danger: true });
    if (!reason) return;
    try {
      await api.post(`/admin/game/matches/${m.id}/${kind}`, { reason });
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  if (error) return <LoadError message={error} />;
  return (
    <Card>
      <CardHeader title="Matches" action={
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800">
          {[['live', 'Live'], ['DISPUTED', 'Disputed'], ['SETTLED', 'Settled'], ['REFUNDED', 'Refunded'], ['', 'All']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      } />
      {!data ? <CardBody><div className="h-32 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /></CardBody> : data.matches.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">{['Created', 'Players', 'Stake', 'Market', 'Status', 'Flags', ''].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {data.matches.map((m) => (
                <tr key={m.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                  <td className="px-5 py-3 text-xs text-ink-500">{when(m.createdAt)}</td>
                  <td className="px-5 py-3 text-ink-700 dark:text-ink-200">{m.players.map((p) => `${p.name ?? '—'}${p.score != null ? ` (${p.score})` : ''}`).join(' vs ')}</td>
                  <td className="px-5 py-3 tabular-nums">{m.mode === 'practice' ? 'Practice' : naira(m.stakeKobo)}</td>
                  <td className="px-5 py-3 text-xs text-ink-500">{m.scenario?.name} · {m.scenario?.code}</td>
                  <td className="px-5 py-3"><Badge tone={m.status === 'DISPUTED' ? 'warning' : 'neutral'}>{m.status.toLowerCase().replace(/_/g, ' ')}</Badge></td>
                  <td className="px-5 py-3 text-xs text-ink-500">{(m.flags ?? []).map((f) => f.kind.replace(/_/g, ' ')).join(', ') || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {!['SETTLED', 'REFUNDED', 'CANCELLED', 'EXPIRED'].includes(m.status) && m.mode === 'duel' ? (
                      <div className="flex justify-end gap-2">
                        {m.status !== 'DISPUTED' ? <Button size="sm" variant="ghost" onClick={() => act(m, 'dispute')}>Dispute</Button> : null}
                        <Button size="sm" variant="secondary" onClick={() => act(m, 'refund')}>Refund</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <CardBody><EmptyState size="inline" title="No matches" description="Matches appear here as traders play." /></CardBody>}
    </Card>
  );
}

function Deposits() {
  const { data, error } = useData('/admin/game/deposits');
  if (error) return <LoadError message={error} />;
  return (
    <Card>
      <CardHeader title="Deposits" subtitle="Credited only after the provider confirms the payment." />
      {!data ? <CardBody><div className="h-32 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /></CardBody> : data.deposits.length ? (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {data.deposits.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
              <span className="text-ink-700 dark:text-ink-200">{naira(d.amountKobo)} · {d.user?.name} <span className="text-xs text-ink-400">{d.providerName} · {when(d.createdAt)}{d.providerPaymentId ? ` · ${d.providerPaymentId}` : ''}</span>{d.failureReason ? <span className="block text-xs text-amber-700 dark:text-amber-400">{d.failureReason}</span> : null}</span>
              <Badge tone={d.status === 'succeeded' ? 'profit' : d.status === 'failed' ? 'loss' : 'neutral'}>{d.status}</Badge>
            </li>
          ))}
        </ul>
      ) : <CardBody><EmptyState size="inline" title="No deposits yet" /></CardBody>}
    </Card>
  );
}

function Ledger({ canEdit }) {
  const [q, setQ] = useState('');
  const [wallets, setWallets] = useState([]);
  const [house, setHouse] = useState(false);
  const [userId, setUserId] = useState('');
  const { data, error, load } = useData(`/admin/game/ledger?${house ? 'house=1' : userId ? `userId=${userId}` : ''}`);
  useEffect(() => {
    if (q.trim().length < 2) return setWallets([]);
    const t = setTimeout(() => api.get(`/admin/game/wallets?q=${encodeURIComponent(q.trim())}`).then((r) => setWallets(r.wallets)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const adjust = async (w) => {
    const amount = await promptDialog({ title: `Adjust ${w.user.name}’s balance`, message: 'Enter an amount in naira: positive adds, negative removes. Use this only for corrections; it’s kept in the ledger.', label: 'Amount (₦)', confirmLabel: 'Next' });
    if (!amount || !Number(amount)) return;
    const reason = await promptDialog({ title: 'Reason', message: 'Explain the adjustment.', label: 'Reason', confirmLabel: `Adjust by ₦${amount}`, danger: Number(amount) < 0 });
    if (!reason) return;
    try {
      await api.post('/admin/game/adjustments', { userId: w.user.id, amountKobo: Math.round(Number(amount) * 100), reason });
      toast('Adjusted.');
      setUserId(w.user.id);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const hold = async (w, on) => {
    const reason = on ? await promptDialog({ title: `Put ${w.user.name}’s wallet on hold?`, message: 'They can’t stake or withdraw until you clear it. Their balance stays as it is.', label: 'Reason', confirmLabel: 'Put on hold', danger: true }) : null;
    if (on && !reason) return;
    if (!on && !(await confirmDialog({ title: `Clear the hold on ${w.user.name}’s wallet?`, message: w.wallet.holdReason ? `It was held because: ${w.wallet.holdReason}` : 'They can stake and withdraw again.', confirmLabel: 'Clear hold' }))) return;
    try {
      await api.post(`/admin/game/wallets/${w.user.id}/hold`, { on, reason });
      toast(on ? 'Wallet on hold.' : 'Hold cleared.');
      setWallets((list) => list.map((x) => (x.user.id === w.user.id ? { ...x, wallet: { ...x.wallet, onHold: on, holdReason: on ? reason : null } } : x)));
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  if (error) return <LoadError message={error} />;
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm"><Input label="Find a wallet" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Button variant={house ? 'primary' : 'secondary'} onClick={() => { setHouse((h) => !h); setUserId(''); }}>Kotka fees</Button>
          </div>
          {wallets.length ? (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {wallets.map((w) => (
                <li key={w.user.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <button type="button" onClick={() => { setUserId(w.user.id); setHouse(false); }} className="text-left">
                    {w.user.name} <span className="text-xs text-ink-400">{w.user.email}</span>
                    <span className="block text-xs text-ink-400">{naira(w.wallet.availableKobo)} available · {naira(w.wallet.lockedKobo)} locked · {naira(w.wallet.pendingWithdrawKobo)} withdrawing</span>
                    {w.wallet.onHold ? <span className="mt-0.5 block text-xs font-medium text-loss-600 dark:text-loss-400">On hold: {w.wallet.holdReason}</span> : null}
                  </button>
                  {canEdit ? (
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => adjust(w)}>Adjust</Button>
                      <Button size="sm" variant={w.wallet.onHold ? 'secondary' : 'dangerGhost'} onClick={() => hold(w, !w.wallet.onHold)}>{w.wallet.onHold ? 'Clear hold' : 'Put on hold'}</Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={house ? 'Kotka fees' : userId ? 'This wallet' : 'Latest entries'} subtitle="The immutable ledger. Each row shows the balance after it." />
        {!data ? <CardBody><div className="h-32 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /></CardBody> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-ink-100 text-left text-xs text-ink-400 dark:border-ink-800">{['When', 'Who', 'What', 'Available change', 'Locked change', 'Available after', 'Reason'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-ink-50 last:border-0 dark:border-ink-800/60">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-ink-500">{when(e.createdAt)}</td>
                    <td className="px-4 py-2 text-ink-700 dark:text-ink-200">{e.userName ?? '—'}</td>
                    <td className="px-4 py-2 text-ink-600 dark:text-ink-300">{e.label}</td>
                    <td className={clsx('px-4 py-2 tabular-nums', e.availableDeltaKobo > 0 ? 'text-profit-600' : e.availableDeltaKobo < 0 ? 'text-loss-500' : 'text-ink-400')}>{e.availableDeltaKobo ? naira(e.availableDeltaKobo, { sign: true }) : '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-ink-500">{e.lockedDeltaKobo ? naira(e.lockedDeltaKobo, { sign: true }) : '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-ink-600 dark:text-ink-300">{naira(e.availableAfterKobo)}</td>
                    <td className="px-4 py-2 text-xs text-ink-400">{e.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// Patterns worth a human look. Nothing here blocks anyone by itself.
function Risk() {
  const [days, setDays] = useState(14);
  const { data, error } = useData(`/admin/game/risk?days=${days}`);
  if (error) return <LoadError message={error} />;
  const who = (p) => (p ? <span className="font-medium text-ink-800 dark:text-ink-100">{p.name}{p.username ? <span className="font-normal text-ink-400"> @{p.username}</span> : null}</span> : '—');
  const section = (title, subtitle, rows, render, empty) => (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>
        {!data ? <div className="h-16 animate-pulse rounded-lg bg-ink-50 dark:bg-ink-800" /> : rows.length ? <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">{rows.map(render)}</ul> : <EmptyState size="inline" title={empty} />}
      </CardBody>
    </Card>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">Signals from settled competitions and the money ledger. They are reasons to look closer, not proof of wrongdoing; open the players’ matches and ledger before acting.</p>
        <div className="w-40">
          <Select label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </Select>
        </div>
      </div>
      {section('The same two traders, again and again', 'Three or more competitions between the same pair. Worth a look when one side always wins.', data?.repeatedPairs ?? [], (r, i) => (
        <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>{who(r.players[0])} <span className="text-ink-400">({r.players[0].wins} won)</span> and {who(r.players[1])} <span className="text-ink-400">({r.players[1].wins} won)</span></span>
          <span className="text-xs tabular-nums text-ink-500">{r.matches} competitions · {naira(r.stakedKobo)} staked · last {when(r.last)}</span>
        </li>
      ), 'No pair has played three times in this period.')}
      {section('Lost without really trading', 'One player lost with no position, or only a token one, while the other won, at least twice between the same two. This is how money can be passed between accounts.', data?.oneSidedLosses ?? [], (r, i) => (
        <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>{who(r.loser)} <span className="text-ink-400">lost to</span> {who(r.winner)}</span>
          <span className="text-xs tabular-nums text-ink-500">{r.matches} times · {naira(r.passedKobo)} in stakes · last {when(r.last)}</span>
        </li>
      ), 'No repeated one-sided losses in this period.')}
      {section('Money in and straight out', 'A withdrawal within 24 hours of a deposit, with one competition or none in between.', data?.quickCashOuts ?? [], (r) => (
        <li key={r.withdrawalId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span>{who(r.person)} <span className="text-ink-400">deposited {naira(r.depositedKobo)}, asked to withdraw {naira(r.withdrawnKobo)}</span></span>
          <span className="text-xs tabular-nums text-ink-500">{r.hours} h later · {r.matchesBetween} competition{r.matchesBetween === 1 ? '' : 's'} between · {r.status}</span>
        </li>
      ), 'No fast cash-outs in this period.')}
    </div>
  );
}

function Settings() {
  const { data, error, load } = useData('/admin/game/settings');
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (data) setDraft(data.settings);
  }, [data]);
  if (error) return <LoadError message={error} />;
  if (!data || !draft) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const can = data.canEdit;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const nairaField = (k, label, hint) => <Input label={label} hint={hint} inputMode="numeric" value={draft[k] / 100} disabled={!can} onChange={(e) => set(k, Math.round(Number(e.target.value || 0) * 100))} />;
  const toggle = (k, label, hint) => (
    <label className="flex items-start justify-between gap-4 py-2">
      <span><span className="block text-sm font-medium text-ink-700 dark:text-ink-200">{label}</span>{hint ? <span className="block text-xs text-ink-400">{hint}</span> : null}</span>
      <input type="checkbox" checked={!!draft[k]} disabled={!can} onChange={(e) => set(k, e.target.checked)} className="mt-1" />
    </label>
  );
  const save = async () => {
    try {
      await api.put('/admin/game/settings', draft);
      toast('Saved. Changes apply within 15 seconds; matches already created keep their rules.');
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied.'));
  return (
    <div className="space-y-6 pb-20">
      <Card>
        <CardHeader title="Payments" subtitle="Whop is the main provider; Paystack can be offered as a second option or made the main one." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone={data.providers.whop ? 'profit' : 'warning'}>Whop {data.providers.whop ? 'connected' : 'not connected'}</Badge>
            <Badge tone={data.providers.whopWebhook ? 'profit' : 'warning'}>Whop webhook secret {data.providers.whopWebhook ? 'set' : 'missing'}</Badge>
            <Badge tone={data.providers.paystack ? 'profit' : 'neutral'}>Paystack {data.providers.paystack ? 'connected' : 'not connected'}</Badge>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-400">Keys and the Whop company id are in Connected services. Point each provider’s webhooks here:</p>
          {Object.entries(data.webhooks).map(([k, url]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-ink-500">{k === 'whop' ? 'Whop' : 'Paystack'}</span>
              <code className="truncate rounded bg-ink-50 px-2 py-1 dark:bg-ink-800">{url}</code>
              <button type="button" onClick={() => copy(url)} aria-label="Copy" className="text-ink-400 hover:text-ink-900 dark:hover:text-ink-50"><Copy className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <p className="text-xs text-ink-400">Whop events: payment.succeeded, payment.failed. Paystack events: charge.success, transfer.success, transfer.failed, transfer.reversed.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Main provider" value={draft.primaryProvider} disabled={!can} onChange={(e) => set('primaryProvider', e.target.value)}>
              <option value="whop">Whop</option>
              <option value="paystack">Paystack</option>
            </Select>
            <Select label="Withdrawals" value={draft.withdrawalApproval} disabled={!can} onChange={(e) => set('withdrawalApproval', e.target.value)}>
              <option value="manual">An admin approves each one</option>
              <option value="automatic">Sent automatically (name mismatches still wait)</option>
            </Select>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {toggle('paystackEnabled', 'Offer Paystack as well', 'Traders can choose Paystack for deposits.')}
            {toggle('depositsEnabled', 'Deposits on')}
            {toggle('withdrawalsEnabled', 'Withdrawals on', 'When off, balances stay safe and requests are refused.')}
            {toggle('matchesEnabled', 'Competitions on', 'When off, no new challenges; practice still works.')}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Money rules" subtitle="In naira. 1 Kotka Credit = ₦1." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {nairaField('minDepositKobo', 'Smallest deposit')}
          {nairaField('maxDepositKobo', 'Largest deposit')}
          {nairaField('minWithdrawalKobo', 'Smallest withdrawal')}
          {nairaField('minStakeKobo', 'Smallest stake')}
          {nairaField('stakeStepKobo', 'Stake steps')}
          {nairaField('maxStakeKobo', 'Largest stake')}
          {nairaField('dailyStakeLimitKobo', 'Stake limit per person per day')}
          <Input label="Kotka fee (%)" inputMode="decimal" value={draft.feeBps / 100} disabled={!can} onChange={(e) => set('feeBps', Math.round(Number(e.target.value || 0) * 100))} />
          <Input label="Draw tolerance (score points)" inputMode="decimal" value={draft.drawTolerance} disabled={!can} onChange={(e) => set('drawTolerance', Number(e.target.value || 0))} />
          <div className="sm:col-span-3">{toggle('noTradeRefund', 'Refund in full when neither player trades', 'No fee is taken.')}</div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Matches" subtitle="New matches take a snapshot of these; running matches keep theirs." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Starting virtual capital (₦)" inputMode="numeric" value={draft.startingCapital} disabled={!can} onChange={(e) => set('startingCapital', Number(e.target.value || 0))} />
          <Input label="Match lengths (minutes, comma-separated)" value={draft.durations.map((d) => d / 60).join(', ')} disabled={!can} onChange={(e) => set('durations', e.target.value.split(',').map((x) => Math.round(Number(x.trim()) * 60)).filter((x) => x > 0))} />
          <Input label="Default length (minutes)" inputMode="numeric" value={draft.defaultDurationSec / 60} disabled={!can} onChange={(e) => set('defaultDurationSec', Math.round(Number(e.target.value || 0) * 60))} />
          <Input label="Candle length (seconds)" inputMode="numeric" value={draft.candleSec} disabled={!can} onChange={(e) => set('candleSec', Number(e.target.value || 0))} />
          <Input label="Market speed (×)" inputMode="decimal" value={draft.speed} disabled={!can} onChange={(e) => set('speed', Number(e.target.value || 1))} />
          <Input label="Countdown (seconds)" inputMode="numeric" value={draft.countdownSec} disabled={!can} onChange={(e) => set('countdownSec', Number(e.target.value || 0))} />
          <Input label="Chart history before a match (hours)" hint="How far back players can scroll. 1 to 48." inputMode="numeric" value={draft.backgroundHours} disabled={!can} onChange={(e) => set('backgroundHours', Number(e.target.value || 0))} />
          <Input label="Spread (basis points)" inputMode="decimal" value={draft.trading.spreadBps} disabled={!can} onChange={(e) => set('trading', { ...draft.trading, spreadBps: Number(e.target.value || 0) })} />
          <Input label="Largest position (× capital)" inputMode="decimal" value={draft.trading.maxLeverage} disabled={!can} onChange={(e) => set('trading', { ...draft.trading, maxLeverage: Number(e.target.value || 1) })} />
          <Input label="Capital floor (% of start)" inputMode="decimal" value={draft.trading.stopOutPct} disabled={!can} onChange={(e) => set('trading', { ...draft.trading, stopOutPct: Number(e.target.value || 0) })} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Score weights"
          subtitle="How much each part counts in the Kotka Performance Score, in percent. They must add up to 100. Traders see these on the Learn page; new matches use them."
          action={(() => {
            const total = Object.values(draft.weights).reduce((s, x) => s + (Number(x) || 0), 0);
            return <Badge tone={total === 100 ? 'profit' : 'loss'}>Total {total}%</Badge>;
          })()}
        />
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Object.keys(draft.weights).map((k) => (
            <Input key={k} label={`${k[0].toUpperCase() + k.slice(1)} (%)`} inputMode="numeric" value={draft.weights[k]} disabled={!can} onChange={(e) => set('weights', { ...draft.weights, [k]: Number(e.target.value.replace(/[^\d]/g, '') || 0) })} />
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Scoring rules" subtitle="The thresholds behind the risk, decision and consistency checks. The Learn page quotes them, and new matches use them." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ['goodRiskPct', 'Sensible risk per trade (%)', 'At or below this counts in the trader’s favour.'],
            ['maxRiskPct', 'Risk ceiling per trade (%)', 'Above this is flagged as too much on one trade.'],
            ['highLeveragePct', 'Very large position (% of capital)', 'Above this is flagged, e.g. 300 = 3× capital.'],
            ['overtradesPer15Min', 'Overtrading (trades per 15 min)', 'More than this, scaled to the match length.'],
            ['revengeTicks', 'Trade straight after a loss (seconds)', 'A new trade this soon after closing a loss is flagged.'],
            ['driftGraceTicks', 'Grace after an idea is invalidated (seconds)', 'Staying in longer than this is thesis drift.'],
            ['fullCreditSizePct', 'Full process credit from (% of capital)', 'Smaller positions earn proportionally less credit. Below half credit, a player can’t win.'],
          ].map(([k, label, hint]) => (
            <Input key={k} label={label} hint={hint} inputMode="decimal" value={draft.scoring?.[k] ?? ''} disabled={!can} onChange={(e) => set('scoring', { ...draft.scoring, [k]: e.target.value === '' ? '' : Number(e.target.value.replace(/[^\d.]/g, '')) })} />
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Kinds of market" subtitle="Each match draws one of these at random. The kind is revealed after the match." />
        <CardBody className="flex flex-wrap gap-2">
          {data.markets.map((mk) => {
            const on = draft.scenarios.includes(mk.key);
            return (
              <button key={mk.key} type="button" disabled={!can} onClick={() => set('scenarios', on ? draft.scenarios.filter((x) => x !== mk.key) : [...draft.scenarios, mk.key])} className={clsx('rounded-full border px-3 py-1 text-xs', on ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900' : 'border-ink-200 text-ink-500 dark:border-ink-700')}>
                {mk.name}
              </button>
            );
          })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Kotka pairs" subtitle="The synthetic markets players can choose. A match with no pair chosen gets one of these at random." />
        <CardBody className="flex flex-wrap gap-2">
          {(data.pairs ?? []).map((p) => {
            const on = draft.pairs?.includes(p.symbol);
            return (
              <button key={p.symbol} type="button" disabled={!can} title={p.name} onClick={() => set('pairs', on ? draft.pairs.filter((x) => x !== p.symbol) : [...(draft.pairs ?? []), p.symbol])} className={clsx('rounded-full border px-3 py-1 text-xs', on ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900' : 'border-ink-200 text-ink-500 dark:border-ink-700')}>
                {p.symbol}
              </button>
            );
          })}
        </CardBody>
      </Card>
      {can ? (
        <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-ink-100 bg-ink-50/95 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/95 lg:-mx-8 lg:px-8">
          <Button onClick={save}>Save settings</Button>
        </div>
      ) : <p className="text-xs text-ink-400">Only a Super Admin can change these.</p>}
    </div>
  );
}

export default function AdminGame() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    api.get('/admin/game/settings').then((r) => setCanEdit(r.canEdit)).catch(() => {});
  }, []);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Trading Game" description="Competitions, real money in and out, and the rules behind them. Every change is in the Audit Log." />
      <div className="overflow-x-auto"><Tabs tabs={TABS} active={tab} onChange={(t) => setParams({ tab: t })} /></div>
      {tab === 'overview' ? <Overview /> : null}
      {tab === 'withdrawals' ? <Withdrawals /> : null}
      {tab === 'matches' ? <Matches /> : null}
      {tab === 'deposits' ? <Deposits /> : null}
      {tab === 'ledger' ? <Ledger canEdit={canEdit} /> : null}
      {tab === 'risk' ? <Risk /> : null}
      {tab === 'settings' ? <Settings /> : null}
    </div>
  );
}
