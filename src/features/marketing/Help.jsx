import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, LifeBuoy, Search } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { CONTACT } from '../../lib/contact';

// The help centre. Every answer describes how Kotka works today; money
// numbers come live from the current rules, never typed in here.
const naira = (k) => `₦${(Number(k ?? 0) / 100).toLocaleString('en-NG')}`;

function articles(r) {
  const fee = r ? `${r.feeBps / 100}%` : 'a set percentage';
  return [
    {
      id: 'start',
      title: 'Getting started',
      items: [
        ['How do I create an account?', 'Enter your name, email and a password, and Kotka emails you a 6-digit code. Enter the code within 15 minutes and your account is ready, with your email already confirmed. If the address already has an account, we email a sign-in link to it instead, so nobody can use the form to find out who uses Kotka.'],
        ['Why does Kotka ask for my identity?', 'A short identity check keeps accounts real and is required before you can play for a stake or move money. You must be 18 or older. Your details are encrypted and only Kotka’s verification team can open them.'],
        ['Can I install Kotka as an app?', 'Yes, for free and without an app store: open www.kotkafinance.online/install on your phone and follow the steps it shows for your phone and browser. On Android the app goes to your app list (swipe up and search Kotka); press and hold it to add it to your home screen. If you opened Kotka from WhatsApp or Instagram, open it in Chrome or Safari first.'],
        ['What should I do first?', 'Your Dashboard has a “Get started” list: confirm the basics, log a trade in the journal, run the pre-trade checklist before your next trade, ask Kotka AI to challenge an idea, and try a free practice match.'],
      ],
    },
    {
      id: 'security',
      title: 'Your account and security',
      items: [
        ['How do I turn on two-step verification?', 'Settings → Security. After your password you’ll also enter a code from an authenticator app. It’s required to withdraw money or change where it goes, so a stolen password alone can’t take it. Keep your recovery codes somewhere safe.'],
        ['I can’t sign in: it says too many attempts', 'After 8 wrong passwords, signing in on a new device pauses for 15 minutes. Devices you’ve signed in on before keep working, so someone guessing at your password can’t lock you out of your own phone. To get in straight away, reset your password from the sign-in page.'],
        ['I got an email about a new sign-in', 'Kotka emails you when your account is used on a device it hasn’t seen before. If it wasn’t you, change your password (that signs out every other device) and turn on two-step verification.'],
        ['How do I delete my account?', 'Settings → Delete account. Everything tied to it is erased. If there’s money in your wallet, withdraw it first: an account holding money can’t be deleted.'],
      ],
    },
    {
      id: 'ai',
      title: 'Kotka AI',
      items: [
        ['What does Kotka AI do?', 'It questions your trade ideas: structure, risk and bias. It reads your journal, the research, market data, the calendar, news and Community, so you can ask about any of them. It will never hand you a buy or sell signal.'],
        ['Is there a limit?', 'Yes, a daily number of messages, shown under the message box. It resets each day.'],
      ],
    },
    {
      id: 'game',
      title: 'Trading Game: how competitions work',
      items: [
        ['How does a match work?', `Two traders get the same synthetic market and the same information, and each trades ${r ? naira(r.startingCapital * 100) : 'a fixed amount'} of virtual capital. Kotka scores the decisions, not only the profit, with the Kotka Performance Score. The Learn page shows exactly how it’s worked out today.`],
        ['What does it cost, and what can I win?', `You choose a stake from ${r ? naira(r.minStakeKobo) : 'the minimum'} to ${r ? naira(r.maxStakeKobo) : 'the maximum'}; your opponent stakes the same. Kotka’s competition platform fee is ${fee} of the pool. The winner receives the pool less the fee; a draw splits it.${r?.noTradeRefund !== false ? ' If neither of you trades, both stakes come back in full and there is no fee.' : ''} Every screen shows the stake, fee and prize before you confirm.`],
        ['Is virtual capital real money?', 'No. It’s game money for trading inside a match, has no cash value and can’t be withdrawn. Only your stake is real money.'],
        ['What are promotional credits?', 'Credits Kotka gives in promotions. They can be staked but never withdrawn, and they expire (the date is in your wallet). A stake uses them first. If you win with them, the prize is real money, and that share becomes withdrawable once you’ve staked the same amount of your own money.'],
        ['Can I limit how much I play?', 'Yes. Wallet → Limits and breaks lets you cap deposits per day, week or month and stakes per day. Lowering a limit works at once; raising one waits 24 hours. You can also take a break (a day, a week, a month) or self-exclude for months or years. Neither can be ended early. Withdrawals and free practice stay open.'],
      ],
    },
    {
      id: 'wallet',
      title: 'Wallet: adding and withdrawing money',
      items: [
        ['How do I add money?', `Wallet → Add money. You pay on the payment provider’s page, and the money is added when the provider confirms it. The smallest deposit is ${r ? naira(r.minDepositKobo) : 'shown in the wallet'}.`],
        ['How do withdrawals work?', `Wallet → Withdraw, with a code from your authenticator app. The smallest withdrawal is ${r ? naira(r.minWithdrawalKobo) : 'shown in the wallet'}. ${r?.withdrawalApproval === 'automatic' ? 'Most are sent straight away' : 'The Kotka team reviews each one before it’s sent'}; money added in the last 72 hours, or a payout account whose name doesn’t match your verified name, always waits for a review.`],
        ['Why is my wallet on hold?', 'A refund or chargeback was reported on one of your deposits. While it’s reviewed, staking and withdrawals pause; your balance stays safe. Contact support if you have questions.'],
      ],
    },
    {
      id: 'community',
      title: 'Community',
      items: [
        ['What are the rules?', 'Debate ideas, not people. No scams, money requests or guaranteed-return claims, no pretending to be Kotka staff, no market manipulation or signal-selling, and never share passwords, codes or anyone’s personal details. The full guidelines are in Community → Guidelines.'],
        ['Someone is bothering me', 'From their profile you can mute them (their posts and messages are hidden from you) or block them (they can’t message you and their content is hidden). Report anything that breaks the rules from its menu; moderators review reports.'],
      ],
    },
    {
      id: 'problems',
      title: 'Something went wrong',
      items: [
        ['Report a problem with a match', 'Open the match result and choose “Report a problem with this match”, within 14 days of it ending. Kotka keeps a sealed record of every match (the market, every order and the settlement), so we can check exactly what happened.'],
        ['Is Kotka down?', 'The status page shows each part of Kotka, checked live, with its recent history.'],
      ],
    },
  ];
}

