// Learn: how Kotka judges a match (straight from the live admin settings),
// what your own matches show, the behaviours Kotka watches for, and what
// each kind of market teaches. Every number is either a live rule or your
// own recorded play; nothing is sample data.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import {
  GraduationCap, Lightbulb, CheckCircle2, AlertTriangle, Info, Dna, BookOpen, Swords, Scale, ShieldCheck, Target, Crosshair, Repeat, TrendingUp,
  ChevronDown, Award, Lock, Eye, Sparkles,
} from 'lucide-react';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import { useTheme } from '../../context/ThemeContext';
import { CHART_COLORS } from '../../lib/chartColors';
import GameNav from './GameNav';
import { startPractice } from './pairs';
import { SUBSCORES, virtual } from './format';

// Categorical colours in a fixed order (validated for colour-blind separation).
const CAT = {
  outcome: { light: '#2a78d6', dark: '#3987e5', icon: TrendingUp },
  risk: { light: '#eb6834', dark: '#d95926', icon: ShieldCheck },
  decision: { light: '#1baf7a', dark: '#199e70', icon: Crosshair },
  execution: { light: '#eda100', dark: '#c98500', icon: Target },
  consistency: { light: '#e87ba4', dark: '#d55181', icon: Repeat },
};
const LABEL = Object.fromEntries(SUBSCORES);
const AREA_LABEL = { risk: 'Risk', decision: 'Decision', execution: 'Execution', consistency: 'Consistency' };
const TONE = { good: [CheckCircle2, 'text-profit-600 dark:text-profit-400'], bad: [AlertTriangle, 'text-loss-600 dark:text-loss-400'], neutral: [Info, 'text-ink-400'] };
const pctOf = (weights) => {
  const total = Object.values(weights).reduce((s, x) => s + x, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10]));
};
const when = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export function DnaCard({ dna, own = true }) {
  if (!dna) return null;
  if (!dna.ready) {
    return (
      <EmptyState
        size="section"
        icon={Dna}
        title="Trader DNA isn’t ready yet"
        description={own ? `It describes how you trade from at least ${dna.need} matches where you traded. You have ${dna.have} so far; practice matches count.` : `It appears after ${dna.need} matches where they traded.`}
      />
    );
  }
  const rows = [
    ['Primary style', dna.style ?? 'Mixed approaches'],
    ['Strength', dna.strength ? `${dna.strength.label} (${dna.strength.score})` : '—'],
    ['Weakness', dna.weakness ? `${dna.weakness.label} (${dna.weakness.score})` : '—'],
    ['Strongest market', dna.strongestMarket ? `${dna.strongestMarket.name} (${dna.strongestMarket.avgScore})` : 'Not enough matches in one kind yet'],
    ['Weakest market', dna.weakestMarket ? `${dna.weakestMarket.name} (${dna.weakestMarket.avgScore})` : '—'],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wide text-ink-400">{k}</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-900 dark:text-ink-50">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700 dark:bg-ink-800/60 dark:text-ink-200">
        <span className="font-medium">Observed pattern: </span>
        {own ? dna.pattern.text : dna.pattern.text.replace(/^You /, 'They ').replace(/^Your /, 'Their ')}
        {dna.pattern.matches ? <span className="text-ink-400"> ({dna.pattern.matches} of {dna.matches} matches)</span> : null}
      </p>
      <p className="text-xs text-ink-400">From {dna.matches} matches{own ? ' where you traded' : ''}. It describes trading behaviour only, never personality.</p>
    </div>
  );
}

function Chip({ on, onClick, children, color }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors', on ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900' : 'border-ink-200 text-ink-600 hover:border-ink-400 dark:border-ink-700 dark:text-ink-300')}>
      {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </button>
  );
}

