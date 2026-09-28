import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Check, Globe2, History, Landmark, Layers, Library, Loader2, RefreshCw, Scale, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { askKotkaLink } from '../../../lib/askKotka';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import Skeleton from '../../../components/ui/Skeleton';
import { api } from '../../../lib/api';
import { useResearch } from './useResearch';
import { EvidenceProvider } from './Evidence';
import VerdictSection from './VerdictSection';
import { MacroDrivers, MainDrivers } from './FactorsSection';
import { WhySection, RelativeSection, RealityVsExpectations, WhatChangedSection, InvalidationSection } from './NarrativeSections';
import { CentralBanksSection, ImfSection, RevisionsSection } from './InstitutionsSection';
import CatalystsSection from './CatalystsSection';
import TrendSection from './TrendSection';
import SourcesSection, { FreshnessStrip } from './SourcesSection';
import { Chapter, txt } from './primitives';
import { ReadingGuide, ReportNav } from './ReportNav';
import CryptoView from './CryptoView';
import UsageMeter from '../../../components/UsageMeter';
import { useFeatureUsage, usageNote } from '../../../lib/usage';

function InstrumentPicker({ config, value, onChange }) {
  const pill = (subject, label) => (
    <button
      key={subject}
      type="button"
      onClick={() => onChange(subject)}
      aria-pressed={value === subject}
      className={clsx(
        'shrink-0 rounded-lg px-3 py-1.5 font-mono text-xs transition-colors active:scale-[0.98]',
        value === subject ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
      )}
    >
      {label}
    </button>
  );
  // Every choice stays visible: groups wrap instead of scrolling sideways.
  const group = (label, items, { always = false } = {}) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className={clsx('w-full px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400 lg:w-auto', !always && 'lg:hidden')}>{label}</span>
      {items}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
      {group('Pairs', config.settings.pairs.map((p) => pill(p, `${p.slice(0, 3)}/${p.slice(3)}`)))}
      <div className="hidden h-5 w-px bg-ink-200 dark:bg-ink-700 lg:block" />
      {group('Currencies', config.currencies.map((c) => pill(c.code, c.code)))}
      {config.crypto?.length ? (
        <>
          <div className="hidden h-5 w-px bg-ink-200 dark:bg-ink-700 lg:block" />
          {group('Crypto', config.crypto.map((c) => pill(c.symbol, c.display)), { always: true })}
        </>
      ) : null}
    </div>
  );
}

function ProgressPanel({ steps, notice }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-700 dark:bg-ink-900" aria-live="polite">
      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Researching</p>
      <p className="mt-0.5 text-xs text-ink-400">Gathering the latest data and writing your report. This takes a minute or two.</p>
      {notice ? <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">{notice}</p> : null}
      <ol className="mt-4 space-y-2.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5 text-sm">
            {s.status === 'done' ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-profit-600" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent-600 motion-reduce:animate-none" />}
            <div>
              <p className={s.status === 'done' ? 'text-ink-700 dark:text-ink-200' : 'text-ink-900 dark:text-ink-50'}>{txt(s.label)}</p>
              {s.detail ? <p className="text-xs text-ink-400">{txt(s.detail)}</p> : null}
            </div>
          </li>
        ))}
        {!steps.length ? (
          <li className="flex items-center gap-2.5 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin text-accent-600 motion-reduce:animate-none" />
            Getting started…
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-1 gap-6 rounded-2xl border border-ink-100 p-6 dark:border-ink-700 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-14 w-48" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}

const CHAPTERS = [
  { id: 'ch-verdict', label: 'Verdict', icon: Scale },
  { id: 'ch-drivers', label: 'Macro drivers', icon: Layers },
  { id: 'ch-policy', label: 'Policy & markets', icon: Landmark },
  { id: 'ch-imf', label: 'IMF & forecasts', icon: Globe2 },
  { id: 'ch-changes', label: 'Changes & trend', icon: History },
  { id: 'ch-outlook', label: 'Outlook & risks', icon: CalendarClock },
  { id: 'ch-sources', label: 'Sources', icon: Library },
];

function Report({ report, history }) {
  const isPair = report.kind === 'pair';
  const pairName = isPair ? `${report.base} relative to ${report.quote}` : report.subject;
  return (
    <EvidenceProvider report={report}>
      {/* The chapter bar must share a parent with the chapters to stay sticky. */}
      <div>
        <ReadingGuide report={report} />
        <div className="mt-4" />
        <ReportNav chapters={CHAPTERS} />
        <div className="mt-6 space-y-12">
          <Chapter id="ch-verdict" icon={Scale} title="Verdict" description={`The fundamental condition of ${pairName}, how confident Kotka is, and the reasons behind it.`}>
            <VerdictSection report={report} />
            <WhySection report={report} />
          </Chapter>

          <Chapter id="ch-drivers" icon={Layers} title="Macro drivers" description="What’s pushing each currency up or down, and the data behind each score.">
            <MacroDrivers report={report} />
            {isPair ? <RelativeSection report={report} /> : null}
            <MainDrivers report={report} />
          </Chapter>

          <Chapter id="ch-policy" icon={Landmark} title="Policy & markets" description="What the central banks are actually doing, and what markets appear to expect, kept apart.">
            <CentralBanksSection report={report} />
            <RealityVsExpectations report={report} />
          </Chapter>

          <Chapter id="ch-imf" icon={Globe2} title="IMF & forecasts" description="IMF projections and how they were revised between World Economic Outlook editions.">
            <ImfSection report={report} />
            <RevisionsSection report={report} />
          </Chapter>

          <Chapter id="ch-changes" icon={History} title="Changes & trend" description="What moved since last month, and how the fundamental score has evolved.">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <WhatChangedSection report={report} />
              <TrendSection report={report} history={history} />
            </div>
          </Chapter>

          <Chapter id="ch-outlook" icon={CalendarClock} title="Outlook & risks" description="Scheduled events that could move the assessment, and the developments that would change it.">
            <InvalidationSection report={report} />
            <CatalystsSection report={report} />
          </Chapter>

          <Chapter id="ch-sources" icon={Library} title="Sources" description="Where every number in this report comes from.">
            <SourcesSection report={report} />
          </Chapter>
        </div>
      </div>
    </EvidenceProvider>
  );
}

export default function FundamentalResearch({ instrument, onInstrumentChange }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);

  useEffect(() => {
    api.get('/research/config').then(setConfig).catch((err) => setConfigError(err.message));
  }, []);

  const allowed = config?.access?.allowed;
  const crypto = config?.crypto?.map((c) => c.symbol) ?? [];
  const available = config ? [...config.settings.pairs, ...config.settings.currencies, ...crypto] : [];
  const subject = available.includes(instrument) ? instrument : config?.settings.pairs[0] ?? config?.settings.currencies[0];

  if (configError) return <EmptyState icon={AlertTriangle} title="Research couldn’t load" description={configError} />;
  if (!config) return <ReportSkeleton />;
  if (!allowed) return <EmptyState icon={Landmark} title="Fundamental Research" description={config.access.reason} />;
  if (!subject) return <EmptyState icon={Landmark} title="Research isn’t available yet" description="We’re setting up coverage. Check back soon." />;

  if (crypto.includes(subject)) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-700 dark:bg-ink-900">
          <InstrumentPicker config={config} value={subject} onChange={onInstrumentChange} />
        </div>
        <CryptoView key={subject} symbol={subject} onInstrumentChange={onInstrumentChange} />
      </div>
    );
  }
  return <ResearchView key={subject} config={config} subject={subject} onInstrumentChange={onInstrumentChange} />;
}

