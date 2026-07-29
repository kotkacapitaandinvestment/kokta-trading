import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { usePersistedState } from '../../lib/usePersistedState';

function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{label}</p>
        {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-ink-900 dark:bg-white' : 'bg-ink-200 dark:bg-ink-700')}
      >
        <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform dark:bg-ink-900', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const [config, setConfig] = usePersistedState('admin.systemConfig', {
    platformName: 'Kotka Trading',
    supportEmail: 'support@kotka.trading',
    defaultModel: 'Kotka Reasoning (default)',
    freeAiLimit: 10,
    maintenanceMode: false,
    signupsOpen: true,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="System Settings" description="Global platform configuration and defaults." />

      <Card>
        <CardHeader title="General" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Platform name" value={config.platformName} onChange={(e) => setConfig((c) => ({ ...c, platformName: e.target.value }))} />
          <Input label="Support email" value={config.supportEmail} onChange={(e) => setConfig((c) => ({ ...c, supportEmail: e.target.value }))} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kotka AI Defaults" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Default model" value={config.defaultModel} onChange={(e) => setConfig((c) => ({ ...c, defaultModel: e.target.value }))}>
            <option>Kotka Reasoning (default)</option>
            <option>Kotka Vision (chart analysis)</option>
            <option>Kotka Coaching (psychology)</option>
          </Select>
          <Input
            label="Free tier AI requests / day"
            type="number"
            value={config.freeAiLimit}
            onChange={(e) => setConfig((c) => ({ ...c, freeAiLimit: e.target.value }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Platform Controls" />
        <CardBody className="divide-y divide-ink-50 dark:divide-ink-800/60">
          <Toggle
            checked={config.signupsOpen}
            onChange={(v) => setConfig((c) => ({ ...c, signupsOpen: v }))}
            label="New signups open"
            hint="Allow new traders to create accounts."
          />
          <Toggle
            checked={config.maintenanceMode}
            onChange={(v) => setConfig((c) => ({ ...c, maintenanceMode: v }))}
            label="Maintenance mode"
            hint="Show a maintenance banner and block new trading actions."
          />
        </CardBody>
      </Card>

      <Button>Save configuration</Button>
    </div>
  );
}
