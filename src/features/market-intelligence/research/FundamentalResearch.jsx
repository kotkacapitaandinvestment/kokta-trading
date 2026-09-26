import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Check, Globe2, History, Landmark, Layers, Library, Loader2, RefreshCw, Scale } from 'lucide-react';
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
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-thin lg:flex-wrap lg:overflow-visible lg:pb-0">{config.settings.pairs.map((p) => pill(p, `${p.slice(0, 3)}/${p.slice(3)}`))}</div>
      <div className="hidden h-5 w-px bg-ink-200 dark:bg-ink-700 lg:block" />
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-thin lg:flex-wrap lg:overflow-visible lg:pb-0">{config.currencies.map((c) => pill(c.code, c.code))}</div>
      {config.crypto?.length ? (
        <>
          <div className="hidden h-5 w-px bg-ink-200 dark:bg-ink-700 lg:block" />
          <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 scrollbar-thin lg:overflow-visible lg:pb-0">
            <span className="shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Crypto</span>
            {config.crypto.map((c) => pill(c.symbol, c.display))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ProgressPanel({ steps, notice }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-700 dark:bg-ink-900" aria-live="polite">
      <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Researching</p>
      <p className="mt-0.5 text-xs text-ink-400">Evidence first, then comparison, then interpretation. A full run takes up to a minute or two.</p>
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
            Starting research run
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

          <Chapter id="ch-drivers" icon={Layers} title="Macro drivers" description="Every factor scored from official data, side by side, with the evidence and the rule behind each score.">
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

          <Chapter id="ch-sources" icon={Library} title="Sources" description="Every publication behind this report, and how retrieval went on this run.">
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

  if (configError) return <EmptyState icon={AlertTriangle} title="Fundamental Research is unavailable" description={configError} />;
  if (!config) return <ReportSkeleton />;
  if (!allowed) return <EmptyState icon={Landmark} title="Fundamental Research" description={config.access.reason} />;
  if (!subject) return <EmptyState icon={Landmark} title="No instruments enabled" description="An administrator has not enabled any currencies or pairs for Fundamental Research yet." />;

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
  const { status, report, freshness, history, error, steps, refreshing, notice, refresh } = useResearch(subject);
  const isAdmin = config.access.isAdmin;
  const canRefresh = isAdmin || freshness?.stale || !report;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ink-100 bg-white p-4 dark:border-ink-700 dark:bg-ink-900">
        <InstrumentPicker config={config} value={subject} onChange={onInstrumentChange} />
        <div className="mt-4 flex flex-col gap-3 border-t border-ink-100 pt-4 dark:border-ink-800 lg:flex-row lg:items-center lg:justify-between">
          <FreshnessStrip freshness={freshness} report={report} />
          <div className="flex shrink-0 items-center gap-3">
            {config.usage?.limit !== null && config.usage?.limit !== undefined ? <span className="text-[11px] text-ink-400">{config.usage.refreshesToday}/{config.usage.limit} refreshes today</span> : null}
            <Button
              variant="secondary"
              size="sm"
              icon={refreshing ? Loader2 : RefreshCw}
              disabled={refreshing || !canRefresh}
              onClick={() => refresh({ force: isAdmin && !freshness?.stale })}
              title={canRefresh ? undefined : 'This report is current. It refreshes automatically when it becomes stale.'}
            >
              {refreshing ? 'Researching' : isAdmin && !freshness?.stale && report ? 'Force refresh' : canRefresh ? 'Refresh' : 'Up to date'}
            </Button>
          </div>
        </div>
      </div>

      {notice && !refreshing ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {refreshing ? <ProgressPanel steps={steps} notice={notice} /> : null}

      {status === 'loading' ? <ReportSkeleton /> : null}
      {status === 'error' ? <EmptyState icon={AlertTriangle} title="Could not load research" description={error} /> : null}
      {status === 'empty' && !refreshing ? (
        <EmptyState
          icon={Landmark}
          title={`No research for ${subject} yet`}
          description="Kotka has not researched this instrument yet. Running research gathers IMF, central bank and official statistics data, then scores it."
          action={<Button onClick={() => refresh()} icon={RefreshCw}>Run research</Button>}
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
