import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import UsageOverview from './usage/UsageOverview';
import UsageLimits from './usage/UsageLimits';
import UsageUsers from './usage/UsageUsers';
import UsageLogs from './usage/UsageLogs';
import UsageSettingsTab from './usage/UsageSettingsTab';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'limits', label: 'Limits' },
  { value: 'people', label: 'User usage' },
  { value: 'logs', label: 'Usage logs' },
  { value: 'settings', label: 'Settings' },
];

// Usage Control: Kotka is free, and features that cost something (Kotka AI,
// Market Intelligence data, Fundamental Research updates) have limits set
// here. Every figure comes from the usage ledger.
export default function AdminUsage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  const person = params.get('user');
  const go = (next, extra = {}) => setParams(Object.fromEntries(Object.entries({ tab: next, ...extra }).filter(([, v]) => v)));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Usage Control" description="How much each feature is used, the limits that keep it fair, and switches for when something needs to pause. Kotka stays free." />
      <div className="overflow-x-auto">
        <Tabs tabs={TABS} active={tab} onChange={(t) => go(t)} />
      </div>
      {tab === 'overview' ? <UsageOverview onOpenPerson={(id) => go('people', { user: id })} /> : null}
      {tab === 'limits' ? <UsageLimits /> : null}
      {tab === 'people' ? <UsageUsers personId={person} onSelect={(id) => go('people', { user: id })} onShowLogs={(id) => go('logs', { user: id })} /> : null}
      {tab === 'logs' ? <UsageLogs userId={person} onClearUser={() => go('logs')} /> : null}
      {tab === 'settings' ? <UsageSettingsTab /> : null}
    </div>
  );
}
