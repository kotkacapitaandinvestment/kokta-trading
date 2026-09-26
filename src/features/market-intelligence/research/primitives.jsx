import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';

// Kotka-authored copy never renders em/en dashes; verbatim institutional
// quotes are rendered untouched and never pass through this.
export const txt = (s) => (s == null ? '' : String(s).replace(/\s*[—]\s*/g, ' - ').replace(/(\d)\s*[–]\s*(\d)/g, '$1-$2').replace(/\s*[–]\s*/g, ' - '));

// "IMF FORMAL VALUATION: NOT AVAILABLE — no External..." -> "No External..."
export const reasonAfterPrefix = (s) => {
  const rest = String(s ?? '').replace(/^[^—]*NOT AVAILABLE[^—]*—\s*/, '');
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
};

// Currency order for a report: base then quote. Never Object.keys() on stored
// report objects (Postgres jsonb sorts keys, which would flip USDJPY).
export const reportCodes = (report) => (report.quote ? [report.base, report.quote] : [report.base]);

export const fmt = (v, dp = 2) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 'n/a' : Number(v).toFixed(dp));
export const signed = (v) => (v === null || v === undefined ? 'n/a' : v > 0 ? `+${v}` : `${v}`);
export const signedFixed = (v, dp = 2) => (v === null || v === undefined ? 'n/a' : `${v > 0 ? '+' : ''}${Number(v).toFixed(dp)}`);

export function formatValue(v, unit) {
  if (v === null || v === undefined) return 'n/a';
  if (unit === '%') return `${fmt(v)}%`;
  if (unit === '% of GDP') return `${fmt(v, 1)}% of GDP`;
  if (unit === 'index (0–1)') return fmt(v, 3);
  if (unit === 'pts') return `${fmt(v)} pts`;
  return fmt(v);
}

