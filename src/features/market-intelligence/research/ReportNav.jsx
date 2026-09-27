import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CurrencyChip, KindTag, reportCodes, toneOf } from './primitives';

// Sticky chapter bar. The active chapter is tracked with IntersectionObserver
// (no scroll listeners); jumps respect prefers-reduced-motion.
export function ReportNav({ chapters }) {
  const [active, setActive] = useState(chapters[0]?.id);
  const strip = useRef(null);

  // On narrow screens the bar scrolls sideways; keep the current chapter in view.
  useEffect(() => {
    const ol = strip.current;
    const el = ol?.querySelector('[aria-current="true"]');
    if (!ol || !el || ol.scrollWidth <= ol.clientWidth) return;
    const a = ol.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    ol.scrollTo({ left: ol.scrollLeft + b.left - a.left - (a.width - b.width) / 2, behavior: 'smooth' });
  }, [active]);

  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [chapters]);

  const jump = (id) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <nav aria-label="Report chapters" className="sticky top-0 z-10 -mx-1 rounded-xl border border-ink-100 bg-white/90 px-1 py-1 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90">
      <ol ref={strip} className="flex gap-0.5 overflow-x-auto scrollbar-thin">
        {chapters.map((c) => (
          <li key={c.id} className="shrink-0">
            <button
              type="button"
              onClick={() => jump(c.id)}
              aria-current={active === c.id ? 'true' : undefined}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                active === c.id ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100',
              )}
            >
              <c.icon className="h-3.5 w-3.5" strokeWidth={2} />
              {c.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// One-line key to the colour system used throughout the report.
export function ReadingGuide({ report }) {
  const codes = reportCodes(report);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-ink-50 px-4 py-2.5 text-[11px] text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
      <span className="flex items-center gap-2">
        <span className="font-medium text-ink-600 dark:text-ink-300">{codes.length > 1 ? 'Currencies' : 'Currency'}</span>
        {codes.map((c) => (
          <CurrencyChip key={c} code={c} tone={toneOf(report, c)} />
        ))}
      </span>
      <span className="flex items-center gap-2">
        <span className="font-medium text-ink-600 dark:text-ink-300">Effect</span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-profit-500" /> supportive
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-loss-500" /> weighs
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="font-medium text-ink-600 dark:text-ink-300">Evidence</span>
        <KindTag kind="FACT" />
        <KindTag kind="SOURCE ASSESSMENT" />
        <KindTag kind="KOTKA INTERPRETATION" />
      </span>
    </div>
  );
}
