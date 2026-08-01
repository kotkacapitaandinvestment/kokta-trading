import { Link } from 'react-router-dom';
import { ShieldCheck, TrendingUp, Brain } from 'lucide-react';

const points = [
  { icon: ShieldCheck, text: 'Institutional risk management built into every workflow' },
  { icon: Brain, text: 'Kotka AI challenges your bias before you challenge the market' },
  { icon: TrendingUp, text: 'Turn journaling and analytics into measurable discipline' },
];

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white dark:bg-ink-950">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(209,168,91,0.18),transparent_45%)]" />
        <Link to="/" className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-400 text-sm font-bold text-ink-950">K</div>
          <span className="text-lg font-semibold">Kotka Trading</span>
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Discipline is Freedom.</h2>
          <p className="mt-3 text-sm text-ink-300">
            An institutional-grade operating system for traders who want process over impulse, and probability over
            prediction.
          </p>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-sm text-ink-200">
                <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                {p.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-ink-500">© {new Date().getFullYear()} Kotka Trading. Not investment advice.</p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-sm font-bold text-ink-950 dark:bg-accent-400">K</div>
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka Trading</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