export function formatDate(iso, { time = false } = {}) {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (!time) return date;
  return `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

// Evidence type colours: each kind of statement has one hue, used everywhere.
const KIND_STYLES = {
  FACT: 'bg-slate-100 text-slate-700 ring-slate-300/70 dark:bg-slate-400/15 dark:text-slate-200 dark:ring-slate-400/30',
  'SOURCE ASSESSMENT': 'bg-teal-50 text-teal-800 ring-teal-600/25 dark:bg-teal-400/10 dark:text-teal-200 dark:ring-teal-400/30',
  'KOTKA INTERPRETATION': 'bg-violet-50 text-violet-800 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/30',
  FORECAST: 'bg-white text-ink-600 ring-ink-300 dark:bg-transparent dark:text-ink-300 dark:ring-ink-600',
  'MARKET EXPECTATION': 'bg-white text-ink-600 ring-ink-300 dark:bg-transparent dark:text-ink-300 dark:ring-ink-600',
  'MARKET PRICE': 'bg-white text-ink-600 ring-ink-300 dark:bg-transparent dark:text-ink-300 dark:ring-ink-600',
};

const KIND_LABEL = { ACTUAL: 'FACT', 'KOTKA INTERPRETATION': 'KOTKA VIEW', 'SOURCE ASSESSMENT': 'SOURCE' };

export function KindTag({ kind, className }) {
  const raw = String(kind ?? 'FACT').toUpperCase();
  const k = raw === 'ACTUAL' ? 'FACT' : raw;
  return (
    <span
      title={k === 'KOTKA INTERPRETATION' ? "Kotka's interpretation of the evidence" : k === 'SOURCE ASSESSMENT' ? 'What an institution projected or stated' : k === 'FACT' ? 'Verified data' : undefined}
      className={clsx('inline-flex shrink-0 items-center rounded px-1.5 py-px font-mono text-[9.5px] font-semibold tracking-wide ring-1 ring-inset', KIND_STYLES[k] ?? KIND_STYLES.FACT, className)}
    >
      {KIND_LABEL[k] ?? k}
    </span>
  );
}

// ── Currency identity (base = gold, quote = blue) ──
export const toneOf = (report, code) => (report?.quote && code === report.quote ? 'quote' : 'base');

const CCY = {
  base: {
    dot: 'bg-ccybase',
    text: 'text-ccybase-ink dark:text-ccybase-light',
    soft: 'bg-ccybase/10 dark:bg-ccybase/15',
    ring: 'ring-ccybase/40',
    border: 'border-ccybase',
  },
  quote: {
    dot: 'bg-ccyquote dark:bg-ccyquote-dark',
    text: 'text-ccyquote-ink dark:text-ccyquote-light',
    soft: 'bg-ccyquote/10 dark:bg-ccyquote-dark/15',
    ring: 'ring-ccyquote/40 dark:ring-ccyquote-dark/40',
    border: 'border-ccyquote dark:border-ccyquote-dark',
  },
};
export const ccy = (tone) => CCY[tone] ?? CCY.base;

export function CurrencyChip({ code, tone = 'base', size = 'sm', className }) {
  const c = ccy(tone);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-md font-mono font-semibold ring-1 ring-inset', c.soft, c.text, c.ring, size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs', className)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', c.dot)} />
      {code}
    </span>
  );
}

// Which currency a factor favours, in that currency's colour.
export function FavoursPill({ report, favors }) {
  if (!favors) return <span className="font-mono text-[11px] text-ink-400">n/a</span>;
  if (favors === 'NEITHER') return <span className="text-xs text-ink-400">Neither</span>;
  return <CurrencyChip code={favors} tone={toneOf(report, favors)} />;
}

// A chapter of the report: anchor target for the chapter bar.
export function Chapter({ id, icon: Icon, title, description, children }) {
  return (
    <section id={id} data-chapter={id} className="scroll-mt-20 space-y-4">
      <header className="flex items-start gap-3 pt-2">
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-accent-400 dark:bg-ink-800">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        ) : null}
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">{title}</h2>
          {description ? <p className="mt-0.5 max-w-3xl text-xs text-ink-500 dark:text-ink-400">{txt(description)}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

// Centered diverging bar for a -2..+2 factor score. No background track:
// a hairline axis, and the bar grows left (negative) or right (positive).
export function FactorBar({ score, width = 88 }) {
  const half = width / 2;
  if (score === null || score === undefined) {
    return (
      <div className="relative h-3" style={{ width }}>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-100 dark:bg-ink-800" />
      </div>
    );
  }
  const len = (Math.abs(score) / 2) * (half - 2);
  return (
    <div className="relative h-3" style={{ width }} aria-label={`Score ${signed(score)} of ±2`}>
      <span className="absolute top-0 h-3 w-px bg-ink-300 dark:bg-ink-600" style={{ left: half }} />
      {score !== 0 ? (
        <span
          className={clsx('absolute top-0.5 h-2', score > 0 ? 'rounded-r bg-profit-500' : 'rounded-l bg-loss-500')}
          style={score > 0 ? { left: half + 1, width: len } : { left: half - len, width: len }}
        />
      ) : (
        <span className="absolute top-1 h-1 w-1 rounded-full bg-ink-400" style={{ left: half - 1.5 }} />
      )}
    </div>
  );
}

// Hero figures: same sans as the UI, proportional digits (tabular digits are
// for aligned columns only).
export function ScoreFigure({ value, suffix = '/100', className }) {
  return (
    <span className={clsx('font-semibold tracking-tight', className)}>
      {value ?? 'n/a'}
      {value !== null && value !== undefined ? <span className="text-[0.55em] font-normal text-ink-400">{suffix}</span> : null}
    </span>
  );
}

export function NotAvailable({ children = 'DATA NOT AVAILABLE', reason, className }) {
  return (
    <div className={clsx('rounded-lg border border-dashed border-ink-200 px-3 py-2.5 dark:border-ink-700', className)}>
      <p className="font-mono text-[11px] font-medium tracking-wide text-ink-500 dark:text-ink-400">{txt(children)}</p>
      {reason ? <p className="mt-1 text-xs text-ink-400">{txt(reason)}</p> : null}
    </div>
  );
}

export function SourceLink({ href, children, className }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clsx('inline-flex items-center gap-0.5 text-accent-700 underline decoration-accent-500/30 underline-offset-2 hover:decoration-accent-500 dark:text-accent-300', className)}>
      {children}
      <ArrowUpRight className="h-3 w-3 shrink-0" />
    </a>
  );
}

export function Section({ title, subtitle, action, children, className, tone }) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-ink-100 bg-white dark:border-ink-700 dark:bg-ink-900',
        tone && clsx('border-t-2', ccy(tone).border),
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-400">{txt(subtitle)}</p> : null}
        </div>
        {action}
      </header>
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

// Column header for per-currency panels inside a section.
export function CurrencyHeading({ report, code, children }) {
  const c = ccy(toneOf(report, code));
  return (
    <div className={clsx('mb-3 flex items-center justify-between gap-2 border-b pb-2', 'border-ink-100 dark:border-ink-800')}>
      <div className="flex items-center gap-2">
        <span className={clsx('h-4 w-1 rounded-full', c.dot)} />
        <span className={clsx('text-xs font-semibold', c.text)}>{code}</span>
        {children ? <span className="text-xs text-ink-400">{children}</span> : null}
      </div>
    </div>
  );
}

export const conditionTone = (c) => {
  if (!c) return 'text-ink-500';
  if (/STRONG(?!ER)/.test(c)) return 'text-profit-600 dark:text-profit-400';
  if (/WEAK/.test(c)) return 'text-loss-500';
  return 'text-ink-700 dark:text-ink-200';
};

export const directionWord = (label) =>
  ({ STRENGTHENING: 'Strengthening', STABLE: 'Stable', WEAKENING: 'Weakening', REVERSING: 'Reversing', MIXED: 'Mixed' })[label] ?? 'n/a';
