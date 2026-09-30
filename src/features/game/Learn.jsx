// Learn: how Kotka judges a trade, what each kind of market teaches, and
// what your own matches show. Insights come only from your recorded play.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { GraduationCap, Lightbulb, CheckCircle2, AlertTriangle, Info, Dna, BookOpen } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';
import { toast } from '../../lib/dialogs';
import GameNav from './GameNav';
import { startPractice } from './pairs';
import { SUBSCORES } from './format';

const MEASURES = {
  outcome: 'Your return and realised profit or loss.',
  risk: 'Position size, risk per trade, stop losses, drawdown and keeping capital.',
  decision: 'Whether the market supported the reasons you gave, waiting for confirmation, chasing, and staying in after the idea was wrong.',
  execution: 'Exits against your plan, giving back profit, and closing winners far short of your target.',
  consistency: 'Keeping size and risk steady, not sizing up after losses, not overtrading, and sticking with an approach.',
};
const TONE = { good: [CheckCircle2, 'text-profit-600 dark:text-profit-400'], bad: [AlertTriangle, 'text-loss-500'], neutral: [Info, 'text-ink-400'] };

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

export default function Learn() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get('/game/learn').then(setData).catch((err) => setError(err.message));
  }, []);
  const practice = () => startPractice(navigate).catch((err) => toast(err.message, { tone: 'error' }));

  return (
    <div className="space-y-6">
      <GameNav />
      <PageHeader
        eyebrow="Kotka Trading"
        title="Learn"
        description="The outcome tells you what happened. The process tells you how good the decision was."
        actions={<Button icon={GraduationCap} onClick={practice}>Practise for free</Button>}
      />
      {error ? <EmptyState icon={BookOpen} title="Learn didn’t load" description={error} /> : !data ? <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : (
        <>
          <Card>
            <CardHeader title="What your matches show" subtitle="From your last 20 matches where you traded. Each point appears only when your play shows it." />
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
              ) : data.insights.have < data.insights.need ? (
                <EmptyState size="section" icon={Lightbulb} title="Nothing to show yet" description={`Insights need at least ${data.insights.need} matches where you traded. You have ${data.insights.have}. Practice matches count.`} action={<Button size="sm" onClick={practice}>Practise now</Button>} />
              ) : (
                <p className="text-sm text-ink-500 dark:text-ink-400">No clear pattern across your recent matches yet. Keep playing and this fills in.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your Trader DNA" subtitle="How you trade, from the decisions you’ve made." action={<Dna className="h-4 w-4 text-ink-300" />} />
            <CardBody>
              <DnaCard dna={data.dna} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="How Kotka judges a match" subtitle="The Kotka Performance Score, out of 100. Weights can change; these are today’s." />
            <CardBody className="space-y-5">
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                {SUBSCORES.map(([k, label]) => (
                  <li key={k} className="rounded-xl border border-ink-100 p-4 dark:border-ink-800">
                    <p className="flex items-baseline justify-between text-sm font-semibold text-ink-900 dark:text-ink-50">{label} <span className="text-xs font-normal tabular-nums text-ink-400">{data.weights[k]}%</span></p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{MEASURES[k]}</p>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {[
                  ['The same result isn’t the same score', 'Two traders can both make 10%. One risked 2% with a stop and waited for confirmation; the other risked 30% with no stop and got lucky. Their scores differ.'],
                  ['Good process can still lose', 'A sound idea, sensible risk and a clean exit can still lose money when the market goes the other way. Kotka credits the process, not only the result.'],
                  ['Thesis drift', 'You enter because you expect a breakout. The breakout fails, but you stay in, hoping. Kotka notices when you keep a position after your own reason for it has been proven wrong.'],
                ].map(([t, d]) => (
                  <div key={t}>
                    <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{t}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{d}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="What each kind of market teaches" subtitle="Every match is one of these. You find out which after the match, in the report." />
            <CardBody>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.lessons.map((l) => (
                  <li key={l.key} className="rounded-xl border border-ink-100 p-4 dark:border-ink-800">
                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{l.name}</p>
                    {l.family ? <p className="text-[11px] uppercase tracking-wide text-ink-400">{l.family}</p> : null}
                    <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{l.lesson}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-400">Ready to test it? <Link to="/app/game" className="font-medium text-accent-700 underline dark:text-accent-300">Go to the Trading Arena</Link>.</p>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
