import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Archive, ArrowLeft, BellOff, Compass, Copy, Flag, LogOut, Plus, Settings, ShieldAlert, UserPlus, Users, X } from 'lucide-react';
import { api } from '../../../lib/api';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { useRealtime } from '../realtime';
import { useCommunity } from '../CommunityContext';
import { timeAgo } from '../util';
import { Avatar, UserName } from '../components/Identity';
import ReportDialog from '../components/ReportDialog';
import ConversationChat from '../chat/ConversationChat';

const FILTERS = [
  ['all', 'All'],
  ['dm', 'Direct'],
  ['group', 'Groups'],
  ['community', 'Communities'],
  ['archived', 'Archived'],
];

function PeoplePicker({ selected, onChange, max = 50 }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!q.trim()) return setUsers([]);
    const t = setTimeout(() => api.get(`/community/people?q=${encodeURIComponent(q)}`).then((r) => setUsers(r.users)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-2">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search traders by name or @username" className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs dark:bg-ink-800">{u.name}<button type="button" onClick={() => onChange(selected.filter((x) => x.id !== u.id))} aria-label={`Remove ${u.name}`}><X className="h-3 w-3" /></button></span>)}
        </div>
      ) : null}
      <ul className="max-h-60 overflow-y-auto">
        {users.filter((u) => !selected.some((s) => s.id === u.id)).map((u) => (
          <li key={u.id}>
            <button type="button" disabled={selected.length >= max} onClick={() => { onChange([...selected, u]); setQ(''); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50 dark:hover:bg-ink-800">
              <Avatar user={u} size={30} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink-800 dark:text-ink-100">{u.name}</span><span className="text-xs text-ink-400">@{u.username}{u.headline ? ` · ${u.headline}` : ''}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewChat({ onClose }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('dm');
  const [picked, setPicked] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', visibility: 'public', sendPolicy: 'everyone' });
  const [state, setState] = useState(null);
  const create = async () => {
    setState({ busy: true });
    try {
      if (mode === 'dm') {
        const { conversationId } = await api.post('/community/conversations/dm', { userId: picked[0].id });
        navigate(`/app/community/messages/${conversationId}`);
      } else {
        const r = await api.post('/community/conversations', { kind: mode, ...form, memberIds: picked.map((u) => u.id) });
        navigate(`/app/community/messages/${r.conversationId}`);
        if (r.skipped) window.alert(`${r.skipped} trader${r.skipped === 1 ? " couldn't" : "s couldn't"} be added because of their message settings.`);
      }
      onClose();
    } catch (err) {
      setState({ error: err.message });
    }
  };
  return (
    <Modal open onClose={onClose} title="New conversation">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-ink-50 p-1 text-xs dark:bg-ink-800">
          {[['dm', 'Direct message'], ['group', 'Private group'], ['community', 'Community']].map(([v, l]) => <button key={v} type="button" onClick={() => { setMode(v); setPicked(v === 'dm' ? picked.slice(0, 1) : picked); }} className={clsx('flex-1 rounded-md py-1.5 font-medium', mode === v ? 'bg-white shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500')}>{l}</button>)}
        </div>
        {mode !== 'dm' ? (
          <div className="space-y-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} placeholder={mode === 'group' ? 'Group name, e.g. London Session Traders' : 'Community name, e.g. Gold Traders Nigeria'} className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} placeholder="What is it for? (optional)" className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            <div className="grid grid-cols-2 gap-2">
              {mode === 'community' ? (
                <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800" aria-label="Visibility">
                  <option value="public">Public: anyone can join</option>
                  <option value="private">Private: listed, join by approval</option>
                  <option value="invite_only">Invite only: unlisted</option>
                </select>
              ) : <p className="self-center text-xs text-ink-400">Private groups are invite-only.</p>}
              <select value={form.sendPolicy} onChange={(e) => setForm({ ...form, sendPolicy: e.target.value })} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800" aria-label="Who can send">
                <option value="everyone">Everyone can send</option>
                <option value="admins">Admins only</option>
              </select>
            </div>
          </div>
        ) : null}
        <PeoplePicker selected={picked} onChange={setPicked} max={mode === 'dm' ? 1 : 255} />
        {state?.error ? <p role="alert" className="text-sm text-loss-500">{state.error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={state?.busy || (mode === 'dm' ? picked.length !== 1 : form.name.trim().length < 3)} onClick={create}>{mode === 'dm' ? 'Start chat' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Directory({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api.get(`/community/communities?q=${encodeURIComponent(q)}`).then((r) => setList(r.communities)).catch(() => setList([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  const join = async (c) => {
    try {
      const r = await api.post(`/community/conversations/${c.id}/join`, {});
      if (r.status === 'pending') window.alert('Request sent. An admin will review it.');
      else navigate(`/app/community/messages/${c.id}`);
      onClose();
    } catch (err) {
      window.alert(err.message);
    }
  };
  return (
    <Modal open onClose={onClose} title="Communities" width="max-w-xl">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities" className="mb-3 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
      {list && !list.length ? <p className="py-6 text-center text-sm text-ink-400">No communities yet. Create one from New conversation.</p> : null}
      <ul className="divide-y divide-ink-100 dark:divide-ink-800">
        {list?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <Avatar user={{ initials: c.name.slice(0, 2).toUpperCase(), avatarUrl: c.imageUrl }} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{c.name} {c.featured ? <span className="ml-1 text-[10px] font-medium text-accent-700 dark:text-accent-300">Featured</span> : null}</p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">{c.description ?? ''}</p>
              <p className="text-[11px] text-ink-400">{c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.visibility === 'public' ? 'Public' : 'Private, approval required'}</p>
            </div>
            {c.membership === 'active' ? <Button size="sm" variant="secondary" onClick={() => { navigate(`/app/community/messages/${c.id}`); onClose(); }}>Open</Button> : c.membership === 'pending' ? <span className="text-xs text-ink-400">Requested</span> : <Button size="sm" onClick={() => join(c)}>{c.visibility === 'public' ? 'Join' : 'Request'}</Button>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function SettingsPanel({ details, reload, onClose }) {
  const navigate = useNavigate();
  const { profile } = useCommunity();
  const c = details.conversation;
  const a = details.access;
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [report, setReport] = useState(false);
  const [form, setForm] = useState({ name: c.name ?? '', description: c.description ?? '', sendPolicy: c.sendPolicy });
  const act = async (fn) => {
    try {
      await fn();
      reload();
    } catch (err) {
      window.alert(err.message);
    }
  };
  const other = c.kind === 'dm' ? details.members.find((m) => m.id !== profile?.id) : null;
  const inviteUrl = c.inviteCode ? `${window.location.origin}/app/community/invite/${c.inviteCode}` : null;
  return (
    <aside className="fixed inset-0 z-40 overflow-y-auto bg-white p-5 dark:bg-ink-900 lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:border-l lg:border-ink-100 lg:dark:border-ink-800" aria-label="Conversation settings">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{c.kind === 'dm' ? 'Chat details' : c.kind === 'group' ? 'Group settings' : 'Community settings'}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      {other ? (
        <div className="mt-4 flex items-center gap-3">
          <Avatar user={other} size={48} showOnline />
          <div className="min-w-0">
            <UserName user={other} className="text-sm" />
            <p className="text-xs text-ink-400">{other.online ? 'Online' : other.lastSeenAt ? `Last seen ${timeAgo(other.lastSeenAt)} ago` : 'Offline'}</p>
          </div>
        </div>
      ) : null}
      {a.canManage && c.kind !== 'dm' ? (
        <div className="mt-4 space-y-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" aria-label="Name" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} rows={2} placeholder="Description" className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
          <select value={form.sendPolicy} onChange={(e) => setForm({ ...form, sendPolicy: e.target.value })} className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800" aria-label="Who can send">
            <option value="everyone">Everyone can send</option>
            <option value="admins">Admins only</option>
          </select>
          <Button size="sm" onClick={() => act(() => api.patch(`/community/conversations/${c.id}`, form))}>Save</Button>
        </div>
      ) : c.description ? <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">{c.description}</p> : null}
      {inviteUrl ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Invite link</p>
          <div className="mt-1.5 flex gap-1.5">
            <input readOnly value={inviteUrl} className="h-8 min-w-0 flex-1 rounded-lg border border-ink-200 bg-ink-50 px-2 text-xs dark:border-ink-700 dark:bg-ink-800" />
            <button type="button" onClick={() => navigator.clipboard?.writeText(inviteUrl)} className="rounded-lg border border-ink-200 px-2 dark:border-ink-700" aria-label="Copy invite link"><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <button type="button" onClick={() => act(() => api.post(`/community/conversations/${c.id}/invite`, {}))} className="mt-1 text-[11px] text-ink-500 underline">Reset link (old one stops working)</button>
        </div>
      ) : null}
      {c.kind !== 'dm' ? (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Members ({details.members.filter((m) => m.status === 'active').length})</p>
            {a.canManage ? <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300"><UserPlus className="h-3.5 w-3.5" /> Add</button> : null}
          </div>
          <ul className="mt-2 space-y-1.5">
            {details.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Avatar user={m} size={28} showOnline />
                <span className="min-w-0 flex-1"><UserName user={m} className="text-sm" showHandle={false} /><span className="block text-[11px] capitalize text-ink-400">{m.status === 'pending' ? 'Requested to join' : m.role}</span></span>
                {a.canManage && m.id !== profile?.id && m.role !== 'owner' ? (
                  m.status === 'pending' ? (
                    <Button size="sm" variant="secondary" onClick={() => act(() => api.patch(`/community/conversations/${c.id}/members/${m.id}`, { approve: true }))}>Approve</Button>
                  ) : (
                    <select value={m.role} onChange={(e) => (e.target.value === 'remove' ? window.confirm(`Remove ${m.name}?`) && act(() => api.delete(`/community/conversations/${c.id}/members/${m.id}`)) : act(() => api.patch(`/community/conversations/${c.id}/members/${m.id}`, { role: e.target.value })))} className="h-7 rounded-md border border-ink-200 bg-white px-1 text-[11px] dark:border-ink-700 dark:bg-ink-800" aria-label={`Role for ${m.name}`}>
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                      <option value="remove">Remove…</option>
                    </select>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-6 space-y-1 border-t border-ink-100 pt-4 dark:border-ink-800">
        <button type="button" onClick={() => act(() => api.patch(`/community/conversations/${c.id}/me`, { mute: c.muted ? null : '8h' }))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"><BellOff className="h-4 w-4" /> {c.muted ? 'Unmute' : 'Mute for 8 hours'}</button>
        {!c.muted ? <button type="button" onClick={() => act(() => api.patch(`/community/conversations/${c.id}/me`, { mute: 'always' }))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"><BellOff className="h-4 w-4" /> Mute until I turn it back on</button> : null}
        <button type="button" onClick={() => act(async () => { await api.patch(`/community/conversations/${c.id}/me`, { archived: !c.archived }); navigate('/app/community/messages'); })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"><Archive className="h-4 w-4" /> {c.archived ? 'Unarchive' : 'Archive'}</button>
        {other ? <button type="button" onClick={async () => { if (window.confirm(`Block ${other.name}? They won't be able to message you.`)) { await api.post(`/community/users/${other.id}/block`, {}); reload(); } }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-loss-600 hover:bg-loss-50 dark:text-loss-400 dark:hover:bg-loss-500/10"><ShieldAlert className="h-4 w-4" /> Block {other.name}</button> : null}
        <button type="button" onClick={() => setReport(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-loss-600 hover:bg-loss-50 dark:text-loss-400 dark:hover:bg-loss-500/10"><Flag className="h-4 w-4" /> Report {other ? other.name : 'this conversation'}</button>
        {c.kind !== 'dm' ? <button type="button" onClick={() => window.confirm('Leave this conversation?') && act(async () => { await api.delete(`/community/conversations/${c.id}/members/${profile.id}`); navigate('/app/community/messages'); })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-loss-600 hover:bg-loss-50 dark:text-loss-400 dark:hover:bg-loss-500/10"><LogOut className="h-4 w-4" /> Leave</button> : null}
      </div>
      {adding ? (
        <Modal open onClose={() => setAdding(false)} title="Add members">
          <PeoplePicker selected={picked} onChange={setPicked} />
          <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button disabled={!picked.length} onClick={() => act(async () => { const r = await api.post(`/community/conversations/${c.id}/members`, { userIds: picked.map((u) => u.id) }); if (r.skipped) window.alert(`${r.skipped} couldn't be added because of their message settings.`); setAdding(false); setPicked([]); })}>Add</Button></div>
        </Modal>
      ) : null}
      {report ? <ReportDialog target={other ? { type: 'user', id: other.id, label: other.name } : { type: 'conversation', id: c.id, label: 'conversation' }} onClose={() => setReport(false)} /> : null}
    </aside>
  );
}

function ConversationHeader({ details, reload, onBack }) {
  const { profile } = useCommunity();
  const [settings, setSettings] = useState(false);
  const c = details.conversation;
  const other = c.kind === 'dm' ? details.members.find((m) => m.id !== profile?.id) : null;
  return (
    <>
      <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <button type="button" onClick={onBack} className="rounded-lg p-1 text-ink-500 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button>
        <Avatar user={other ?? { initials: (c.name ?? '?').slice(0, 2).toUpperCase(), avatarUrl: c.imageUrl }} size={38} showOnline={!!other} />
        <div className="min-w-0 flex-1">
          {other ? <UserName user={other} className="text-sm" /> : <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{c.name}</p>}
          <p className="truncate text-xs text-ink-400">{other ? (other.online ? 'Online' : other.lastSeenAt ? `Last seen ${timeAgo(other.lastSeenAt)} ago` : 'Offline') : `${c.memberCount} member${c.memberCount === 1 ? '' : 's'}${c.kind === 'community' ? ` · ${c.visibility === 'public' ? 'Public community' : 'Private community'}` : ' · Private group'}`}</p>
        </div>
        <button type="button" onClick={() => setSettings((s) => !s)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Conversation settings"><Settings className="h-4 w-4" /></button>
      </div>
      {c.kind === 'dm' && other && !other.staff ? <p className="border-b border-ink-100 bg-ink-50/60 px-4 py-1.5 text-[11px] text-ink-500 dark:border-ink-800 dark:bg-ink-900/60">Kotka staff will never ask for money, passwords or to manage your account. Report anyone who does.</p> : null}
      {settings ? <div className="fixed inset-0 z-40 lg:hidden"><SettingsPanel details={details} reload={reload} onClose={() => setSettings(false)} /></div> : null}
      {settings ? <div className="absolute inset-y-0 right-0 z-30 hidden lg:block"><SettingsPanel details={details} reload={reload} onClose={() => setSettings(false)} /></div> : null}
    </>
  );
}

export default function Messages() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useCommunity();
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showDir, setShowDir] = useState(false);

  const load = useCallback(() => api.get(`/community/conversations?filter=${filter}`).then((r) => setList(r.conversations)).catch(() => setList([])), [filter]);
  useEffect(() => { load(); }, [load]);
  useRealtime('message', (d) => {
    setList((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((c) => c.id === d.conversationId);
      if (idx < 0) {
        if (['dm', 'group'].includes(d.kind)) load();
        return prev;
      }
      if (d.message.threadRootId) return prev;
      const c = prev[idx];
      const updated = { ...c, lastMessage: { id: d.message.id, preview: d.message.body?.slice(0, 90) || 'Attachment', mine: d.message.author?.id === profile?.id, createdAt: d.message.createdAt }, lastMessageAt: d.message.createdAt, unread: d.conversationId === id || d.message.author?.id === profile?.id ? 0 : c.unread + 1 };
      return [updated, ...prev.filter((_, i) => i !== idx)];
    });
  });
  useRealtime('conversation', () => load());
  useEffect(() => {
    if (id) setList((prev) => prev?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, [id]);

  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-[30rem] overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className={clsx('flex w-full flex-col border-r border-ink-100 dark:border-ink-800 lg:w-80 lg:shrink-0', id && 'hidden lg:flex')}>
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Messages</h1>
          <div className="flex gap-1">
            <button type="button" onClick={() => setShowDir(true)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Browse communities" title="Browse communities"><Compass className="h-4 w-4" /></button>
            <button type="button" onClick={() => setShowNew(true)} className="rounded-lg bg-ink-900 p-1.5 text-white dark:bg-accent-500 dark:text-ink-950" aria-label="New conversation" title="New conversation"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-3 pb-2">
          {FILTERS.map(([v, l]) => <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={clsx('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', filter === v ? 'bg-ink-900 text-white dark:bg-ink-700' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>{l}</button>)}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {!list ? <li className="p-4 text-sm text-ink-400">Loading…</li> : null}
          {list && !list.length ? (
            <li className="px-6 py-10 text-center text-sm text-ink-400">
              {filter === 'archived' ? 'No archived conversations.' : 'No conversations yet.'}
              <button type="button" onClick={() => setShowNew(true)} className="mt-3 block w-full font-medium text-accent-700 dark:text-accent-300">Start one</button>
            </li>
          ) : null}
          {list?.map((c) => (
            <li key={c.id}>
              <Link to={c.kind === 'room' ? `/app/community/markets/${c.instrument}?tab=discussion` : c.kind === 'event' ? `/app/community/events/${c.eventId}` : `/app/community/messages/${c.id}`} className={clsx('flex items-center gap-3 px-4 py-2.5 transition-colors', c.id === id ? 'bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800/50')}>
                <Avatar user={c.other ?? { initials: (c.name ?? '?').slice(0, 2).toUpperCase(), avatarUrl: c.imageUrl }} size={42} showOnline={c.kind === 'dm'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={clsx('truncate text-sm', c.unread ? 'font-semibold text-ink-900 dark:text-ink-50' : 'font-medium text-ink-800 dark:text-ink-100')}>{c.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-400">{c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {c.kind === 'group' || c.kind === 'community' ? <Users className="h-3 w-3 shrink-0 text-ink-400" /> : null}
                    <span className={clsx('truncate text-xs', c.unread ? 'text-ink-700 dark:text-ink-200' : 'text-ink-400')}>{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.preview}` : 'No messages yet'}</span>
                    {c.muted ? <BellOff className="h-3 w-3 shrink-0 text-ink-300" aria-label="Muted" /> : null}
                    {c.unread ? <span className="ml-auto min-w-[1.25rem] shrink-0 rounded-full bg-accent-500 px-1.5 text-center text-[10px] font-semibold leading-5 text-ink-950">{c.unread}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className={clsx('relative min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden lg:flex')}>
        {id ? (
          <ConversationChat key={id} conversationId={id} focusId={params.get('m')} header={(details, reload) => <ConversationHeader details={details} reload={reload} onBack={() => navigate('/app/community/messages')} />} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Private messages, groups and communities</p>
            <p className="mt-1 max-w-sm text-xs text-ink-400">Start a conversation with a trader, create a private group, or join a community around a market or session.</p>
            <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => setShowNew(true)} icon={Plus}>New conversation</Button><Button size="sm" variant="secondary" onClick={() => setShowDir(true)} icon={Compass}>Browse communities</Button></div>
          </div>
        )}
      </div>
      {showNew ? <NewChat onClose={() => setShowNew(false)} /> : null}
      {showDir ? <Directory onClose={() => setShowDir(false)} /> : null}
    </div>
  );
}
