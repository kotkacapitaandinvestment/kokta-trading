import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { User, ShieldCheck, Bell, Palette, Sparkles, LineChart, Lock, CreditCard } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'ai', label: 'AI Preferences', icon: Sparkles },
  { id: 'trading', label: 'Trading Preferences', icon: LineChart },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
];

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

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [active, setActive] = useState('profile');
  const [notifPrefs, setNotifPrefsState] = useState({
    checklist: true,
    journal: true,
    riskWarnings: true,
    weeklyReview: true,
    aiInsights: false,
  });
  const [aiPrefs, setAiPrefsState] = useState({
    tone: 'Direct & challenging',
    autoSuggest: true,
    rememberContext: true,
  });
  const [tradingPrefs, setTradingPrefsState] = useState({
    baseCurrency: 'USD',
    dailyLossLimit: 2,
    defaultRisk: 1,
  });

  useEffect(() => {
    api.get('/settings').then(({ settings }) => {
      setNotifPrefsState(settings.notifications);
      setAiPrefsState(settings.aiPreferences);
      setTradingPrefsState(settings.tradingPreferences);
    });
  }, []);

  const setNotifPrefs = (updater) => {
    setNotifPrefsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      api.put('/settings', { notifications: next });
      return next;
    });
  };
  const setAiPrefs = (updater) => {
    setAiPrefsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      api.put('/settings', { aiPreferences: next });
      return next;
    });
  };
  const setTradingPrefs = (updater) => {
    setTradingPrefsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      api.put('/settings', { tradingPreferences: next });
      return next;
    });
  };

  return (
    <div>
      <PageHeader eyebrow="Account" title="Settings" description="Configure your profile, discipline preferences, and platform behavior." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="p-2 lg:col-span-1">
          <ul className="space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setActive(s.id)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active === s.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  <s.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 lg:col-span-3">
          {active === 'profile' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Profile</h3>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-500 text-lg font-semibold text-white">{user?.initials}</div>
                <Button variant="secondary" size="sm">Change photo</Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Full name" defaultValue={user?.name} />
                <Input label="Email" defaultValue={user?.email} type="email" />
              </div>
              <Button size="sm">Save changes</Button>
            </div>
          ) : null}

          {active === 'security' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Security</h3>
              <Input label="Current password" type="password" placeholder="••••••••" />
              <Input label="New password" type="password" placeholder="••••••••" />
              <Button size="sm">Update password</Button>
              <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">
                <Toggle checked label="Two-factor authentication" hint="Require a code from your authenticator app at sign in." onChange={() => {}} />
              </div>
            </div>
          ) : null}

          {active === 'notifications' ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-900 dark:text-ink-50">Notifications</h3>
              <div className="divide-y divide-ink-50 dark:divide-ink-800/60">
                <Toggle checked={notifPrefs.checklist} onChange={(v) => setNotifPrefs((p) => ({ ...p, checklist: v }))} label="Checklist reminders" hint="Remind me if today's checklist is incomplete." />
                <Toggle checked={notifPrefs.journal} onChange={(v) => setNotifPrefs((p) => ({ ...p, journal: v }))} label="Journal reminders" hint="Remind me to log trades I haven't journaled." />
                <Toggle checked={notifPrefs.riskWarnings} onChange={(v) => setNotifPrefs((p) => ({ ...p, riskWarnings: v }))} label="Risk warnings" hint="Alert me when I'm near my daily loss limit." />
                <Toggle checked={notifPrefs.weeklyReview} onChange={(v) => setNotifPrefs((p) => ({ ...p, weeklyReview: v }))} label="Weekly review" hint="Notify me when my weekly performance report is ready." />
                <Toggle checked={notifPrefs.aiInsights} onChange={(v) => setNotifPrefs((p) => ({ ...p, aiInsights: v }))} label="Kotka AI insights" hint="Notify me when new psychology insights are generated." />
              </div>
            </div>
          ) : null}

          {active === 'theme' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Theme</h3>
              <div className="grid grid-cols-2 gap-3">
                {['light', 'dark'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={clsx('rounded-xl border p-4 text-left capitalize', theme === t ? 'border-ink-900 dark:border-white' : 'border-ink-200 dark:border-ink-700')}
                  >
                    <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{t} mode</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {active === 'ai' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">AI Preferences</h3>
              <Select label="Coaching tone" value={aiPrefs.tone} onChange={(e) => setAiPrefs((p) => ({ ...p, tone: e.target.value }))}>
                <option>Direct & challenging</option>
                <option>Supportive & measured</option>
                <option>Purely analytical</option>
              </Select>
              <Toggle checked={aiPrefs.autoSuggest} onChange={(v) => setAiPrefs((p) => ({ ...p, autoSuggest: v }))} label="Proactive suggestions" hint="Let Kotka AI surface insights without being asked." />
              <Toggle checked={aiPrefs.rememberContext} onChange={(v) => setAiPrefs((p) => ({ ...p, rememberContext: v }))} label="AI memory" hint="Allow Kotka AI to remember context across conversations." />
            </div>
          ) : null}

          {active === 'trading' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Trading Preferences</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select label="Base currency" value={tradingPrefs.baseCurrency} onChange={(e) => setTradingPrefs((p) => ({ ...p, baseCurrency: e.target.value }))}>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </Select>
                <Input label="Daily loss limit (R)" type="number" value={tradingPrefs.dailyLossLimit} onChange={(e) => setTradingPrefs((p) => ({ ...p, dailyLossLimit: e.target.value }))} />
                <Input label="Default risk per trade (%)" type="number" value={tradingPrefs.defaultRisk} onChange={(e) => setTradingPrefs((p) => ({ ...p, defaultRisk: e.target.value }))} />
              </div>
            </div>
          ) : null}

          {active === 'privacy' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Privacy</h3>
              <Toggle checked={false} onChange={() => {}} label="Share anonymized data for benchmark analytics" hint="Helps improve Trader DNA benchmarks across the platform." />
              <Button variant="danger" size="sm">Delete my account</Button>
            </div>
          ) : null}

          {active === 'subscription' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Subscription</h3>
              <div className="flex items-center justify-between rounded-xl border border-ink-100 p-4 dark:border-ink-800">
                <div>
                  <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{user?.plan} plan</p>
                  <p className="text-xs text-ink-400">Renews monthly</p>
                </div>
                <Badge tone="accent">Active</Badge>
              </div>
              <Button variant="secondary" size="sm">Manage billing</Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
