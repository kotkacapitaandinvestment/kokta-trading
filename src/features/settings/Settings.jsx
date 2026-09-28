import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { User, Lock, BadgeCheck, Bell, Palette, Sparkles, LineChart, AlertTriangle, CheckCircle2, AlertCircle, Clock3, MessagesSquare, Camera, Loader2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { mailto } from '../../lib/contact';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import PushSettings from './PushSettings';
import { DevicesSection, TwoStepSection } from './SecuritySettings';
import EmailSettings from './EmailSettings';
import { uploadAvatar, removeAvatar } from '../../lib/avatar';
import { useCommunity } from '../community/CommunityContext';

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Password & security', icon: Lock },
  { id: 'verification', label: 'Verification', icon: BadgeCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'community', label: 'Community', icon: MessagesSquare },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'ai', label: 'Kotka AI', icon: Sparkles },
  { id: 'trading', label: 'Trading', icon: LineChart },
  { id: 'account', label: 'Delete account', icon: AlertTriangle },
];

function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <p className="text-sm font-medium text-ink-700 dark:text-ink-200">{label}</p>
        {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx('h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-ink-900 dark:bg-white' : 'bg-ink-200 dark:bg-ink-700')}
      >
        <span className={clsx('block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform dark:bg-ink-900', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

function SectionTitle({ title, description }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h3>
      {description ? <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-500 dark:text-ink-400">{description}</p> : null}
    </div>
  );
}

function Notice({ tone, children }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2;
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex items-center gap-1.5 text-xs', tone === 'error' ? 'text-loss-500' : 'text-profit-600 dark:text-profit-400')}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

// Profile photo: shown in the top bar and on everything you post in Community.
function AvatarPicker() {
  const { user, setUser } = useAuth();
  const community = useCommunity();
  const input = useRef(null);
  const [state, setState] = useState(null);
  const run = async (fn) => {
    setState({ busy: true });
    try {
      const updated = await fn();
      setUser(updated);
      community.refresh?.();
      setState(null);
    } catch (err) {
      setState({ error: err.message });
    }
  };
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={state?.busy}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-900"
        aria-label={user?.avatarUrl ? 'Change profile photo' : 'Add profile photo'}
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-accent-500 text-lg font-semibold text-ink-950">{user?.initials}</span>
        )}
        <span className={clsx('absolute inset-0 flex items-center justify-center bg-ink-950/50 text-white transition-opacity', state?.busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          {state?.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) run(() => uploadAvatar(file));
        }}
      />
      <div className="min-w-0 text-xs text-ink-500 dark:text-ink-400">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" icon={Camera} disabled={state?.busy} onClick={() => input.current?.click()}>
            {user?.avatarUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {user?.avatarUrl ? (
            <Button type="button" size="sm" variant="ghost" disabled={state?.busy} onClick={() => run(removeAvatar)}>Remove</Button>
          ) : null}
        </div>
        <p className="mt-1.5">Square crop, shown in the app and on your Community posts.</p>
        {state?.error ? <p role="alert" className="mt-1 text-loss-500">{state.error}</p> : null}
      </div>
    </div>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [state, setState] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setState({ saving: true });
    try {
      const { user: updated } = await api.patch('/account/profile', { name });
      setUser(updated);
      setState({ ok: 'Saved.' });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <SectionTitle title="Profile" description="Your display name appears in the app. Your email is your sign-in and can't be changed here." />
      <AvatarPicker />
      <p className="text-xs text-ink-500 dark:text-ink-400">
        <span className="font-medium text-ink-700 dark:text-ink-200">Member since {user?.memberSince}</span> · {user?.plan} plan
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Display name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        <Input label="Email" name="email" value={user?.email ?? ''} readOnly disabled />
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" type="submit" disabled={state?.saving || !name.trim() || name.trim() === user?.name}>
          {state?.saving ? 'Saving…' : 'Save changes'}
        </Button>
        {state?.ok ? <Notice>{state.ok}</Notice> : null}
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      </div>
    </form>
  );
}

function PasswordSection() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [state, setState] = useState(null);
  const mismatch = form.confirm && form.newPassword !== form.confirm;

  const save = async (e) => {
    e.preventDefault();
    if (mismatch) return;
    setState({ saving: true });
    try {
      const r = await api.post('/account/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setState({ ok: r.signedOut ? `Password updated. ${r.signedOut} other device${r.signedOut === 1 ? ' was' : 's were'} signed out.` : 'Password updated.' });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <form onSubmit={save} className="max-w-md space-y-4">
      <SectionTitle title="Password" description="Use at least 8 characters. A passphrase of a few unrelated words is easier to remember and harder to guess. Changing it signs out your other devices." />
      <Input label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
      <Input label="New password" type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
      <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={mismatch ? 'Passwords do not match.' : undefined} required />
      <div className="flex items-center gap-3">
        <Button size="sm" type="submit" disabled={state?.saving || !form.currentPassword || form.newPassword.length < 8 || mismatch}>
          {state?.saving ? 'Updating…' : 'Update password'}
        </Button>
        {state?.ok ? <Notice>{state.ok}</Notice> : null}
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      </div>
    </form>
  );
}

const KYC_COPY = {
  none: { tone: 'neutral', label: 'Not submitted', icon: AlertCircle, text: 'You have not submitted your identity details yet.' },
  pending: { tone: 'warning', label: 'In review', icon: Clock3, text: 'We’re reviewing your details. You have full access in the meantime.' },
  approved: { tone: 'profit', label: 'Verified', icon: BadgeCheck, text: 'Your identity is verified.', help: true },
  rejected: { tone: 'loss', label: 'Needs changes', icon: AlertCircle, text: 'We need you to correct a few details.' },
};

function VerificationSection() {
  const [kyc, setKyc] = useState(null);
  const [error, setError] = useState(null);
  const { supportEmail } = useAppConfig();

  useEffect(() => {
    api.get('/kyc').then(({ kyc }) => setKyc(kyc)).catch((err) => setError(err.message));
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!kyc) return <div className="h-32 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />;
  const copy = KYC_COPY[kyc.status] ?? KYC_COPY.none;
  const d = kyc.details;

  return (
    <div className="space-y-5">
      <SectionTitle title="Identity verification" description="Kotka verifies every trader account. Your details are encrypted and only visible to administrators reviewing them." />
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={copy.tone}>
          <copy.icon className="h-3.5 w-3.5" />
          {copy.label}
        </Badge>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          {copy.text}
          {copy.help ? <> To change verified details, email <a className="font-medium text-accent-600 hover:underline dark:text-accent-400" href={mailto(supportEmail, 'Change my verified details')}>{supportEmail}</a>.</> : null}
        </p>
      </div>
      {kyc.status === 'rejected' && kyc.reviewNote ? (
        <p className="rounded-xl border border-loss-500/25 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">{kyc.reviewNote}</p>
      ) : null}
      {d ? (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-ink-100 pt-5 text-sm dark:border-ink-800 sm:grid-cols-2">
          {[
            ['Legal name', [d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ')],
            ['Date of birth', d.dateOfBirth],
            ['Country', kyc.countryName],
            ['Phone', d.phone],
            ['Address', [d.address?.line1, d.address?.line2, d.address?.city, d.address?.region, d.address?.postalCode].filter(Boolean).join(', ')],
            ['Submitted', new Date(kyc.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-ink-400">{k}</dt>
              <dd className="mt-0.5 text-ink-800 dark:text-ink-100">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {kyc.status !== 'approved' ? (
        <Button as={Link} to="/verify" size="sm" variant={kyc.status === 'pending' ? 'secondary' : 'primary'}>
          {kyc.status === 'none' ? 'Verify now' : kyc.status === 'rejected' ? 'Correct my details' : 'Update details'}
        </Button>
      ) : null}
    </div>
  );
}

function DeleteAccountSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [state, setState] = useState(null);

  const remove = async (e) => {
    e.preventDefault();
    setState({ saving: true });
    try {
      await api.delete('/account', { password });
      await logout().catch(() => {});
      navigate('/', { replace: true });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Delete account"
        description="Permanently deletes your account, journal, checklist history, Kotka AI conversations, settings and verification details. This cannot be undone."
      />
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Delete my account</Button>
      <Modal open={open} onClose={() => { setOpen(false); setState(null); }} title="Delete your Kotka account">
        <form onSubmit={remove} className="space-y-4">
          <p className="text-sm text-ink-600 dark:text-ink-300">Everything tied to this account is erased immediately. Enter your password and type DELETE to confirm.</p>
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Input label="Type DELETE" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" required />
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={state?.saving || !password || confirmText !== 'DELETE'}>
              {state?.saving ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


const COMMUNITY_NOTIFY = [
  ['messages', 'Direct and group messages'],
  ['achievements', 'Goal Room achievements and monthly reviews'],
  ['mentions', 'Mentions'],
  ['replies', 'Replies to you'],
  ['follows', 'New followers'],
  ['activity', 'Reactions, comments and challenges on your posts'],
  ['ideas', 'Trade ideas from traders you follow, and updates to ideas you follow'],
  ['events', 'Reminders before events you follow or that affect your markets'],
  ['markets', 'Unusual daily moves in markets you follow'],
  ['news', 'Official central-bank releases for markets you follow'],
];

function CommunitySection() {
  const [prefs, setPrefs] = useState(null);
  const [relations, setRelations] = useState(null);
  const load = () => {
    api.get('/community/me').then((r) => setPrefs(r.prefs)).catch(() => {});
    api.get('/community/relations').then(setRelations).catch(() => setRelations({ blocked: [], muted: [] }));
  };
  useEffect(load, []);
  const save = (patch) => {
    setPrefs((p) => ({ ...p, notify: { ...p.notify, ...(patch.notify ?? {}) }, privacy: { ...p.privacy, ...(patch.privacy ?? {}) } }));
    api.put('/community/me/preferences', patch).catch(() => {});
  };
  const undo = async (kind, id) => {
    await api.delete(`/community/users/${id}/${kind}`);
    load();
  };
  if (!prefs) return <div className="h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />;
  return (
    <div className="space-y-8">
      <div>
        <SectionTitle title="Community notifications" description="Choose what reaches your notification centre." />
        <div className="divide-y divide-ink-100 dark:divide-ink-800">
          {COMMUNITY_NOTIFY.map(([k, label]) => <Toggle key={k} label={label} checked={prefs.notify[k] !== false} onChange={(v) => save({ notify: { [k]: v } })} />)}
        </div>
      </div>
      <div>
        <SectionTitle title="Privacy" description="What other traders can see and do." />
        <div className="divide-y divide-ink-100 dark:divide-ink-800">
          <Toggle label="Show when I'm online" hint="Others see Online or when you were last active." checked={prefs.privacy.showOnline} onChange={(v) => save({ privacy: { showOnline: v } })} />
          <Toggle label="Send read receipts" hint="Others see when you've read their messages." checked={prefs.privacy.readReceipts} onChange={(v) => save({ privacy: { readReceipts: v } })} />
          <div className="flex items-center justify-between gap-6 py-3">
            <div><p className="text-sm font-medium text-ink-700 dark:text-ink-200">Who can message you</p><p className="text-xs text-ink-400">Existing conversations continue either way.</p></div>
            <select value={prefs.privacy.allowDmsFrom} onChange={(e) => save({ privacy: { allowDmsFrom: e.target.value } })} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
              <option value="everyone">Everyone</option>
              <option value="following">People I follow</option>
              <option value="nobody">Nobody</option>
            </select>
          </div>
        </div>
      </div>
      <div>
        <SectionTitle title="Blocked and muted" description="Blocked traders can't message you and you don't see each other's content. Muted traders are hidden from you only." />
        {relations && !relations.blocked.length && !relations.muted.length ? <p className="text-sm text-ink-400">Nobody blocked or muted.</p> : null}
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {[...(relations?.blocked ?? []).map((u) => ['block', u]), ...(relations?.muted ?? []).map((u) => ['mute', u])].map(([kind, u]) => (
            <li key={`${kind}${u.id}`} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink-700 dark:text-ink-200">{u.name} <span className="text-xs text-ink-400">@{u.username} · {kind === 'block' ? 'blocked' : 'muted'}</span></span>
              <Button size="sm" variant="ghost" onClick={() => undo(kind, u.id)}>{kind === 'block' ? 'Unblock' : 'Unmute'}</Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [params, setParams] = useSearchParams();
  const active = sections.some((s) => s.id === params.get('section')) ? params.get('section') : 'profile';
  const setActive = (id) => setParams({ section: id }, { replace: true });
  const tabsRef = useRef(null);

  // Phones show the sections as a sideways strip; keep the open one in view.
  useEffect(() => {
    const strip = tabsRef.current;
    const el = strip?.querySelector('[aria-current="page"]');
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth) return;
    const a = strip.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    strip.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }, [active]);
  const [prefs, setPrefs] = useState(null);

  useEffect(() => {
    api.get('/settings').then(({ settings }) => setPrefs(settings)).catch(() => {});
  }, []);

  // Preferences save as they change; each group is written as a whole.
  const update = (group, changes) => {
    setPrefs((prev) => {
      const next = { ...prev[group], ...changes };
      api.put('/settings', { [group]: next }).catch(() => {});
      return { ...prev, [group]: next };
    });
  };

  return (
    <div>
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, sign-in, verification and how Kotka behaves for you." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <nav aria-label="Settings sections" className="lg:col-span-1">
          <ul ref={tabsRef} className="flex gap-1 overflow-x-auto scrollbar-thin lg:flex-col lg:gap-0.5">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  onClick={() => setActive(s.id)}
                  aria-current={active === s.id ? 'page' : undefined}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active === s.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-600 hover:bg-white dark:text-ink-300 dark:hover:bg-ink-800',
                    s.id === 'account' && active !== s.id && 'text-loss-600 dark:text-loss-400',
                  )}
                >
                  <s.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <Card className="p-6 lg:col-span-3 lg:p-8">
          {active === 'profile' ? <ProfileSection /> : null}
          {active === 'security' ? (
            <div className="space-y-10">
              <PasswordSection />
              <TwoStepSection />
              <DevicesSection />
            </div>
          ) : null}
          {active === 'verification' ? <VerificationSection /> : null}
          {active === 'community' ? <CommunitySection /> : null}
          {active === 'account' ? <DeleteAccountSection /> : null}

          {active === 'theme' ? (
            <div>
              <SectionTitle title="Theme" description="Saved on this device." />
              <div className="grid max-w-md grid-cols-2 gap-3">
                {['light', 'dark'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    aria-pressed={theme === t}
                    className={clsx('rounded-xl border p-4 text-left capitalize transition-colors', theme === t ? 'border-ink-900 dark:border-white' : 'border-ink-200 hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600')}
                  >
                    <span className={clsx('mb-3 block h-10 rounded-lg border', t === 'light' ? 'border-ink-100 bg-ink-50' : 'border-ink-700 bg-ink-900')} />
                    <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{t} mode</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {['notifications', 'ai', 'trading'].includes(active) && !prefs ? <div className="h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}

          {active === 'notifications' ? <EmailSettings /> : null}
          {active === 'notifications' ? <PushSettings /> : null}
          {active === 'notifications' && prefs ? (
            <div>
              <SectionTitle title="Reminders" description="Choose which reminders appear in your notification centre." />
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                <Toggle checked={prefs.notifications.checklist !== false} onChange={(v) => update('notifications', { checklist: v })} label="Checklist reminders" hint="When today's pre-trade checklist is incomplete." />
                <Toggle checked={prefs.notifications.journal !== false} onChange={(v) => update('notifications', { journal: v })} label="Journal reminders" hint="When you haven't logged a trade today." />
                <Toggle checked={prefs.notifications.riskWarnings !== false} onChange={(v) => update('notifications', { riskWarnings: v })} label="Risk warnings" hint="When you approach or reach your daily loss limit." />
              </div>
            </div>
          ) : null}

          {active === 'ai' && prefs ? (
            <div className="max-w-md">
              <SectionTitle title="Kotka AI" description="How Kotka AI talks to you. It never gives trade signals, whatever the tone." />
              <Select label="Coaching tone" value={prefs.aiPreferences.tone} onChange={(e) => update('aiPreferences', { tone: e.target.value })}>
                <option>Direct & challenging</option>
                <option>Supportive & measured</option>
                <option>Purely analytical</option>
              </Select>
            </div>
          ) : null}

          {active === 'trading' && prefs ? (
            <div>
              <SectionTitle title="Trading" description="Your risk rules. Kotka uses them on the dashboard, in analytics and for risk warnings." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select label="Base currency" value={prefs.tradingPreferences.baseCurrency} onChange={(e) => update('tradingPreferences', { baseCurrency: e.target.value })}>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </Select>
                <Input label="Daily loss limit (R)" hint="R is what you risk on one trade. 2 means stop after two full losses." type="number" min="0.5" step="0.5" value={prefs.tradingPreferences.dailyLossLimit} onChange={(e) => update('tradingPreferences', { dailyLossLimit: Number(e.target.value) })} />
                <Input label="Risk per trade (% of account)" hint="What you usually risk on a single trade." type="number" min="0.1" step="0.1" value={prefs.tradingPreferences.defaultRisk} onChange={(e) => update('tradingPreferences', { defaultRisk: Number(e.target.value) })} />
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
