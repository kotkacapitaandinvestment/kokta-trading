import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, ScrollText, Search, ShieldAlert, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { api } from '../../lib/api';

// What each recorded action means, as the end of a sentence about the person
// ("Ada signed in"). Unknown actions fall back to a readable version of the key.
const SENTENCE = {
  'auth.signed_up': 'created an account',
  'auth.signed_in': 'signed in',
  'auth.signed_out': 'signed out',
  'auth.sign_in_failed': 'tried to sign in and failed',
  'auth.sign_in_blocked': 'was paused after too many sign-in attempts',
  'auth.sign_in_refused': 'tried to sign in to a suspended or closed account',
  'account.name_changed': 'changed their display name',
  'account.photo_changed': 'changed their profile photo',
  'account.photo_removed': 'removed their profile photo',
  'account.password_changed': 'changed their password',
  'account.deleted': 'deleted their account',
  'account.push_enabled': 'turned on push notifications',
  'account.push_disabled': 'turned off push notifications on a device',
  'settings.trading_changed': 'changed their risk settings',
  'kyc.submitted': 'submitted identity verification',
  'kyc.resubmitted': 'resubmitted identity verification',
  'kyc.viewed': 'opened someone’s verification details',
  'kyc.approved': 'approved a verification',
  'kyc.rejected': 'asked for verification changes',
  'journal.trade_logged': 'logged a trade',
  'journal.position_opened': 'opened a position in their journal',
  'journal.position_closed': 'closed a position',
  'goals.checked_in': 'checked in',
  'goals.goal_set': 'set a goal',
  'goals.goal_locked': 'locked a goal',
  'goals.goal_abandoned': 'abandoned a goal',
  'goals.draft_deleted': 'deleted a draft goal',
  'goals.public_link_created': 'shared an achievement publicly',
  'goals.public_link_removed': 'removed a public achievement link',
  'goals.achievement_posted': 'posted an achievement to Community',
  'community.joined': 'joined Community',
  'community.username_changed': 'changed their Community username',
  'community.posted': 'posted in Community',
  'community.idea_posted': 'posted a trade idea',
  'community.post_deleted': 'deleted their post',
  'community.reported': 'reported something to moderators',
  'community.blocked_user': 'blocked a trader',
  'community.muted_user': 'muted a trader',
  'community.post_removed': 'removed a post as a moderator',
  'community.message_removed': 'removed a message as a moderator',
  'community.room_created': 'created a Community room',
  'community.room_updated': 'changed a Community room',
  'community.event_created': 'added a market event',
  'community.event_updated': 'changed a market event',
  'announcement.created': 'drafted an announcement',
  'announcement.updated': 'edited an announcement',
  'announcement.published': 'published an announcement',
  'announcement.unpublished': 'unpublished an announcement',
  'announcement.deleted': 'deleted an announcement',
  'user.updated': 'changed a user’s account',
  'platform.settings_updated': 'changed platform settings',
  'integration.created': 'connected a service',
  'integration.updated': 'updated a connected service',
  'research.settings_updated': 'changed research settings',
  'research.cron_token_rotated': 'renewed the research schedule’s access key',
  'research.assessment_created': 'added a source assessment',
  'research.assessment_updated': 'edited a source assessment',
  'research.assessment_deleted': 'deleted a source assessment',
};
const SECURITY = new Set(['auth.sign_in_failed', 'auth.sign_in_blocked', 'auth.sign_in_refused', 'account.password_changed', 'account.deleted']);

const words = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const SETTING = { dailyLossLimit: 'Daily loss limit', defaultRisk: 'Risk per trade', baseCurrency: 'Base currency', kycRequired: 'Verification required', signupsOpen: 'Sign-ups open', maintenanceMode: 'Maintenance mode' };
const SERVICE = { nvidia: 'Kotka AI', massive: 'market prices', finnhub: 'market news', fred: 'economic data', paystack: 'payments', cronjob: 'scheduled updates' };
const fmt = (v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : v == null || v === '' ? 'not set' : String(v));
const UNIT = { dailyLossLimit: 'R', defaultRisk: '%' };
const withUnit = (k, v) => (v == null || v === '' || typeof v === 'boolean' || !UNIT[k] ? fmt(v) : `${v}${UNIT[k]}`);
const changes = (obj) => Object.entries(obj ?? {}).filter(([, v]) => v && typeof v === 'object' && 'to' in v).map(([k, v]) => `${SETTING[k] ?? words(k)}: ${withUnit(k, v.from)} → ${withUnit(k, v.to)}`).join(' · ');