function Item({ q, a, open, onToggle }) {
  return (
    <li className="border-b border-ink-100 last:border-0 dark:border-ink-800">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-ink-800 dark:text-ink-100">
        {q}
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <p className="pb-4 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{a}</p> : null}
    </li>
  );
}

export default function Help() {
  const { user } = useAuth();
  const [rules, setRules] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  useEffect(() => {
    fetch('/api/app/game-rules').then((r) => (r.ok ? r.json() : null)).then(setRules).catch(() => {});
  }, []);
  // Links like /help#wallet open at that section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
  }, []);
  const sections = useMemo(() => {
    const all = articles(rules);
    const t = q.trim().toLowerCase();
    if (!t) return all;
    return all.map((s) => ({ ...s, items: s.items.filter(([qq, a]) => `${qq} ${a}`.toLowerCase().includes(t)) })).filter((s) => s.items.length);
  }, [rules, q]);
  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="min-h-[100dvh] bg-ink-50 dark:bg-ink-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Link to={user ? '/app/dashboard' : '/'} className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka help</span>
          </Link>
          <Link to="/status" className="text-xs font-medium text-ink-600 hover:underline dark:text-ink-300">System status</Link>
        </header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-3xl">How can we help?</h1>
        <label className="relative mt-4 block">
          <span className="sr-only">Search help</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: withdraw, two-step, fee, promo…" className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
        </label>

        <div className="mt-6 space-y-4">
          {sections.length ? sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`} className="scroll-mt-6 rounded-2xl bg-white px-5 py-2 dark:bg-ink-900">
              <h2 id={`h-${s.id}`} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{s.title}</h2>
              <ul>{s.items.map(([qq, a]) => <Item key={qq} q={qq} a={a} open={!!q.trim() || open.has(qq)} onToggle={() => toggle(qq)} />)}</ul>
            </section>
          )) : <p className="rounded-2xl bg-white p-5 text-sm text-ink-600 dark:bg-ink-900 dark:text-ink-300">No answers match “{q.trim()}”. Ask us directly below.</p>}
        </div>

        <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl bg-ink-900 p-5 text-white sm:flex-row sm:items-center dark:bg-ink-800">
          <LifeBuoy className="h-5 w-5 shrink-0 text-accent-300" />
          <p className="flex-1 text-sm">Still stuck? {user ? 'Open a request and the Kotka team replies in the app and by email.' : `Email ${CONTACT.support} and the Kotka team will reply.`}</p>
          {user ? <Link to="/app/support?new=1" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink-900">Contact support</Link> : <a href={`mailto:${CONTACT.support}`} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink-900">Email support</a>}
        </div>
      </div>
    </div>
  );
}
