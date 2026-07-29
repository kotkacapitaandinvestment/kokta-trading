import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { INTEGRATION_PROVIDERS } from './integrationProviders';

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function buildInitialForm(provider, integration) {
  const form = { secret: '', publicKey: integration?.publicKey ?? '', enabled: integration?.enabled ?? true };
  for (const field of provider.fields) {
    if (field.key === 'secret' || field.key === 'publicKey') continue;
    const [, configKey] = field.key.split('.');
    form[field.key] = getPath(integration, field.key) ?? integration?.config?.[configKey] ?? field.default ?? '';
  }
  return form;
}

function ProviderCard({ provider, integration, onOpen }) {
  const configured = !!integration?.maskedSecret;
  return (
    <Card hover className="flex flex-col p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 dark:bg-ink-800">
          <provider.icon className="h-5 w-5 text-ink-700 dark:text-ink-200" strokeWidth={1.75} />
        </div>
        {configured ? (
          <Badge tone={integration.enabled ? 'profit' : 'neutral'}>{integration.enabled ? 'Active' : 'Disabled'}</Badge>
        ) : (
          <Badge tone="warning">Not configured</Badge>
        )}
      </div>
      <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{provider.name}</h3>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-400">{provider.category}</p>
      <p className="mt-2.5 flex-1 text-sm text-ink-500 dark:text-ink-400">{provider.description}</p>
      {configured ? (
        <p className="mt-3 font-mono text-xs text-ink-400">{integration.maskedSecret}</p>
      ) : null}
      <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => onOpen(provider)} iconRight={ChevronRight}>
        {configured ? 'Manage' : 'Configure'}
      </Button>
    </Card>
  );
}

export default function AdminIntegrations() {
  const [integrations, setIntegrations] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const loadIntegrations = () =>
    api
      .get('/admin/integrations')
      .then(({ integrations }) => {
        setIntegrations(Object.fromEntries(integrations.map((i) => [i.provider, i])));
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadIntegrations();
  }, []);

  const openProvider = (provider) => {
    setActiveProvider(provider);
    setForm(buildInitialForm(provider, integrations[provider.id]));
    setTestResult(null);
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const config = {};
      for (const field of activeProvider.fields) {
        if (field.key.startsWith('config.')) {
          const [, configKey] = field.key.split('.');
          config[configKey] = form[field.key];
        }
      }
      const body = { secret: form.secret || undefined, enabled: form.enabled, config };
      if (activeProvider.fields.some((f) => f.key === 'publicKey')) {
        body.publicKey = form.publicKey;
      }
      const { integration } = await api.put(`/admin/integrations/${activeProvider.id}`, body);
      setIntegrations((prev) => ({ ...prev, [activeProvider.id]: integration }));
      setForm((f) => ({ ...f, secret: '' }));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post(`/admin/integrations/${activeProvider.id}/test`, {});
      setTestResult({ ok: true, message: result.sample });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-ink-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin"
        title="Integrations"
        description="Connect the external providers that power Kotka Trading. Secrets are encrypted at rest and never sent to the browser."
      />

      {loadError ? (
        <div className="rounded-lg bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
          Couldn't load integrations: {loadError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATION_PROVIDERS.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} integration={integrations[provider.id]} onOpen={openProvider} />
        ))}
      </div>

      <Modal open={!!activeProvider} onClose={() => setActiveProvider(null)} title={activeProvider ? `Configure ${activeProvider.name}` : ''}>
        {activeProvider ? (
          <form onSubmit={handleSave} className="space-y-4">
            <p className="text-xs text-ink-400">{activeProvider.fallbackNote}</p>

            {activeProvider.fields.map((field) => (
              <Input
                key={field.key}
                name={field.key}
                label={field.label}
                type={field.type}
                placeholder={
                  field.key === 'secret' && integrations[activeProvider.id]?.maskedSecret
                    ? `Current: ${integrations[activeProvider.id].maskedSecret} — leave blank to keep it`
                    : field.placeholder
                }
                hint={field.hint}
                value={form[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            ))}

            <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
              <input
                type="checkbox"
                checked={!!form.enabled}
                onChange={(e) => setField('enabled', e.target.checked)}
                className="h-4 w-4 rounded accent-ink-900"
              />
              Use this integration
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" disabled={saving} icon={saving ? Loader2 : Plug}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!integrations[activeProvider.id]?.maskedSecret || testing}
                onClick={handleTest}
              >
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </div>

            {testResult ? (
              <div
                className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                  testResult.ok
                    ? 'bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400'
                    : 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400'
                }`}
              >
                {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