function ResearchView({ config, subject, onInstrumentChange }) {
  const { usage, refresh: refreshUsage } = useFeatureUsage('fundamental_research');
  const { status, report, freshness, history, error, steps, refreshing, notice, refresh } = useResearch(subject, { onUsed: refreshUsage });
  const isAdmin = config.access.isAdmin;
  // Report updates left (Usage Control); reading saved reports is never limited.
  const usageBlocked = !!usage && !usage.exempt && (usage.paused || usage.headline?.remaining === 0);
  const canRefresh = !usageBlocked && (isAdmin || freshness?.stale || !report);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-700 dark:bg-ink-900">
        <InstrumentPicker config={config} value={subject} onChange={onInstrumentChange} />
        <div className="mt-4 flex flex-col gap-3 border-t border-ink-100 pt-4 dark:border-ink-800 lg:flex-row lg:items-center lg:justify-between">
          <FreshnessStrip freshness={freshness} report={report} />
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            <UsageMeter usage={usage} className="mr-auto text-[11px] lg:mr-0" />
            {report ? (
              <Button
                as={Link}
                to={askKotkaLink(`Walk me through the ${report.kind === 'pair' ? `${report.base}/${report.quote}` : report.subject} fundamental research: what drives the verdict, what changed recently, and what could change the view.`)}
                variant="ghost"
                size="sm"
                icon={Sparkles}
              >
                Ask Kotka
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              icon={refreshing ? Loader2 : RefreshCw}
              disabled={refreshing || !canRefresh}
              onClick={() => refresh({ force: isAdmin && !freshness?.stale })}
              title={canRefresh ? undefined : usageBlocked ? usageNote(usage)?.text : 'This report is up to date. It updates automatically when new data is due.'}
            >
              {refreshing ? 'Researching' : usageBlocked ? (usage.paused ? 'Updates paused' : 'Limit reached') : isAdmin && !freshness?.stale && report ? 'Force refresh' : canRefresh ? 'Refresh' : 'Up to date'}
            </Button>
          </div>
        </div>
      </div>

      {notice && !refreshing ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : usageNote(usage) && !refreshing ? (
        <p className="text-xs text-ink-500 dark:text-ink-400" role="status">
          {usageNote(usage).text}
          {usageBlocked ? ' You can still read the last saved report.' : ''}
        </p>
      ) : null}

      {refreshing ? <ProgressPanel steps={steps} notice={notice} /> : null}

      {status === 'loading' ? <ReportSkeleton /> : null}
      {status === 'error' ? <EmptyState icon={AlertTriangle} title="Research couldn’t load" description={`${error} Refresh the page to try again.`} /> : null}
      {status === 'empty' && !refreshing ? (
        <EmptyState
          icon={Landmark}
          title={`No research for ${subject} yet`}
          description="There’s no report for this market yet. Create one now: it takes a minute or two."
          action={<Button onClick={() => refresh()} icon={RefreshCw}>Create report</Button>}
        />
      ) : null}
      {report ? (
        <div className={clsx('transition-opacity duration-300', refreshing && 'pointer-events-none opacity-50')}>
          <Report report={report} history={history} />
        </div>
      ) : null}
    </div>
  );
}
