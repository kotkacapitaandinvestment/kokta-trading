import BrandMark from '../ui/BrandMark';
import { Link } from 'react-router-dom';

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white dark:bg-ink-950">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-accent-500/[0.08] blur-[110px]" aria-hidden />
        <Link to="/" className="relative z-10 flex items-center gap-3">
          <BrandMark size={32} />
          <span className="text-[13px] font-semibold tracking-[0.3em]">KOTKA</span>
        </Link>

        <div className="relative z-10">
          <h2 className="text-4xl font-semibold leading-[1.02] tracking-[-0.04em]">
            Discipline is <span className="text-accent-400">Freedom.</span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
            A checklist, a daily risk limit, a journal and research from official data. No signals, ever.
          </p>
          <div className="mt-10 -mr-24 rounded-2xl bg-ink-900 p-2 ring-1 ring-white/10">
            <img src="/landing/research-verdict.webp" width={1600} height={1051} alt="Kotka fundamental research verdict for EUR/USD" className="w-full rounded-xl" decoding="async" />
          </div>
        </div>

        <p className="relative z-10 text-xs text-ink-500">&copy; {new Date().getFullYear()} Kotka Trading. Not investment advice.</p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={32} />
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
