import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Check } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { CHECKLIST_ITEMS } from '../checklist/items';
import { SUBSCORES } from '../game/format';
import { CONTACT, mailto } from '../../lib/contact';

// The landing page is dark-locked (brand black and gold) regardless of the
// app theme, so it uses explicit colours rather than dark: variants.

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => (el.dataset.shown = 'true'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.dataset.shown = 'true';
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Nav({ user, signupsOpen }) {
  const home = user ? (['admin', 'super_admin'].includes(user.role) ? '/admin/overview' : '/app/dashboard') : null;
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-6 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Kotka Trading home">
          <BrandMark size={30} />
          <span className="text-[13px] font-semibold tracking-[0.3em] text-white">KOTKA</span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-ink-300 lg:flex">
          {[['#services', 'Services'], ['#routine', 'The routine'], ['#research', 'Research'], ['#arena', 'Arena'], ['#community', 'Community'], ['#contact', 'Contact']].map(([href, label]) => (
            <a key={href} href={href} className="transition-colors hover:text-white">{label}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {home ? (
            <Button as={Link} to={home} variant="accent" size="sm" iconRight={ArrowRight}>Open Kotka</Button>
          ) : (
            <>
              <Button as={Link} to="/login" variant="ghostOnDark" size="sm">Sign in</Button>
              {signupsOpen ? (
                <Button as={Link} to="/signup" variant="accent" size="sm" className="hidden sm:inline-flex">Create free account</Button>
              ) : null}
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function Hero({ signupsOpen }) {
  return (
    <section className="relative">
      <div className="pointer-events-none absolute right-0 top-0 h-[42rem] w-[60rem] translate-x-1/3 rounded-full bg-accent-500/[0.07] blur-[120px]" aria-hidden />
      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:gap-8 lg:pb-16 lg:pt-10">
        <div className="lg:col-span-5">
          <h1 className="hero-in text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl xl:text-7xl" style={{ '--i': 0 }}>
            Discipline is <span className="text-accent-400">Freedom.</span>
          </h1>
          <p className="hero-in mt-7 max-w-[40ch] text-lg leading-relaxed text-ink-300" style={{ '--i': 1 }}>
            A professional routine for your trading: pre-trade checklist, daily risk limit, journal, research, a community of traders and a practice arena, with an AI mentor that never gives signals.
          </p>
          <div className="hero-in mt-10 flex flex-wrap items-center gap-3" style={{ '--i': 2 }}>
            {signupsOpen ? (
              <Button as={Link} to="/signup" variant="accent" size="lg" iconRight={ArrowRight} className="active:scale-[0.98]">
                Create a free account
              </Button>
            ) : null}
            <Button as={Link} to="/login" variant="onDark" size="lg" className="active:scale-[0.98]">
              Sign in
            </Button>
          </div>
        </div>

        {/* Real screenshots of Kotka (dark mode), not mock-ups. */}
        <div className="relative lg:col-span-7">
          <div className="relative mx-auto max-w-2xl lg:mr-[-8rem] lg:max-w-none">
            <div className="hero-shot rounded-2xl bg-ink-900 p-2.5 shadow-[0_40px_120px_-40px_rgba(209,168,91,0.35)] ring-1 ring-white/10 sm:p-4" style={{ '--i': 0 }}>
              <img
                src="/landing/market-pulse.webp"
                width={1600}
                height={648}
                alt="Kotka Market Intelligence: end-of-day closes and volatility for six markets, and the next official US and euro-area releases"
                className="w-full rounded-lg"
                decoding="async"
              />
            </div>
            <div
              className="hero-shot relative -mt-8 ml-auto w-[84%] rounded-2xl bg-ink-900 p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:-mt-14 lg:-ml-16 lg:mr-auto lg:w-[74%]"
              style={{ '--i': 1 }}
            >
              <img
                src="/landing/research-verdict.webp"
                width={1600}
                height={1051}
                alt="Kotka fundamental research verdict for EUR/USD with scores for each currency and the evidence behind them"
                className="w-full rounded-xl"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section className="border-t border-white/5">
      <div className="mx-auto max-w-[1400px] px-5 py-28 sm:px-8 lg:py-36">
        <p data-reveal className="max-w-5xl text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
          Kotka won&apos;t tell you what to trade. <span className="text-ink-500">It makes you prove a trade is worth taking, before you take it.</span>
        </p>
        <p data-reveal style={{ '--i': 1 }} className="mt-10 max-w-2xl text-base leading-relaxed text-ink-400">
          No signals. No copy trading. No broker. Kotka never touches your trading account or your orders.
        </p>
      </div>
    </section>
  );
}

function Ring({ value }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90" aria-hidden>
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="7" className="stroke-white/10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (value / 100) * c}
        className={clsx('transition-[stroke-dashoffset,stroke] duration-500', value >= 100 ? 'stroke-profit-400' : 'stroke-accent-400')}
      />
    </svg>
  );
}

// The same eight conditions as the Checklist page, working locally.
function ChecklistPreview() {
  const [checked, setChecked] = useState({});
  const done = CHECKLIST_ITEMS.filter((i) => checked[i.id]).length;
  const pct = Math.round((done / CHECKLIST_ITEMS.length) * 100);
  const state = pct >= 100 ? { label: 'Ready to trade', tone: 'text-profit-400' } : pct >= 60 ? { label: 'Proceed with caution', tone: 'text-amber-400' } : { label: 'Not ready', tone: 'text-ink-400' };

  return (
    <div data-reveal className="grid grid-cols-1 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/10 md:grid-cols-[1fr_13rem]">
      <ul className="order-2 divide-y divide-white/5 md:order-1">
        {CHECKLIST_ITEMS.map((item) => {
          const on = !!checked[item.id];
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))}
                className="group flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
              >
                <span
                  className={clsx(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    on ? 'border-accent-400 bg-accent-400 text-ink-950' : 'border-white/20 group-hover:border-white/40',
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                </span>
                <span>
                  <span className={clsx('block text-sm font-medium', on ? 'text-white' : 'text-ink-200')}>{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{item.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="order-1 flex flex-col items-center justify-center gap-3 border-b border-white/5 p-8 md:order-2 md:border-b-0 md:border-l">
        <div className="relative">
          <Ring value={pct} />
          <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-semibold tabular-nums text-white">{pct}%</span>
        </div>
        <p className={clsx('text-sm font-semibold', state.tone)} aria-live="polite">{state.label}</p>
        <p className="text-xs tabular-nums text-ink-500">{done} of {CHECKLIST_ITEMS.length} conditions met</p>
      </div>
    </div>
  );
}

function Routine() {
  return (
    <section id="routine" className="scroll-mt-16 border-t border-white/5">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-5 py-24 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:py-32">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <h2 data-reveal className="text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">
              Four minutes before every trade.
            </h2>
            <p data-reveal style={{ '--i': 1 }} className="mt-6 max-w-[42ch] text-base leading-relaxed text-ink-400">
              Eight conditions stand between an idea and an order. Try them: this is the same checklist you get inside Kotka.
            </p>
          </div>
        </div>
        <div className="lg:col-span-7">
          <ChecklistPreview />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:col-span-12 lg:grid-cols-12">
          <article data-reveal className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-900/70 via-ink-900 to-ink-900 p-8 ring-1 ring-accent-800/40 lg:col-span-7 lg:p-10">
            <p className="font-mono text-[5.5rem] font-semibold leading-none tracking-tight text-accent-400 sm:text-[7rem]">2R</p>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-white">A daily stop you set once.</h3>
            <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-ink-300">
              Pick your maximum daily loss in R (2R until you change it). The dashboard counts it down and warns you at three quarters of the limit.
            </p>
          </article>
          <article
            data-reveal
            style={{ '--i': 1, backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 14px)' }}
            className="flex flex-col rounded-2xl bg-ink-900 p-8 ring-1 ring-white/10 lg:col-span-5 lg:p-10"
          >
            <blockquote className="text-lg leading-snug text-ink-100 sm:text-xl">
              &ldquo;The real issue isn&apos;t the loss. It&apos;s repeating the same process flaw under emotional pressure.&rdquo;
              <footer className="mt-3 text-xs text-ink-500">Kotka AI journal review of a test account</footer>
            </blockquote>
            <h3 className="mt-auto pt-10 text-xl font-semibold tracking-tight text-white">A journal that answers back.</h3>
            <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-ink-300">
              Log the trade, the emotion and the mistake. Kotka AI reviews the process against your recent record, never the direction.
            </p>
          </article>
          <article data-reveal style={{ '--i': 2 }} className="rounded-2xl bg-ink-900 p-8 ring-1 ring-white/10 lg:col-span-12 lg:p-10">
            <h3 className="text-xl font-semibold tracking-tight text-white">Numbers a prop desk would recognise.</h3>
            <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              {['Win rate', 'Expectancy', 'Profit factor', 'Checklist compliance', 'Rule breaks', 'Emotion before losses'].map((m) => (
                <span key={m} className="font-mono text-lg text-ink-200 sm:text-2xl">{m}</span>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Research() {
  const sources = ['IMF', 'BIS', 'Federal Reserve', 'European Central Bank', 'FRED', 'BLS', 'BEA', 'Eurostat'];
  return (
    <section id="research" className="scroll-mt-16 overflow-hidden border-t border-white/5">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 px-5 py-24 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:py-32">
        <figure data-reveal className="order-2 lg:order-1 lg:col-span-7">
          <img
            src="/landing/research-verdict.webp"
            width={1600}
            height={1051}
            loading="lazy"
            decoding="async"
            alt="Kotka fundamental research verdict for EUR/USD"
            className="w-full rounded-2xl ring-1 ring-white/10"
          />
          <figcaption className="mt-3 text-xs text-ink-500">The EUR/USD verdict as it appeared in Kotka on 26 September 2026.</figcaption>
        </figure>
        <div className="order-1 lg:order-2 lg:col-span-5">
          <p data-reveal className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-400">Fundamental research</p>
          <h2 data-reveal style={{ '--i': 1 }} className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">
            Macro research you can check line by line.
          </h2>
          <p data-reveal style={{ '--i': 2 }} className="mt-6 max-w-[44ch] text-base leading-relaxed text-ink-400">
            Scores come from IMF, central bank and official statistics data. Every figure links its source, and the AI&apos;s explanation is checked against the numbers.
          </p>
          <ul data-reveal style={{ '--i': 3 }} className="mt-10 flex flex-wrap gap-2" aria-label="Sources include">
            {sources.map((s) => (
              <li key={s} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-ink-200">{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Mentor() {
  return (
    <section id="mentor" className="scroll-mt-16 border-t border-white/5">
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-8 lg:py-32">
        <h2 data-reveal className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">
          Ask for a signal. Get a question back.
        </h2>
        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div data-reveal className="lg:col-span-5">
            <p className="text-xs font-medium text-ink-500">Trader</p>
            <p className="mt-3 text-lg leading-relaxed text-ink-300">
              EUR/USD just broke above yesterday&apos;s high at the London open. I want to go long now and risk 3% because this looks like a clean breakout.
            </p>
          </div>
          <div data-reveal style={{ '--i': 1 }} className="border-l-2 border-accent-500/60 pl-6 lg:col-span-7 lg:pl-10">
            <p className="flex items-center gap-2 text-xs font-medium text-accent-400">
              <BrandMark size={18} /> Kotka AI
            </p>
            <p className="mt-3 text-xl leading-relaxed text-white sm:text-2xl">
              You&apos;re risking 3% on a breakout that hasn&apos;t even closed the 15m candle. Your own stats show you lose when you enter before the candle closes. What makes you think this time is different, given your win rate on London-session breakouts is 25%?
            </p>
            <p className="mt-6 text-xs leading-relaxed text-ink-500">
              A real Kotka AI reply to a test account, lightly trimmed. It read that account&apos;s journal before answering.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Real facts for the page, read from the same settings and lists the app uses.
// Until they load (or if they can't), the parts that need them stay hidden.
function useShowcase() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/app/showcase')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d ?? false))
      .catch(() => live && setData(false));
    return () => { live = false; };
  }, []);
  return data;
}

const SECTION_TITLE = 'text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl';
const EYEBROW = 'text-xs font-semibold uppercase tracking-[0.18em] text-accent-400';

// Every Kotka service, grouped by when a trader reaches for it.
const SERVICES = [
  ['Before the trade', [
    ['Pre-trade checklist', 'Eight conditions to meet before any order.', '#routine'],
    ['Market Intelligence', 'End-of-day closes and volatility for major markets, and the next official US and euro-area releases.'],
    ['Fundamental Research', 'Currency verdicts scored from IMF, central-bank and official statistics, with every figure sourced.', '#research'],
    ['Kotka AI', 'Questions your setup and reads a chart you upload. It never gives signals.', '#mentor'],
    ['Calculators', 'Risk, lot size, position size, pip value, risk/reward, margin, profit, compounding and drawdown.'],
  ]],
  ['While you trade', [
    ['Daily loss limit', 'Set once in R. The dashboard counts it down and warns you at three quarters.', '#routine'],
    ['Alerts', 'Unusual moves in your markets, event reminders and central-bank releases, on your phone or computer.'],
    ['The Kotka app', 'Install it free on Android, iPhone or your computer, straight from the browser.', '/install'],
  ]],
  ['After the trade', [
    ['Journal', 'Log the trade, the emotion and the mistake. Kotka AI reviews the process, never the direction.', '#routine'],
    ['Analytics', 'Win rate, expectancy, profit factor, checklist compliance and rule breaks.', '#routine'],
    ['Goal Room', 'Goals, weekday check-ins and achievements to share, with your profit hidden unless you choose.', '#community'],
  ]],
  ['With other traders', [
    ['Community', 'A room for every market, trade ideas, events, news and direct messages.', '#community'],
    ['Trading Arena', 'Practise on Kotka’s own markets and get a score for your process, not only your profit.', '#arena'],
  ]],
];

function ServiceName({ name, to }) {
  if (!to) return <span className="text-base font-medium text-white">{name}</span>;
  const cls = 'group inline-flex items-center gap-1.5 text-base font-medium text-white transition-colors hover:text-accent-400';
  const inner = <>{name}<ArrowRight className="h-3.5 w-3.5 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-400" /></>;
  return to.startsWith('#') ? <a href={to} className={cls}>{inner}</a> : <Link to={to} className={cls}>{inner}</Link>;
}

function Services() {
  const count = SERVICES.reduce((n, [, items]) => n + items.length, 0);
  return (
    <section id="services" className="scroll-mt-16 border-t border-white/5">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-5 py-24 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:py-32">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <p data-reveal className={EYEBROW}>Kotka services</p>
            <h2 data-reveal style={{ '--i': 1 }} className={clsx('mt-4', SECTION_TITLE)}>Everything in one place, in the order you trade.</h2>
            <p data-reveal style={{ '--i': 2 }} className="mt-6 max-w-[40ch] text-base leading-relaxed text-ink-400">
              {count} services, all in your free account. Behind them: two-step sign-in, a <Link to="/help" className="text-ink-200 underline-offset-4 hover:underline">help centre</Link> with direct support, and a <Link to="/status" className="text-ink-200 underline-offset-4 hover:underline">live status page</Link>.
            </p>
          </div>
        </div>
        <div className="space-y-14 lg:col-span-8">
          {SERVICES.map(([phase, items], i) => (
            <div key={phase} data-reveal style={{ '--i': i }}>
              <p className="flex items-baseline gap-3 border-b border-white/10 pb-3">
                <span className="font-mono text-sm tabular-nums text-accent-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-200">{phase}</span>
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-10">
                {items.map(([name, text, to]) => (
                  <li key={name} className="border-b border-white/5 py-5">
                    <ServiceName name={name} to={to} />
                    <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ink-400">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// What the Arena's scorer records against a trader (the same rules as Learn).
const COUNTED = ['Trading without a stop loss', 'Risking too much on one trade', 'Moving a stop further away', 'Adding to a losing position', 'Trading again straight after a loss', 'Sizing up after a loss'];
const SCORE_LABEL = Object.fromEntries(SUBSCORES);

function Arena({ showcase, home, signupsOpen }) {
  const scoring = showcase?.scoring;
  const pairs = showcase?.pairs;
  return (
    <section id="arena" className="scroll-mt-16 overflow-hidden border-t border-white/5">
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p data-reveal className={EYEBROW}>Trading Arena</p>
            <h2 data-reveal style={{ '--i': 1 }} className={clsx('mt-4', SECTION_TITLE)}>Same market. Same information. Different decisions.</h2>
            <p data-reveal style={{ '--i': 2 }} className="mt-6 max-w-[44ch] text-base leading-relaxed text-ink-400">
              Practise on Kotka&apos;s own synthetic markets, priced fresh for every match so nobody can know what comes next. Trade with a full chart, state your reason, then get a Kotka Performance Score and a report on how you traded.
            </p>
            <p data-reveal style={{ '--i': 3 }} className="mt-4 max-w-[44ch] text-base leading-relaxed text-ink-400">
              When you&apos;re ready, take on another trader in the same market. The leaderboard ranks average Kotka Score, never profit.
            </p>
            <div data-reveal style={{ '--i': 4 }} className="mt-9 flex flex-wrap gap-3">
              {home ? (
                <Button as={Link} to="/app/game" variant="accent" iconRight={ArrowRight}>Open the Arena</Button>
              ) : signupsOpen ? (
                <Button as={Link} to="/signup" variant="accent" iconRight={ArrowRight}>Practise free</Button>
              ) : null}
            </div>
          </div>
          <figure data-reveal className="lg:col-span-7">
            <img
              src="/landing/arena-practice.webp"
              width={1600}
              height={1015}
              loading="lazy"
              decoding="async"
              alt="A Kotka Trading Arena practice match on KOL/USD: a candlestick chart with drawing tools and indicators, and a panel to open a position with a stop loss, take profit and your reason"
              className="w-full rounded-2xl ring-1 ring-white/10"
            />
            <figcaption className="mt-3 text-xs text-ink-500">A practice match on KOL/USD, one of Kotka&apos;s synthetic markets, on 1 October 2026.</figcaption>
          </figure>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {scoring ? (
            <article data-reveal className="rounded-2xl bg-ink-900 p-8 ring-1 ring-white/10 lg:col-span-5 lg:p-10">
              <h3 className="text-xl font-semibold tracking-tight text-white">How a match is scored</h3>
              <ul className="mt-7 space-y-5">
                {scoring.map(({ key, weight }) => (
                  <li key={key}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-ink-200">{SCORE_LABEL[key] ?? key}</span>
                      <span className="font-mono tabular-nums text-white">{weight}%</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div className="h-1.5 rounded-full bg-accent-400" style={{ width: `${weight}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-7 text-xs leading-relaxed text-ink-500">Read live from Kotka&apos;s scoring settings: the weights the next match will use.</p>
            </article>
          ) : null}
          <article data-reveal style={{ '--i': 1 }} className={clsx('rounded-2xl bg-ink-900 p-8 ring-1 ring-white/10 lg:p-10', scoring ? 'lg:col-span-7' : 'lg:col-span-12')}>
            <h3 className="text-xl font-semibold tracking-tight text-white">What it counts against you</h3>
            <ul className="mt-6 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {COUNTED.map((c) => (
                <li key={c} className="flex items-start gap-3 border-b border-white/5 py-3 text-sm text-ink-200">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-loss-400" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
            {pairs?.length ? (
              <>
                <p className="mt-8 text-sm text-ink-400">{pairs.length} Kotka markets to practise on</p>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Kotka markets">
                  {pairs.map((p) => (
                    <li key={p.symbol} className="rounded-lg border border-white/10 px-2.5 py-1 font-mono text-xs text-ink-200">{p.symbol}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
}

function Community({ showcase }) {
  const rooms = showcase?.rooms;
  const byMarket = rooms ? rooms.reduce((m, r) => ({ ...m, [r.market]: [...(m[r.market] ?? []), r.symbol] }), {}) : null;
  return (
    <section id="community" className="scroll-mt-16 border-t border-white/5">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-5 py-24 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:py-32">
        <div className="lg:col-span-7">
          <p data-reveal className={EYEBROW}>Community</p>
          <h2 data-reveal style={{ '--i': 1 }} className={clsx('mt-4', SECTION_TITLE)}>A room for every market you trade.</h2>
          <p data-reveal style={{ '--i': 2 }} className="mt-6 max-w-[52ch] text-base leading-relaxed text-ink-400">
            Each room has the latest close, the official events and news for that market, and a live chat. Share trade ideas, follow traders whose process you respect, and message them directly, voice notes included.
          </p>
          {byMarket ? (
            <dl data-reveal style={{ '--i': 3 }} className="mt-10 space-y-5">
              {Object.entries(byMarket).map(([market, symbols]) => (
                <div key={market} className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr] sm:gap-6">
                  <dt className="pt-1 text-sm text-ink-500">{market}</dt>
                  <dd className="flex flex-wrap gap-2">
                    {symbols.map((sym) => <span key={sym} className="rounded-lg border border-white/10 px-2.5 py-1 font-mono text-xs text-ink-200">{sym}</span>)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <article data-reveal style={{ '--i': 1 }} className="self-start rounded-2xl bg-gradient-to-br from-accent-900/60 via-ink-900 to-ink-900 p-8 ring-1 ring-accent-800/40 lg:col-span-5 lg:p-10">
          <p className={EYEBROW}>Goal Room</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">Goals you share on your terms.</h3>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-ink-300">
            {[
              'Set a goal and check in on weekdays. Weekends never break a streak.',
              'Recognition comes from consistency and discipline, never from ranking profit.',
              'Share an achievement to the Community or as a link. Profit, amounts and trades stay off it unless you turn them on.',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" strokeWidth={2.5} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function Closing({ signupsOpen, paidPlansEnabled }) {
  return (
    <section className="border-t border-white/5">
      <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-10 px-5 py-24 sm:px-8 lg:flex-row lg:items-end lg:py-28">
        <div>
          <h2 data-reveal className="text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl">
            {paidPlansEnabled ? 'Start with a free account.' : 'Free while we build it.'}
          </h2>
          <p data-reveal style={{ '--i': 1 }} className="mt-5 max-w-[46ch] text-base leading-relaxed text-ink-400">
            {paidPlansEnabled
              ? 'Create an account in a minute, then verify your identity and you are in.'
              : 'Every feature is included. No card, no trial clock. Sign up, confirm your identity, and start your routine.'}
          </p>
        </div>
        <div data-reveal style={{ '--i': 2 }} className="flex flex-wrap gap-3">
          {signupsOpen ? (
            <Button as={Link} to="/signup" variant="accent" size="lg" iconRight={ArrowRight} className="active:scale-[0.98]">Create a free account</Button>
          ) : (
            <p className="text-sm text-ink-400">New sign-ups are paused right now.</p>
          )}
          <Button as={Link} to="/login" variant="onDark" size="lg">Sign in</Button>
          <Link to="/install" className="inline-flex items-center gap-1.5 self-center px-2 text-sm font-medium text-ink-300 transition-colors hover:text-accent-400">
            Get the app <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const { signupsOpen, paidPlansEnabled, supportEmail } = useAppConfig();
  const showcase = useShowcase();
  const home = user ? (['admin', 'super_admin'].includes(user.role) ? '/admin/overview' : '/app/dashboard') : null;
  useReveal();

  return (
    <div className="on-dark min-h-[100dvh] overflow-x-clip bg-ink-950 text-ink-100 antialiased">
      <Nav user={user} signupsOpen={signupsOpen} />
      <main>
        <Hero signupsOpen={signupsOpen} />
        <Statement />
        <Services />
        <Routine />
        <Research />
        <Mentor />
        <Arena showcase={showcase} home={home} signupsOpen={signupsOpen} />
        <Community showcase={showcase} />
        <Closing signupsOpen={signupsOpen} paidPlansEnabled={paidPlansEnabled} />
      </main>
      <footer id="contact" className="scroll-mt-16 border-t border-white/5">
        <div className="mx-auto max-w-[1400px] px-5 py-12 sm:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="self-start lg:col-span-4">
              <div className="flex items-center gap-3">
                <BrandMark size={26} />
                <span className="text-[12px] font-semibold tracking-[0.3em] text-white">KOTKA</span>
                <span className="text-xs text-ink-500">Discipline is Freedom.</span>
              </div>
              <nav aria-label="More" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <Link to="/install" className="text-ink-200 hover:text-accent-400">Get the app</Link>
                <Link to="/help" className="text-ink-200 hover:text-accent-400">Help</Link>
                <Link to="/status" className="text-ink-200 hover:text-accent-400">Status</Link>
              </nav>
            </div>
            <dl className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2 lg:col-span-8 xl:grid-cols-4">
              {[
                ['Help with your account', supportEmail],
                ['Questions about Kotka', CONTACT.info],
                ['Feedback and ideas', CONTACT.hello],
                ['Partnerships and press', CONTACT.contact],
              ].map(([label, address]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-ink-500">{label}</dt>
                  <dd className="mt-1.5">
                    <a href={mailto(address)} className="break-all text-sm text-ink-200 transition-colors hover:text-accent-400">{address}</a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-10 border-t border-white/5 pt-6">
            <p className="max-w-3xl text-xs leading-relaxed text-ink-500">
              Kotka is an educational and analytical tool. It does not give investment advice or trade signals, and trading carries a risk of loss. &copy; {new Date().getFullYear()} Kotka Trading.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
