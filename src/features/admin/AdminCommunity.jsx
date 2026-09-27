import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, Check, ExternalLink, Plus, ShieldCheck, Star } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { confirmDialog, promptDialog, toast } from '../../lib/dialogs';
import EmptyState from '../../components/ui/EmptyState';

const TABS = [
  ['overview', 'Overview'],
  ['moderation', 'Moderation'],
  ['log', 'Moderation log'],
  ['rooms', 'Rooms'],
  ['events', 'Events'],
  ['content', 'Content'],
  ['analytics', 'Analytics'],
  ['users', 'People'],
];
const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${Math.max(m, 1)}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

function Overview() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/admin/community/overview').then(setD).catch(() => {}); }, []);
  const tiles = d ? [
    ['Members', d.members, 'Traders with a Community username'],
    ['Active today', d.activeToday, 'Posted, messaged or commented in 24h'],
    ['Messages today', d.messagesToday],
    ['Posts today', d.postsToday],
    ['Trade ideas', d.ideas, `${d.openIdeas} open`],
    ['Active rooms', d.activeRooms, 'Rooms, events and communities with messages in 24h'],
    ['Private chats active', d.privateConversationsActive, 'DMs and groups with messages in 24h'],
    ['Events next 7 days', d.upcomingEvents],
    ['Open reports', d.openReports, 'Waiting for a moderator'],
    ['Moderation actions', d.moderationActions7d, 'Last 7 days'],
  ] : [];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {!d ? <div className="col-span-full h-40 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : null}
      {tiles.map(([l, v, hint]) => (
        <div key={l} className={clsx('rounded-2xl border bg-white px-4 py-3 dark:bg-ink-900', l === 'Open reports' && v ? 'border-amber-500/40' : 'border-ink-100 dark:border-ink-800')}>
          <p className="text-xs text-ink-500 dark:text-ink-400">{l}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{v}</p>
          {hint ? <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Moderation() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [acting, setActing] = useState(null);
  const [reason, setReason] = useState('');
  const load = () => api.get(`/admin/community/reports?status=${status}`).then(setData).catch(() => setData({ reports: [], counts: {} }));
  useEffect(() => { setData(null); load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (report, action, extra = {}) => {
    try {
      await api.post('/admin/community/actions', { reportId: report.id, action, reason: reason || undefined, ...extra });
      setActing(null);
      setReason('');
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {['open', 'actioned', 'dismissed'].map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={clsx('rounded-full px-3 py-1.5 text-xs font-medium capitalize', status === s ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'bg-white text-ink-600 dark:bg-ink-900 dark:text-ink-300')}>{s} {data?.counts?.[s] ? <span className="tabular-nums opacity-70">{data.counts[s]}</span> : null}</button>)}
      </div>
      {!data ? <div className="h-40 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : null}
      {data && !data.reports.length ? <p className="rounded-2xl bg-white p-10 text-center text-sm text-ink-400 dark:bg-ink-900">Nothing here.</p> : null}
      {data?.reports.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={r.category === 'scam' || r.category === 'fraud' ? 'loss' : 'warning'}>{{ spam: 'Spam', scam: 'Scam', harassment: 'Harassment', hate: 'Hate', impersonation: 'Impersonation', fraud: 'Fraud', manipulation: 'Market manipulation', illegal: 'Illegal', other: 'Other' }[r.category] ?? r.category}</Badge>
              <span className="font-medium capitalize text-ink-700 dark:text-ink-200">{r.targetType}</span>
              <span className="text-ink-400">{r.auto ? 'Flagged automatically' : `Reported by ${r.reporter?.name ?? 'a trader'}`} · {ago(r.createdAt)}</span>
            </div>
            {r.target?.link ? <Link to={r.target.link} target="_blank" className="inline-flex items-center gap-1 text-xs text-accent-700 hover:underline dark:text-accent-300">Open <ExternalLink className="h-3 w-3" /></Link> : null}
          </div>
          {r.details ? <p className="mt-2 text-xs text-ink-500">Note: {r.details}</p> : null}
          <blockquote className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 border-ink-300 bg-ink-50 p-3 text-sm text-ink-800 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-100">
            {r.target ? (r.target.text || '(no text)') : 'The reported item no longer exists.'}
            {r.target?.removed ? <span className="mt-1 block text-xs text-loss-500">Already removed</span> : null}
            {r.target?.context ? <span className="mt-1 block text-[11px] text-ink-400">In {r.target.context.name ?? 'a direct message'} ({r.target.context.kind}). Shown only because it was reported.</span> : null}
          </blockquote>
          {r.targetUser ? (
            <p className="mt-3 text-xs text-ink-500">
              Author: <span className="font-medium text-ink-800 dark:text-ink-100">{r.targetUser.name}</span> @{r.targetUser.username} · account {r.targetUser.accountStatus} · {r.targetUser.reportsTotal} report{r.targetUser.reportsTotal === 1 ? '' : 's'} in total
              {r.targetUser.mutedUntil && new Date(r.targetUser.mutedUntil) > new Date() ? ` · posting paused until ${new Date(r.targetUser.mutedUntil).toLocaleString()}` : ''}
            </p>
          ) : null}
          {r.status !== 'open' ? <p className="mt-2 text-xs text-ink-400">{{ resolved: 'Resolved', dismissed: 'Dismissed', actioned: 'Action taken' }[r.status] ?? r.status} by {r.resolvedBy?.name ?? 'a moderator'} · {r.resolution}</p> : (
            <div className="mt-4 flex flex-wrap gap-2">
              {r.target && !r.target.removed && r.targetType !== 'user' ? <Button size="sm" variant="danger" onClick={() => setActing({ r, action: 'remove' })}>Remove</Button> : null}
              {r.targetUser ? <Button size="sm" variant="secondary" onClick={() => setActing({ r, action: 'mute' })}>Pause posting</Button> : null}
              {isAdmin && r.targetUser ? <Button size="sm" variant="secondary" onClick={() => setActing({ r, action: 'suspend' })}>Suspend account</Button> : null}
              {isAdmin && r.targetUser ? <Button size="sm" variant="ghost" onClick={() => setActing({ r, action: 'ban' })}>Ban</Button> : null}
              <Button size="sm" variant="ghost" onClick={() => act(r, 'dismiss')}>Dismiss</Button>
            </div>
          )}
        </Card>
      ))}
      {acting ? (
        <Modal open onClose={() => setActing(null)} title={{ remove: 'Remove content', mute: 'Pause posting', suspend: 'Suspend account', ban: 'Ban account' }[acting.action]}>
          <div className="space-y-3">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Reason (shown to the trader for removals and pauses, and kept in the log)" className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            {acting.action === 'mute' ? (
              <div className="flex gap-2">{[[24, '24 hours'], [72, '3 days'], [168, '7 days'], [720, '30 days']].map(([h, l]) => <Button key={h} size="sm" variant="secondary" onClick={() => act(acting.r, 'mute', { hours: h })}>{l}</Button>)}</div>
            ) : (
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setActing(null)}>Cancel</Button><Button variant="danger" onClick={() => act(acting.r, acting.action)}>Confirm</Button></div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Log() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/admin/community/log').then((r) => setRows(r.actions)).catch(() => setRows([])); }, []);
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800"><th className="px-5 py-3 font-medium">When</th><th className="px-5 py-3 font-medium">Moderator</th><th className="px-5 py-3 font-medium">Action</th><th className="px-5 py-3 font-medium">Target</th><th className="px-5 py-3 font-medium">Reason</th></tr></thead>
          <tbody className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {rows?.map((a) => <tr key={a.id}><td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-ink-500">{new Date(a.createdAt).toLocaleString()}</td><td className="px-5 py-2.5">{a.moderator?.name ?? 'System'}</td><td className="px-5 py-2.5 font-medium capitalize">{a.action}</td><td className="px-5 py-2.5 text-xs text-ink-500">{a.targetType}{a.targetUser ? ` · ${a.targetUser.name}` : ''}</td><td className="px-5 py-2.5 text-xs text-ink-500">{a.reason ?? ''}</td></tr>)}
          </tbody>
        </table>
        {rows && !rows.length ? <EmptyState size="section" icon={ShieldCheck} title="No moderation actions yet" description="Removals, mutes and bans you or other moderators make are recorded here." /> : null}
      </div>
    </Card>
  );
}

function Rooms() {
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', visibility: 'public', sendPolicy: 'everyone', featured: true });
  const load = () => api.get('/admin/community/rooms').then((r) => setRows(r.rooms)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const patch = async (id, data) => {
    try {
      await api.patch(`/admin/community/rooms/${id}`, data);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const create = async () => {
    try {
      await api.post('/admin/community/rooms', form);
      setCreating(false);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Official community</Button></div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800"><th className="px-5 py-3 font-medium">Room</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Members</th><th className="px-5 py-3 font-medium">Messages</th><th className="px-5 py-3 font-medium">Last activity</th><th className="px-5 py-3 font-medium">Settings</th></tr></thead>
            <tbody className="divide-y divide-ink-50 dark:divide-ink-800/60">
              {rows?.map((r) => (
                <tr key={r.id} className={r.archived ? 'opacity-50' : ''}>
                  <td className="px-5 py-2.5"><span className="font-medium text-ink-800 dark:text-ink-100">{r.name}</span>{r.featured ? <Star className="ml-1 inline h-3 w-3 fill-accent-500 text-accent-500" /> : null}{r.description ? <span className="block max-w-xs truncate text-xs text-ink-400">{r.description}</span> : null}</td>
                  <td className="px-5 py-2.5 text-xs capitalize text-ink-500">{r.kind}{r.kind === 'community' ? ` · ${r.visibility.replace('_', ' ')}` : ''}</td>
                  <td className="px-5 py-2.5 tabular-nums">{r.members}</td>
                  <td className="px-5 py-2.5 tabular-nums">{r.messageCount}</td>
                  <td className="px-5 py-2.5 text-xs text-ink-500">{r.lastMessageAt ? ago(r.lastMessageAt) : 'never'}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <select value={r.sendPolicy} onChange={(e) => patch(r.id, { sendPolicy: e.target.value })} className="h-7 rounded border border-ink-200 bg-white px-1 text-xs dark:border-ink-700 dark:bg-ink-800" aria-label="Who can send"><option value="everyone">Everyone</option><option value="admins">Admins only</option></select>
                      {r.kind === 'community' ? <Button size="sm" variant="ghost" onClick={() => patch(r.id, { featured: !r.featured })}>{r.featured ? 'Unfeature' : 'Feature'}</Button> : null}
                      <Button size="sm" variant="ghost" onClick={() => patch(r.id, { archived: !r.archived })}>{r.archived ? 'Restore' : 'Archive'}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && !rows.length ? <p className="p-8 text-center text-sm text-ink-400">Rooms are created when traders first open a market or event.</p> : null}
        </div>
      </Card>
      {creating ? (
        <Modal open onClose={() => setCreating(false)} title="New official community">
          <div className="space-y-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" maxLength={60} className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" maxLength={300} rows={2} className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800"><option value="public">Public</option><option value="private">Private (approval)</option><option value="invite_only">Invite only</option></select>
              <select value={form.sendPolicy} onChange={(e) => setForm({ ...form, sendPolicy: e.target.value })} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800"><option value="everyone">Everyone can send</option><option value="admins">Admins only (announcements)</option></select>
            </div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={create} disabled={form.name.trim().length < 3}>Create</Button></div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Events() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', currency: 'USD', scheduledAt: '', importance: 'High', sourceName: '', sourceUrl: '' });
  const load = () => api.get('/admin/community/events').then((r) => setRows(r.events)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const save = async () => {
    try {
      await api.patch(`/admin/community/events/${editing.id}`, { previous: editing.previous, forecast: editing.forecast, actual: editing.actual, valuesNote: editing.valuesNote, importance: editing.importance, cancelled: editing.cancelled });
      setEditing(null);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const create = async () => {
    try {
      await api.post('/admin/community/events', { ...form, scheduledAt: new Date(form.scheduledAt).toISOString() });
      setCreating(false);
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const input = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Events sync automatically from the Fed, BLS, BEA, ECB and Eurostat calendars. Add figures from the release with their source.</p>
        <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Add event</Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800"><th className="px-5 py-3 font-medium">When</th><th className="px-5 py-3 font-medium">Event</th><th className="px-5 py-3 font-medium">Source</th><th className="px-5 py-3 font-medium">Prev / Fcst / Actual</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y divide-ink-50 dark:divide-ink-800/60">
              {rows?.map((e) => (
                <tr key={e.id} className={e.cancelled ? 'opacity-50' : ''}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-ink-500">{new Date(e.scheduledAt).toLocaleString(undefined, { day: 'numeric', month: 'short', ...(e.dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }) })}</td>
                  <td className="px-5 py-2.5"><span className="font-medium text-ink-800 dark:text-ink-100">{e.title}</span><span className="block text-xs text-ink-400">{e.currency} · {e.importance}</span></td>
                  <td className="px-5 py-2.5 text-xs uppercase text-ink-500">{e.source}</td>
                  <td className="px-5 py-2.5 font-mono text-xs">{e.previous ?? '-'} / {e.forecast ?? '-'} / {e.actual ?? '-'}</td>
                  <td className="px-5 py-2.5 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing({ ...e })}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing ? (
        <Modal open onClose={() => setEditing(null)} title={editing.title}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">{['previous', 'forecast', 'actual'].map((k) => <label key={k} className="block"><span className="mb-1 block text-xs capitalize text-ink-500">{k}</span><input value={editing[k] ?? ''} onChange={(ev) => setEditing({ ...editing, [k]: ev.target.value })} maxLength={40} className={input} /></label>)}</div>
            <label className="block"><span className="mb-1 block text-xs text-ink-500">Where the figures come from (required with figures)</span><input value={editing.valuesNote ?? ''} onChange={(ev) => setEditing({ ...editing, valuesNote: ev.target.value })} maxLength={200} placeholder="e.g. BLS release; forecast is Reuters poll median" className={input} /></label>
            <div className="grid grid-cols-2 gap-2">
              <select value={editing.importance} onChange={(ev) => setEditing({ ...editing, importance: ev.target.value })} className={input}><option>High</option><option>Medium</option><option>Low</option></select>
              <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300"><input type="checkbox" checked={!!editing.cancelled} onChange={(ev) => setEditing({ ...editing, cancelled: ev.target.checked })} /> Cancelled</label>
            </div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></div>
          </div>
        </Modal>
      ) : null}
      {creating ? (
        <Modal open onClose={() => setCreating(false)} title="Add event">
          <div className="space-y-3">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. UK CPI (August)" className={input} />
            <div className="grid grid-cols-3 gap-2">
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="GBP" className={input} aria-label="Currency" />
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className={clsx(input, 'col-span-2')} aria-label="Date and time" />
            </div>
            <select value={form.importance} onChange={(e) => setForm({ ...form, importance: e.target.value })} className={input}><option>High</option><option>Medium</option><option>Low</option></select>
            <input value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} placeholder="Source name, e.g. Office for National Statistics" className={input} />
            <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https:// link to the official calendar" className={input} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={create} disabled={!form.title || !form.scheduledAt}>Add</Button></div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Content() {
  const [d, setD] = useState(null);
  const load = () => api.get('/admin/community/content').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  const feature = async (id, featured) => { await api.post(`/admin/community/posts/${id}/feature`, { featured }); load(); };
  const Row = ({ p }) => (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-400">{p.author?.name} · {p.kind}{p.instrument ? ` · ${p.instrument}` : ''} · {p.commentCount} comments · {p.reactionCount} reactions</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-ink-700 dark:text-ink-200">{p.body || (p.idea ? `${p.idea.direction} trade idea` : '')}</p>
      </div>
      <Link to={`/app/community/${p.kind === 'idea' ? 'ideas' : 'posts'}/${p.id}`} target="_blank" className="text-xs text-accent-700 hover:underline dark:text-accent-300">Open</Link>
      <Button size="sm" variant={p.featured ? 'secondary' : 'ghost'} icon={p.featured ? Check : Star} onClick={() => feature(p.id, !p.featured)}>{p.featured ? 'Featured' : 'Feature'}</Button>
    </li>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title="Featured posts" subtitle="Shown with a Featured label and a boost in For You." /><CardBody><ul className="divide-y divide-ink-100 dark:divide-ink-800">{d?.featured.map((p) => <Row key={p.id} p={p} />)}{d && !d.featured.length ? <li className="py-4 text-sm text-ink-400">Nothing featured.</li> : null}</ul></CardBody></Card>
      <Card><CardHeader title="Most discussed this week" /><CardBody><ul className="divide-y divide-ink-100 dark:divide-ink-800">{d?.topThisWeek.map((p) => <Row key={p.id} p={p} />)}{d && !d.topThisWeek.length ? <li className="py-4 text-sm text-ink-400">No posts this week.</li> : null}</ul></CardBody></Card>
      <p className="text-xs text-ink-400 lg:col-span-2">Platform announcements are managed in <Link to="/admin/announcements" className="underline">Announcements</Link>.</p>
    </div>
  );
}

function Bars({ rows, value, label }) {
  const max = Math.max(1, ...rows.map((r) => r[value]));
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-ink-600 dark:text-ink-300">{label(r)}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"><span className="block h-full rounded-full bg-accent-500" style={{ width: `${(r[value] / max) * 100}%` }} /></span>
          <span className="w-10 text-right font-mono tabular-nums text-ink-500">{r[value]}</span>
        </li>
      ))}
    </ul>
  );
}

function Analytics() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/admin/community/analytics?days=30').then(setD).catch(() => {}); }, []);
  if (!d) return <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, n: d.activeHoursUtc.find((x) => x.hour === h)?.n ?? 0 }));
  const maxH = Math.max(1, ...hours.map((h) => h.n));
  const r = d.retention;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader title="Daily activity, last 30 days" subtitle="Messages, posts, comments and distinct active traders per day (UTC)." />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead><tr className="text-left text-ink-400"><th className="py-1 font-medium">Day</th><th className="py-1 text-right font-medium">Active</th><th className="py-1 text-right font-medium">Messages</th><th className="py-1 text-right font-medium">Posts</th><th className="py-1 text-right font-medium">Comments</th></tr></thead>
            <tbody className="divide-y divide-ink-50 font-mono tabular-nums dark:divide-ink-800/60">{[...d.daily].reverse().slice(0, 14).map((x) => <tr key={x.day}><td className="py-1 font-sans text-ink-500">{new Date(x.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td><td className="py-1 text-right">{x.active}</td><td className="py-1 text-right">{x.messages}</td><td className="py-1 text-right">{x.posts}</td><td className="py-1 text-right">{x.comments}</td></tr>)}</tbody>
          </table>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Most active hours (UTC)" subtitle="Messages by hour over 30 days" />
        <CardBody>
          <div className="flex h-28 items-end gap-0.5" role="img" aria-label="Messages by hour of day">
            {hours.map((h) => <div key={h.hour} className="flex-1 rounded-t bg-accent-500/80" style={{ height: `${Math.max(2, (h.n / maxH) * 100)}%` }} title={`${h.hour}:00 UTC: ${h.n} messages`} />)}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-ink-400"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Most discussed markets" subtitle="Room messages plus posts, 30 days" />
        <CardBody>{d.mostDiscussedMarkets.length ? <Bars rows={d.mostDiscussedMarkets} value="n" label={(x) => x.instrument} /> : <p className="text-sm text-ink-400">No market discussion yet.</p>}</CardBody>
      </Card>
      <Card>
        <CardHeader title="Event participation" subtitle="Distinct traders in each event room" />
        <CardBody>{d.eventParticipation.length ? <Bars rows={d.eventParticipation} value="participants" label={(x) => x.title} /> : <p className="text-sm text-ink-400">No event rooms used yet.</p>}</CardBody>
      </Card>
      <Card>
        <CardHeader title="Retention" subtitle="Of traders active in the first week of the window, how many were active in the last 7 days" />
        <CardBody><p className="font-mono text-3xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">{r.cohort ? `${Math.round((r.retained / r.cohort) * 100)}%` : 'n/a'}</p><p className="text-xs text-ink-400">{r.retained} of {r.cohort} traders</p></CardBody>
      </Card>
    </div>
  );
}

function People() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const load = () => api.get(`/admin/community/users?q=${encodeURIComponent(q)}`).then((r) => setRows(r.users)).catch(() => setRows([]));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (u, action, extra = {}) => {
    const reason = action === 'unmute' || action === 'reinstate' ? '' : await promptDialog({ title: `${action.charAt(0).toUpperCase()}${action.slice(1)} ${u.name ?? 'this trader'}?`, message: 'Give a short reason. It’s kept in the moderation log and shown to the trader where relevant.', label: 'Reason', placeholder: 'e.g. Repeated spam in EUR/USD room', confirmLabel: 'Confirm', danger: ['ban', 'mute', 'remove'].includes(action) });
    if (reason === null) return;
    try {
      await api.post('/admin/community/actions', { action, userId: u.id, targetType: 'user', targetId: u.id, reason, ...extra });
      load();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, @username or email" className="h-10 w-full max-w-md rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800"><th className="px-5 py-3 font-medium">Trader</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Reports</th><th className="px-5 py-3 font-medium">Actions</th></tr></thead>
            <tbody className="divide-y divide-ink-50 dark:divide-ink-800/60">
              {rows?.map((u) => {
                const muted = u.mutedUntil && new Date(u.mutedUntil) > new Date();
                return (
                  <tr key={u.id}>
                    <td className="px-5 py-2.5"><Link to={`/app/community/u/${u.username}`} target="_blank" className="font-medium text-ink-800 hover:underline dark:text-ink-100">{u.name}</Link><span className="block text-xs text-ink-400">@{u.username}{u.email ? ` · ${u.email}` : ''}</span></td>
                    <td className="px-5 py-2.5 text-xs">{u.accountStatus}{muted ? <span className="block text-amber-600">posting paused</span> : null}</td>
                    <td className="px-5 py-2.5 tabular-nums">{u.reports ? <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{u.reports}</span> : 0}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {muted ? <Button size="sm" variant="ghost" onClick={() => act(u, 'unmute')}>Resume posting</Button> : <Button size="sm" variant="ghost" onClick={() => act(u, 'mute', { hours: 24 })}>Pause 24h</Button>}
                        {isAdmin && u.accountStatus === 'active' ? <Button size="sm" variant="ghost" onClick={() => act(u, 'suspend')}>Suspend</Button> : null}
                        {isAdmin && u.accountStatus !== 'active' ? <Button size="sm" variant="ghost" onClick={() => act(u, 'reinstate')}>Reinstate</Button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function AdminCommunity() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'overview';
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Community" description="Activity, moderation, rooms, events and content. Every moderation action is logged." />
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Community admin">
        {TABS.map(([t, l]) => <button key={t} type="button" onClick={() => setParams({ tab: t })} aria-current={tab === t ? 'page' : undefined} className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-ink-900 text-white dark:bg-ink-700' : 'text-ink-500 hover:bg-white dark:hover:bg-ink-800')}>{l}</button>)}
      </nav>
      {tab === 'overview' ? <Overview /> : null}
      {tab === 'moderation' ? <Moderation /> : null}
      {tab === 'log' ? <Log /> : null}
      {tab === 'rooms' ? <Rooms /> : null}
      {tab === 'events' ? <Events /> : null}
      {tab === 'content' ? <Content /> : null}
      {tab === 'analytics' ? <Analytics /> : null}
      {tab === 'users' ? <People /> : null}
    </div>
  );
}