function detailText(log) {
  const d = log.detail ?? {};
  switch (log.action) {
    case 'auth.sign_in_failed':
    case 'auth.sign_in_blocked':
    case 'auth.sign_in_refused':
      return d.reason ?? '';
    case 'account.name_changed':
    case 'community.username_changed':
      return `${d.from ?? 'not set'} → ${d.to}`;
    case 'community.joined':
      return d.to ? `as @${d.to}` : '';
    case 'settings.trading_changed':
    case 'platform.settings_updated':
      return changes(d);
    case 'user.updated':
      return [d.email, ...['role', 'status', 'plan'].filter((k) => d[k]).map((k) => `${words(k)} ${fmt(d[k].from)} → ${fmt(d[k].to)}`)].filter(Boolean).join(' · ');
    case 'kyc.viewed':
    case 'kyc.approved':
    case 'kyc.rejected':
      return [d.userEmail, d.note ? `“${d.note}”` : null].filter(Boolean).join(' · ');
    case 'kyc.submitted':
    case 'kyc.resubmitted':
      return d.country ? `Country: ${d.country}` : '';
    case 'journal.trade_logged':
    case 'journal.position_opened':
    case 'journal.position_closed':
      return [d.market, d.direction, d.result].filter(Boolean).join(' · ');
    case 'goals.checked_in':
      return d.traded === false ? 'Stayed out of the market' : d.kept ? 'Kept to plan and risk rules' : 'Broke at least one of their rules';
    case 'goals.goal_set':
    case 'goals.goal_locked':
    case 'goals.goal_abandoned':
    case 'goals.draft_deleted':
      return [d.title, d.type, d.periodDays ? `${d.periodDays} days` : null].filter(Boolean).join(' · ');
    case 'goals.public_link_created':
      return [d.headline, d.sensitive?.length ? `Also shows: ${d.sensitive.join(', ')}` : 'No private details'].filter(Boolean).join(' · ');
    case 'goals.public_link_removed':
      return d.headline ?? '';
    case 'community.posted':
    case 'community.idea_posted':
      return [d.instrument, d.kind && d.kind !== 'post' && d.kind !== 'idea' ? words(d.kind) : null].filter(Boolean).join(' · ');
    case 'community.reported':
      return d.category ? `Reason: ${words(d.category)}` : '';
    case 'account.push_enabled':
      return d.device ?? '';
    case 'integration.created':
    case 'integration.updated':
      return [SERVICE[log.targetId] ?? log.targetId, d.secretChanged ? 'access key changed' : null, typeof d.enabled === 'boolean' ? (d.enabled ? 'turned on' : 'turned off') : null].filter(Boolean).join(' · ');
    case 'research.assessment_created':
    case 'research.assessment_updated':
    case 'research.assessment_deleted':
      return [d.currency, d.factor].filter(Boolean).join(' · ');
    case 'announcement.created':
    case 'announcement.updated':
    case 'announcement.published':
    case 'announcement.unpublished':
    case 'announcement.deleted':
      return d.title ? `“${d.title}”` : '';
    case 'account.deleted':
      return d.email ?? '';
    default:
      return '';
  }
}

const AREAS = [
  { value: '', label: 'Everything' },
  { value: 'auth.', label: 'Sign-ins' },
  { value: 'auth.sign_in_failed,auth.sign_in_blocked,auth.sign_in_refused,account.password_changed,account.deleted', label: 'Security' },
  { value: 'account.,settings.', label: 'Accounts' },
  { value: 'kyc.', label: 'Verification' },
  { value: 'journal.', label: 'Trading journal' },
  { value: 'goals.', label: 'Goal Room' },
  { value: 'community.joined,community.username_,community.posted,community.idea_posted,community.post_deleted,community.reported,community.blocked_user,community.muted_user', label: 'Community' },
  { value: 'user.,platform.,integration.,research.,announcement.,kyc.viewed,kyc.approved,kyc.rejected,community.post_removed,community.message_removed,community.room_,community.event_', label: 'Admin actions' },
];

