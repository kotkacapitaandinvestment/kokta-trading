import { Link } from 'react-router-dom';
import { ArrowRight, Brain, ShieldCheck, LineChart, NotebookPen, Gamepad2, Dna } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

const pillars = [
  {
    icon: Brain,
    title: 'Kotka AI',
    body: 'An institutional trading mentor that challenges your assumptions, evaluates probability, and questions bias — never sells you signals.',
  },
  {
    icon: NotebookPen,
    title: 'Structured journaling',
    body: 'Log entries, risk, emotion, and mistakes in one place, then let analytics surface the patterns that are actually costing you money.',
  },
  {
    icon: ShieldCheck,
    title: 'Pre-trade discipline',
    body: 'A readiness checklist and daily risk limits stand between impulse and execution, every single time.',
  },
  {
    icon: LineChart,
    title: 'Institutional analytics',
    body: 'Win rate, expectancy, profit factor, and rule-violation tracking — the numbers a prop desk actually watches.',
  },
  {
    icon: Gamepad2,
    title: 'Simulator & replay',
    body: 'Rehearse decisions under Institutional Chaos conditions, then replay real trades with AI critique.',
  },
  {
    icon: Dna,
    title: 'Trader DNA',
    body: 'A living profile of your patience, discipline, execution and psychology — scored, tracked, and improved.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white dark:bg-ink-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-sm font-bold text-ink-950 dark:bg-accent-400">
            K
          </div>
          <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka Trading</span>
        </div>
        <div className="flex items-center gap-3">
          <Button as={Link} to="/login" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button as={Link} to="/signup" variant="primary" size="sm" iconRight={ArrowRight}>
            Get started
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
        <span className="mx-auto mb-6 inline-flex items-center rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-500 dark:border-ink-700 dark:text-ink-400">
          Not a signal provider. Not a broker. Not copy trading.
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-ink-900 sm:text-6xl dark:text-ink-50">
          Discipline is Freedom.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-500 dark:text-ink-400">
          Kotka is an institutional-grade trading operating system — structured workflows, artificial intelligence,
          analytics, and psychological coaching that turn retail habits into professional process.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button as={Link} to="/signup" size="lg" iconRight={ArrowRight}>
            Start building discipline
          </Button>
          <Button as={Link} to="/login" variant="secondary" size="lg">
            Sign in
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <Card key={p.title} className="p-6" hover>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 dark:bg-ink-800">
                <p.icon className="h-5 w-5 text-ink-700 dark:text-ink-200" strokeWidth={1.75} />
              </div>
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-ink-100 px-6 py-8 text-center text-xs text-ink-400 dark:border-ink-800">
        © {new Date().getFullYear()} Kotka Trading. Kotka is an educational and analytical tool — not financial advice.
      </footer>
    </div>
  );
}
