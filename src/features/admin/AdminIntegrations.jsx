import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { api } from '../../lib/api';

const NVIDIA_DEFAULTS = {
  model: 'meta/llama-3.1-70b-instruct',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
};

export default function AdminIntegrations() {
  const [integration, setIntegration] = useState(null);
  const [form, setForm] = useState({ apiKey: '', model: NVIDIA_DEFAULTS.model, baseUrl: NVIDIA_DEFAULTS.baseUrl, enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get('/admin/integrations').then(({ integrations }) => {
      const nvidia = integrations.find((i) => i.provider === 'nvidia');
      if (nvidia) {
        setIntegration(nvidia);
        setForm((f) => ({ ...f, model: nvidia.model, baseUrl: nvidia.baseUrl, enabled: nvidia.enabled }));
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const { integration: saved } = await api.put('/admin/integrations/nvidia', form);
      setIntegration(saved);
      setForm((f) => ({ ...f, apiKey: '' }));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post('/admin/integrations/nvidia/test', {});
      setTestResult({ ok: true, message: `Connected — model replied: "${result.sample.trim()}"` });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin"
        title="Integrations"
        description="Connect the AI providers that power Kotka AI. Keys are encrypted at rest and never sent to the browser."
      />

      <Card>
        <CardHeader
          title="NVIDIA"
          subtitle="NVIDIA NIM / build.nvidia.com — chat completions"
          action={
            integration ? (
              <Badge tone={integration.enabled ? 'profit' : 'neutral'}>{integration.enabled ? 'Active' : 'Disabled'}</Badge>
            ) : (
              <Badge tone="warning">Not configured</Badge>
            )
          }
        />
        <CardBody>
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="API Key"
              type="password"
              placeholder={integration ? `Current key: ${integration.maskedKey} — leave blank to keep it` : 'nvapi-…'}
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Model"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                hint="e.g. meta/llama-3.1-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct"
              />
              <Input
                label="Base URL"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="h-4 w-4 rounded accent-ink-900"
              />
              Use this provider for Kotka AI conversations
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" disabled={saving} icon={saving ? Loader2 : Plug}>
                {saving ? 'Saving…' : 'Save integration'}
              </Button>
              <Button type="button" variant="secondary" disabled={!integration || testing} onClick={handleTest}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </div>

            {testResult ? (
              <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${testResult.ok ? 'bg-profit-50 text-profit-700 dark:bg-profit-500/10 dark:text-profit-400' : 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400'}`}>
                {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <p className="text-xs text-ink-400">
        When no provider is configured or enabled, Kotka AI automatically falls back to its scripted mentor responses
        so the experience never breaks for traders.
      </p>
    </div>
  );
}
