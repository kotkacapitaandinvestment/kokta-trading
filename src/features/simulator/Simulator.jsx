import { useState } from 'react';
import clsx from 'clsx';
import { Gamepad2, RotateCcw, TrendingUp } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { difficulties, getScenario, scoreDecision } from './scenarios';

export default function Simulator() {
  const [difficulty, setDifficulty] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [result, setResult] = useState(null);

  const startScenario = (id) => {
    setDifficulty(id);
    setScenario(getScenario(id));
    setResult(null);
  };

  const choose = (option) => {
    setResult(scoreDecision(scenario, option));
  };

  const nextScenario = () => {
    setScenario(getScenario(difficulty));
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Practice"
        title="Trading Simulator"
        description="Rehearse decisions under pressure. Kotka AI generates the scenario and scores your judgment, not your luck."
      />

      {!difficulty ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {difficulties.map((d) => (
            <Card key={d.id} hover className="cursor-pointer p-6" onClick={() => startScenario(d.id)}>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 dark:bg-ink-800">
                <Gamepad2 className="h-5 w-5 text-ink-700 dark:text-ink-200" strokeWidth={1.75} />
              </div>
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{d.label}</h3>
              <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{d.description}</p>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={scenario?.market}
              subtitle={difficulties.find((d) => d.id === difficulty)?.label}
              action={
                <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setDifficulty(null)}>
                  Change difficulty
                </Button>
              }
            />
            <CardBody className="space-y-5">
              <div className="flex h-40 items-center justify-center rounded-xl bg-ink-50 text-xs text-ink-400 dark:bg-ink-800">
                Live chart feed placeholder — connect a market data provider to render real price action here.
              </div>
              <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{scenario?.narrative}</p>

              {!result ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {scenario?.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => choose(opt)}
                      className="rounded-xl border border-ink-200 px-4 py-3 text-left text-sm font-medium text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={clsx('rounded-xl p-4 text-sm', result.isBest ? 'bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400' : 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400')}>
                    {result.feedback}
                  </div>
                  <Button icon={TrendingUp} onClick={nextScenario}>
                    Next scenario
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Decision Score" subtitle={result ? `Overall: ${result.overall}/100` : 'Make a decision to see scoring'} />
            <CardBody className="space-y-4">
              {result ? (
                result.scores.map((s) => (
                  <div key={s.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-600 dark:text-ink-300">{s.label}</span>
                      <span className="font-medium text-ink-400">{s.value}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div
                        className={clsx('h-full rounded-full', s.value >= 70 ? 'bg-profit-500' : s.value >= 45 ? 'bg-amber-400' : 'bg-loss-500')}
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-400">Choose an action on the left to receive a full breakdown across timing, risk, execution, discipline, psychology, patience, and market reading.</p>
              )}
              {result ? <Badge tone={result.isBest ? 'profit' : 'loss'}>{result.isBest ? 'Optimal decision' : 'Suboptimal decision'}</Badge> : null}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