// The five parts of the score, sized by their live weights.
function Anatomy({ weights, dark }) {
  const pct = pctOf(weights);
  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={SUBSCORES.map(([k, l]) => `${l} ${pct[k]}%`).join(', ')}>
        {SUBSCORES.filter(([k]) => pct[k] > 0).map(([k]) => (
          <span key={k} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${pct[k]}%`, background: CAT[k][dark ? 'dark' : 'light'] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {SUBSCORES.map(([k, label]) => (
          <li key={k} className="flex items-center gap-1.5 text-xs text-ink-600 dark:text-ink-300">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAT[k][dark ? 'dark' : 'light'] }} />
            {label} <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{pct[k]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Explorer({ rules, dark }) {
  const [open, setOpen] = useState('risk');
  const pct = pctOf(rules.weights);
  const c = rules.categories[open];
  const Icon = CAT[open].icon;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <ul className="flex gap-2 overflow-x-auto scrollbar-thin lg:flex-col lg:overflow-visible" role="tablist" aria-label="Parts of the score">
        {SUBSCORES.map(([k, label]) => {
          const I = CAT[k].icon;
          return (
            <li key={k} className="shrink-0" role="presentation">
              <button type="button" role="tab" id={`part-tab-${k}`} aria-controls="part-panel" aria-selected={open === k} onClick={() => setOpen(k)} className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', open === k ? 'border-ink-900 bg-ink-900 text-white dark:border-accent-500/70 dark:bg-ink-800 dark:text-white' : 'border-ink-100 text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:text-ink-200 dark:hover:border-ink-600')}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${CAT[k][dark ? 'dark' : 'light']}22`, color: CAT[k][dark ? 'dark' : 'light'] }}><I className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                <span className="text-sm font-semibold tabular-nums">{pct[k]}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div id="part-panel" className="rounded-2xl border border-ink-100 p-5 dark:border-ink-800" role="tabpanel" aria-labelledby={`part-tab-${open}`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${CAT[open][dark ? 'dark' : 'light']}22`, color: CAT[open][dark ? 'dark' : 'light'] }}><Icon className="h-5 w-5" /></span>
          <div>
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">{LABEL[open]} · {pct[open]}% of the score</h3>
            <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">{c.measures}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-profit-600 dark:text-profit-400"><CheckCircle2 className="h-3.5 w-3.5" /> Raises it</p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700 dark:text-ink-200">{c.up.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-profit-500" />{x}</li>)}</ul>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-loss-600 dark:text-loss-400"><AlertTriangle className="h-3.5 w-3.5" /> Lowers it</p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700 dark:text-ink-200">{c.down.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-loss-500" />{x}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// A tool: move the parts and see how today's weights combine them.
function Calculator({ rules, dark, start }) {
  const [v, setV] = useState(start);
  const total = Object.values(rules.weights).reduce((s, x) => s + x, 0) || 1;
  const score = Math.round((SUBSCORES.reduce((s, [k]) => s + (v[k] ?? 0) * (rules.weights[k] ?? 0), 0) / total) * 10) / 10;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
      <div className="space-y-4">
        {SUBSCORES.map(([k, label]) => (
          <div key={k}>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`calc-${k}`} className="flex items-center gap-1.5 font-medium text-ink-700 dark:text-ink-200"><span className="h-2 w-2 rounded-full" style={{ background: CAT[k][dark ? 'dark' : 'light'] }} />{label}</label>
              <span className="tabular-nums text-ink-500 dark:text-ink-400">{v[k]} × {rules.weights[k]}%</span>
            </div>
            <input id={`calc-${k}`} type="range" min={0} max={100} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: Number(e.target.value) }))} className="mt-1 w-full" style={{ accentColor: CAT[k][dark ? 'dark' : 'light'] }} />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl bg-ink-900 p-6 text-center text-white dark:bg-ink-800">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-300">Kotka Score</p>
        <p className="mt-1 text-5xl font-semibold tabular-nums tracking-tight">{score}</p>
        <p className="mt-3 text-xs leading-relaxed text-ink-300">Two scores within {rules.drawTolerance} point{rules.drawTolerance === 1 ? '' : 's'} of each other are a draw.</p>
      </div>
    </div>
  );
}

function Progress({ history, dark }) {
  const [show, setShow] = useState(['total']);
  const grid = dark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light;
  const tick = dark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light;
  const data = history.map((h, i) => ({ n: i + 1, label: new Date(h.at).toLocaleDateString([], { day: 'numeric', month: 'short' }), total: h.score, ...h.subscores, outcome: h.outcome, market: h.market, pair: h.pair, mode: h.mode }));
  const toggle = (k) => setShow((s) => (s.includes(k) ? (s.length > 1 ? s.filter((x) => x !== k) : s) : [...s, k]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip on={show.includes('total')} onClick={() => toggle('total')} color={dark ? '#EDE8DD' : '#26231F'}>Kotka Score</Chip>
        {SUBSCORES.map(([k, label]) => (
          <Chip key={k} on={show.includes(k)} onClick={() => toggle(k)} color={CAT[k][dark ? 'dark' : 'light']}>{label}</Chip>
        ))}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: tick }} minTickGap={16} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: tick }} />
            <ReferenceLine y={50} stroke={grid} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: `1px solid ${grid}`, fontSize: 12, background: dark ? '#0C0C0E' : '#FFFFFF', color: dark ? '#EDE8DD' : '#26231F' }}
              labelFormatter={(_, p) => { const d = p?.[0]?.payload; return d ? `${d.label} · ${d.mode === 'practice' ? 'Practice' : d.outcome === 'win' ? 'Won' : d.outcome === 'loss' ? 'Lost' : d.outcome === 'draw' ? 'Draw' : ''}${d.pair ? ` · ${d.pair}` : ''}${d.market ? ` · ${d.market}` : ''}` : ''; }}
              formatter={(value, name) => [value, name === 'total' ? 'Kotka Score' : LABEL[name]]}
            />
            {show.includes('total') ? <Line type="monotone" dataKey="total" stroke={dark ? '#EDE8DD' : '#26231F'} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /> : null}
            {SUBSCORES.filter(([k]) => show.includes(k)).map(([k]) => (
              <Line key={k} type="monotone" dataKey={k} stroke={CAT[k][dark ? 'dark' : 'light']} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Glossary() {
  const [open, setOpen] = useState(null);
  const items = [
    ['Thesis', 'What you expect the market to do and why, declared before each new position: your view, your reasons and how confident you are. Kotka checks the reasons against the chart at the moment you enter.'],
    ['Stop loss', 'The price where your idea is proven wrong and the position closes. Set it before you enter, and move it only in your favour.'],
    ['Risk per trade', 'How much of your capital you lose if the stop is hit. It depends on your size and the distance to your stop, so a wide stop needs a smaller position.'],
    ['Reward to risk', 'The distance to your target divided by the distance to your stop. A 2 : 1 trade can lose more often than it wins and still come out ahead.'],
    ['Drawdown', 'The largest fall in your capital from a high point during the match. Small drawdowns mean you protected what you had.'],
    ['Thesis drift', 'Staying in a trade after the reason you entered has been proven wrong, usually hoping it comes back. It’s one of the most common ways a small loss becomes a large one.'],
    ['Virtual capital', 'The game money you trade with inside a match. It has no cash value and is separate from your wallet; only the stake is real money.'],
    ['Draw', 'When the two Kotka Scores are within the draw tolerance, neither player wins: the prize pool, after the fee, is split equally.'],
  ];
  return (
    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
      {items.map(([term, text]) => (
        <li key={term}>
          <button type="button" onClick={() => setOpen(open === term ? null : term)} aria-expanded={open === term} className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-ink-900 dark:text-ink-50">
            {term}
            <ChevronDown className={clsx('h-4 w-4 shrink-0 text-ink-400 transition-transform', open === term && 'rotate-180')} />
          </button>
          {open === term ? <p className="pb-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{text}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function Learn() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [area, setArea] = useState('all');
  const [family, setFamily] = useState('all');
  useEffect(() => {
    api.get('/game/learn').then(setData).catch((err) => setError(err.message));
  }, []);
  const practice = () => startPractice(navigate).catch((err) => toast(err.message, { tone: 'error' }));

  // The calculator starts from your own average parts when you have matches, otherwise from the middle.
  const start = useMemo(() => {
    const h = data?.progress.history ?? [];
    return Object.fromEntries(SUBSCORES.map(([k]) => {
      const vals = h.map((x) => x.subscores?.[k]).filter((x) => x != null);
      return [k, vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : 50];
    }));
  }, [data]);

  if (error) return <div className="space-y-6"><GameNav /><EmptyState icon={BookOpen} title="Learn didn’t load" description={error} /></div>;
  if (!data) return <div className="space-y-6"><GameNav /><div className="h-[36rem] animate-pulse rounded-2xl bg-white dark:bg-ink-900" /></div>;

  const { rules, progress } = data;
  const history = progress.history;
  const avgScore = history.length ? Math.round((history.reduce((s, h) => s + h.score, 0) / history.length) * 10) / 10 : null;
  const families = ['all', ...new Set(data.lessons.map((l) => l.family).filter(Boolean))];
  const lessons = data.lessons.filter((l) => family === 'all' || l.family === family);
  const behaviours = data.behaviours.filter((b) => area === 'all' || b.area === area);
  const earned = data.badges.filter((b) => b.awardedAt).length;

  return (
    <div className="space-y-8">
      <GameNav />

      {/* Hero */}
      <section className="on-dark relative overflow-hidden rounded-3xl bg-ink-900 text-white dark:bg-ink-950 dark:ring-1 dark:ring-ink-800">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Kotka Trading · Learn</p>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Judge the decision,<br className="hidden sm:block" /> not just the result.</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-300 sm:text-base">The outcome tells you what happened. The process tells you how good the decision was. Here is exactly how Kotka scores a match, and what your own matches say about how you trade.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="accent" icon={GraduationCap} onClick={practice}>Practise for free</Button>
              <Button as={Link} to="/app/game" variant="onDark" icon={Swords}>Enter the Arena</Button>
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-400">Your process so far</p>
            {history.length ? (
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <div><dt className="text-[11px] text-ink-400">Matches</dt><dd className="text-2xl font-semibold tabular-nums">{progress.matches}</dd></div>
                <div><dt className="text-[11px] text-ink-400">Avg score</dt><dd className="text-2xl font-semibold tabular-nums">{avgScore}</dd></div>
                <div><dt className="text-[11px] text-ink-400">Badges</dt><dd className="text-2xl font-semibold tabular-nums">{earned}<span className="text-sm text-ink-400">/{data.badges.length}</span></dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-300">No matches yet. Play one practice match and your scores, patterns and Trader DNA start filling in here.</p>
            )}
            {data.dna?.ready && data.dna.strength ? <p className="mt-4 text-xs text-ink-300"><span className="text-ink-400">Strongest area:</span> {data.dna.strength.label} · <span className="text-ink-400">work on:</span> {data.dna.weakness?.label}</p> : null}
          </div>
        </div>
      </section>

      {/* How Kotka judges a match: live rules */}
      <Card>
        <CardHeader
          title="How Kotka judges a match"
          subtitle={`Five parts, weighted by the rules Kotka sets today${rules.updatedAt ? ` (last changed ${when(rules.updatedAt)})` : ''}. New matches use these; a match keeps the rules it started with.`}
          action={<Scale className="h-4 w-4 text-ink-300" />}
        />
        <CardBody className="space-y-8">
          <div className="space-y-3">
            <Anatomy weights={rules.weights} dark={dark} />
            {rules.categories.credit ? <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">{rules.categories.credit}</p> : null}
          </div>
          <Explorer rules={rules} dark={dark} />
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink-900 dark:text-ink-50">Try it</h3>
            <p className="mb-4 text-sm text-ink-500 dark:text-ink-400">{history.length ? 'The sliders start at your own average for each part. Move them to see how the weights turn parts into one score.' : 'Move the sliders to see how the weights turn the five parts into one score.'}</p>
            <Calculator rules={rules} dark={dark} start={start} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              ['Same result, different score', 'Two traders can both finish up 10%. One risked 2% with a stop and waited for confirmation; the other risked 30% with no stop and got lucky. Their scores are not the same.'],
              ['Good process can still lose', 'A sound idea, sensible risk and a clean exit can still lose money when the market goes the other way. Kotka credits the process, not only the result.'],
              ['You can’t win without trading', `Staying out is a valid decision, but there’s nothing to credit: no trades scores a neutral 50, and a player who doesn’t really trade can’t win a competition; at best it’s a draw.${rules.noTradeRefund ? ' If neither player trades, both stakes come back in full.' : ''}`],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl bg-ink-50 p-5 dark:bg-ink-800/50">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{d}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Your progress: your own matches */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Your scores over time" subtitle={history.length ? `${history.length === 1 ? 'Your one scored match so far' : `Your last ${history.length} scored matches, oldest on the left`}. Tap a part to compare.` : 'Your scores appear here after your first match.'} />
          <CardBody>
            {history.length >= 2 ? (
              <Progress history={history} dark={dark} />
            ) : (
              <EmptyState size="section" icon={TrendingUp} title={history.length ? 'One match so far' : 'No matches yet'} description="A trend needs at least two matches. Practice matches are free and count." action={<Button size="sm" onClick={practice}>Practise now</Button>} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="What your matches show" subtitle="From your recent matches where you traded. Each point appears only when your play shows it." action={<Lightbulb className="h-4 w-4 text-ink-300" />} />
          <CardBody>
            {data.insights.insights.length ? (
              <ul className="space-y-3">
                {data.insights.insights.map((i) => {
                  const [Icon, tone] = TONE[i.tone] ?? TONE.neutral;
                  return (
                    <li key={i.text} className="flex gap-3 text-sm text-ink-700 dark:text-ink-200">
                      <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', tone)} />
                      <span>{i.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState size="section" icon={Lightbulb} title="Nothing to show yet" description={data.insights.have < data.insights.need ? `Insights need at least ${data.insights.need} matches where you traded. You have ${data.insights.have}.` : 'No clear pattern across your recent matches yet. Keep playing and this fills in.'} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your Trader DNA" subtitle="How you trade, described from the decisions you’ve made." action={<Dna className="h-4 w-4 text-ink-300" />} />
        <CardBody>
          <DnaCard dna={data.dna} />
        </CardBody>
      </Card>

      {/* Behaviours */}
      <Card>
        <CardHeader title="What Kotka watches for" subtitle={`Every behaviour the scorer records, with today’s thresholds. ${progress.recentTraded ? `Counts are from ${progress.recentTraded === 1 ? 'the one match' : `your last ${progress.recentTraded} matches`} where you traded.` : 'Once you’ve traded, you’ll see how often each one shows up in your matches.'}`} action={<Eye className="h-4 w-4 text-ink-300" />} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={area === 'all'} onClick={() => setArea('all')}>All</Chip>
            {Object.entries(AREA_LABEL).map(([k, l]) => <Chip key={k} on={area === k} onClick={() => setArea(k)} color={CAT[k][dark ? 'dark' : 'light']}>{l}</Chip>)}
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {behaviours.map((b) => (
              <li key={b.key} className={clsx('rounded-xl border p-4', b.yours ? 'border-loss-500/30 bg-loss-50/50 dark:bg-loss-500/5' : 'border-ink-100 dark:border-ink-800')}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{b.title}</p>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: `${CAT[b.area][dark ? 'dark' : 'light']}22`, color: CAT[b.area][dark ? 'dark' : 'light'] }}>{AREA_LABEL[b.area]}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{b.how}</p>
                {progress.recentTraded ? <p className={clsx('mt-2 text-xs font-medium', b.yours ? 'text-loss-600 dark:text-loss-400' : 'text-profit-600 dark:text-profit-400')}>{b.yours ? (progress.recentTraded === 1 ? 'Seen in your last match' : `Seen in ${b.yours} of your last ${progress.recentTraded} matches`) : 'Not seen in your recent matches'}</p> : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Markets */}
      <Card>
        <CardHeader title="What each kind of market teaches" subtitle="Every match is one of these. You find out which one in the report after the match." action={<BookOpen className="h-4 w-4 text-ink-300" />} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {families.map((f) => <Chip key={f} on={family === f} onClick={() => setFamily(f)}>{f === 'all' ? 'All markets' : f}</Chip>)}
          </div>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lessons.map((l) => (
              <li key={l.key} className="flex flex-col rounded-2xl border border-ink-100 p-5 dark:border-ink-800">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-ink-900 dark:text-ink-50">{l.name}</p>
                    {l.family ? <p className="text-[11px] uppercase tracking-wide text-ink-400">{l.family}</p> : null}
                  </div>
                  {l.yours ? <span className="text-right"><span className="block text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">{l.yours.avgScore}</span><span className="block text-[10px] uppercase tracking-wide text-ink-400">{l.yours.matches} match{l.yours.matches === 1 ? '' : 'es'}</span></span> : <span className="text-[11px] text-ink-400">Not played yet</span>}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-700 dark:text-ink-200">{l.lesson}</p>
                <dl className="mt-4 space-y-2 border-t border-ink-100 pt-3 text-xs leading-relaxed dark:border-ink-800">
                  <div><dt className="font-semibold text-ink-900 dark:text-ink-50">Watch for</dt><dd className="text-ink-600 dark:text-ink-300">{l.watch}</dd></div>
                  <div><dt className="font-semibold text-ink-900 dark:text-ink-50">Common mistake</dt><dd className="text-ink-600 dark:text-ink-300">{l.mistake}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Badges" subtitle={`${earned} of ${data.badges.length} earned. Each one comes from something you actually did in matches.`} action={<Award className="h-4 w-4 text-ink-300" />} />
          <CardBody>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.badges.map((b) => (
                <li key={b.key} className={clsx('flex gap-3 rounded-xl border p-3', b.awardedAt ? 'border-accent-500/30 bg-accent-500/5' : 'border-ink-100 opacity-70 dark:border-ink-800')}>
                  <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', b.awardedAt ? 'bg-accent-500/15 text-accent-600' : 'bg-ink-100 text-ink-400 dark:bg-ink-800')}>{b.awardedAt ? <Award className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900 dark:text-ink-50">{b.name}</span>
                    <span className="block text-xs text-ink-500 dark:text-ink-400">{b.awardedAt ? `Earned ${when(b.awardedAt)}` : b.how}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Key ideas" subtitle="The words you’ll see in the match report." action={<Sparkles className="h-4 w-4 text-ink-300" />} />
          <CardBody>
            <Glossary />
            <p className="mt-4 text-xs text-ink-400">Every match gives you {virtual(rules.startingCapital)} of virtual capital and up to {rules.trading.maxLeverage}× leverage. If your capital falls to {rules.trading.stopOutPct}% of the start, your position is closed.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