function ago(at) {
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  if (m < 1440 * 7) return `${Math.round(m / 1440)} d ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Entry({ log, onPerson }) {
  const who = log.actorName ?? log.actorEmail ?? 'Someone';
  const security = SECURITY.has(log.action);
  const detail = detailText(log);
  const meta = [log.detail?.device, log.ip ? `IP ${log.ip}` : null, log.detail?.backfilled ? 'from earlier records' : null].filter(Boolean).join(' · ');
  const staff = ['admin', 'super_admin', 'moderator'].includes(log.actorRole);
  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5">
      <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', security ? 'bg-loss-50 text-loss-600 dark:bg-loss-500/10 dark:text-loss-400' : staff ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-accent-500/15 text-accent-800 dark:text-accent-300')}>
        {security ? <ShieldAlert className="h-4 w-4" /> : (who.match(/\b\w/g) ?? ['?']).slice(0, 2).join('').toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-700 dark:text-ink-200">
          {log.actorId ? (
            <button type="button" onClick={() => onPerson(log.actorId)} className="font-semibold text-ink-900 hover:underline dark:text-ink-50">{who}</button>
          ) : (
            <span className="font-semibold text-ink-900 dark:text-ink-50">{who}</span>
          )}
          {staff ? <span className="ml-1.5 rounded bg-ink-100 px-1 py-px text-[10px] font-semibold uppercase text-ink-500 dark:bg-ink-800 dark:text-ink-400">Staff</span> : null}{' '}
          {SENTENCE[log.action] ?? words(log.action.split('.').pop())}
        </p>
        {detail ? <p className="mt-0.5 break-words text-xs text-ink-500 dark:text-ink-400">{detail}</p> : null}
        <p className="mt-0.5 text-[11px] text-ink-400">
          <time dateTime={log.createdAt} title={new Date(log.createdAt).toLocaleString()}>{ago(log.createdAt)}</time>
          {log.actorName && log.actorEmail ? ` · ${log.actorEmail}` : ''}
          {meta ? ` · ${meta}` : ''}
        </p>
      </div>
    </li>
  );
}

export default function AdminAuditLogs() {
  const [params, setParams] = useSearchParams();
  const userId = params.get('user');
  const [logs, setLogs] = useState([]);
  const [person, setPerson] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [area, setArea] = useState('');
  const [query, setQuery] = useState('');

  const fetchPage = useCallback(
    (after) => {
      const q = new URLSearchParams({ limit: '50' });
      if (area) q.set('action', area);
      if (query.trim()) q.set('q', query.trim());
      if (userId) q.set('user', userId);
      if (after) q.set('cursor', after);
      setLoading(true);
      setError(null);
      return api
        .get(`/admin/platform/audit-logs?${q}`)
        .then((res) => {
          setLogs((prev) => (after ? [...prev, ...res.logs] : res.logs));
          setCursor(res.nextCursor);
          setPerson(res.user);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [area, query, userId],
  );

  useEffect(() => {
    const t = setTimeout(() => fetchPage(null), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchPage, query]);

  const showPerson = (id) => setParams({ user: id });

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Audit Log"
        description="What people do in Kotka that matters for security and support: sign-ins, account and risk-setting changes, verification, trades logged, goals, Community activity and every admin action. Entries can't be edited or deleted."
      />

      {userId ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
          <p className="text-sm text-ink-700 dark:text-ink-200">
            Showing activity for <span className="font-semibold text-ink-900 dark:text-ink-50">{person?.name ?? 'this person'}</span>{person?.email ? <span className="text-ink-400"> · {person.email}</span> : null}: what they did, and what was done to their account.
          </p>
          <Button size="sm" variant="ghost" icon={X} className="ml-auto" onClick={() => setParams({})}>Show everyone</Button>
        </div>
      ) : null}

      <Card>
        <div className="space-y-3 border-b border-ink-100 p-4 dark:border-ink-800">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a person by email"
              aria-label="Find a person by email"
              className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {AREAS.map((a) => (
              <button key={a.label} type="button" onClick={() => setArea(a.value)} aria-pressed={area === a.value} className={clsx('rounded-full px-3 py-1.5 text-xs font-medium transition-colors', area === a.value ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700')}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p role="alert" className="p-4 text-sm text-loss-500">We couldn’t load the log: {error}</p> : null}

        {!loading && !logs.length && !error ? (
          <div className="p-6">
            <EmptyState icon={ScrollText} title="Nothing here yet" description={userId ? 'No recorded activity for this person with these filters.' : 'No activity matches these filters.'} />
          </div>
        ) : (
          <ol className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {logs.map((log) => <Entry key={log.id} log={log} onPerson={showPerson} />)}
          </ol>
        )}
        {loading && !logs.length ? <div className="m-4 h-40 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}

        {cursor ? (
          <div className="border-t border-ink-100 p-3 text-center dark:border-ink-800">
            <Button variant="ghost" size="sm" iconRight={ChevronDown} disabled={loading} onClick={() => fetchPage(cursor)}>
              {loading ? 'Loading…' : 'Show older activity'}
            </Button>
          </div>
        ) : null}
      </Card>
      <p className="mt-3 text-[11px] text-ink-400">
        Activity before 27 September 2026 was recorded from existing sign-up, sign-in, journal and Community records. Checklist ticks, messages and AI chats aren’t logged here. See <Link to="/admin/ai-usage" className="underline">AI Usage</Link> for Kotka AI.
      </p>
    </div>
  );
}
