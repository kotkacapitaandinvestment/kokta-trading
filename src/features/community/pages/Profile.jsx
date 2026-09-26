import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Ban, Camera, Flag, MessageSquare, VolumeX } from 'lucide-react';
import { api } from '../../../lib/api';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { useCommunity } from '../CommunityContext';
import { timeAgo } from '../util';
import { useAuth } from '../../../context/AuthContext';
import { uploadAvatar } from '../../../lib/avatar';
import { Avatar, StaffBadge } from '../components/Identity';
import { FollowButton } from '../components/Buttons';
import PostCard from '../components/PostCard';
import ReportDialog from '../components/ReportDialog';
import Menu from '../components/Menu';
import { display } from '../components/inputs';

function EditProfile({ profile, onClose, onSaved }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ username: profile.username, headline: profile.headline ?? '', bio: profile.bio ?? '' });
  const [avatar, setAvatar] = useState(null);
  const [state, setState] = useState(null);
  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const save = async () => {
    setState({ busy: true });
    try {
      if (avatar) setUser(await uploadAvatar(avatar));
      await api.put('/community/me/profile', form);
      onSaved(form.username);
    } catch (err) {
      setState({ error: err.message });
    }
  };
  return (
    <Modal open onClose={onClose} title="Edit profile">
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-600 dark:text-ink-300">
          {preview ? <img src={preview} alt="" className="h-14 w-14 rounded-full object-cover" /> : <Avatar user={profile} size={56} />}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium dark:border-ink-700"><Camera className="h-3.5 w-3.5" /> {profile.avatarUrl || preview ? 'Change photo' : 'Add photo'}</span>
          <input type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} className="sr-only" />
        </label>
        {[['username', 'Username', 20], ['headline', 'Headline', 80]].map(([k, l, max]) => (
          <label key={k} className="block"><span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">{l}</span><input value={form[k]} maxLength={max} onChange={(e) => setForm({ ...form, [k]: k === 'username' ? e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') : e.target.value })} className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" /></label>
        ))}
        <label className="block"><span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">Bio</span><textarea value={form.bio} maxLength={400} rows={3} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" /></label>
        {state?.error ? <p role="alert" className="text-sm text-loss-500">{state.error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={state?.busy}>Save</Button></div>
      </div>
    </Modal>
  );
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { refresh } = useCommunity();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('posts');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(false);
  const load = () => api.get(`/community/users/${username}`).then(setData).catch((err) => setError(err.message));
  useEffect(() => { setData(null); load(); }, [username]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    setItems(null);
    const q = tab === 'ideas' ? `author:${username} type:ideas` : `author:${username} type:posts`;
    if (tab === 'following' || tab === 'followers') api.get(`/community/users/${username}/${tab}`).then((r) => setItems(r.users)).catch(() => setItems([]));
    else api.get(`/community/search?q=${encodeURIComponent(q)}`).then((r) => setItems(r.results[tab] ?? [])).catch(() => setItems([]));
  }, [data, tab, username]);

  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!data) return <div className="h-80 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const p = data.profile;
  const v = data.viewer;
  const message = async () => {
    try {
      const { conversationId } = await api.post('/community/conversations/dm', { userId: p.id });
      navigate(`/app/community/messages/${conversationId}`);
    } catch (err) {
      window.alert(err.message);
    }
  };
  const relation = async (kind, on) => {
    if (on) await api.delete(`/community/users/${p.id}/${kind}`);
    else if (window.confirm(kind === 'block' ? `Block ${p.name}? You won't see each other's content and they can't message you.` : `Mute ${p.name}? Their content will be hidden from you.`)) await api.post(`/community/users/${p.id}/${kind}`, {});
    load();
  };
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar user={p} size={80} showOnline />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{p.name} {p.staff ? <StaffBadge /> : null}</h1>
            <p className="text-sm text-ink-400">@{p.username} · {p.online ? 'Online' : p.lastSeenAt ? `Active ${timeAgo(p.lastSeenAt)} ago` : 'Joined'} · member since {new Date(p.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
            {p.headline ? <p className="mt-2 text-sm font-medium text-ink-700 dark:text-ink-200">{p.headline}</p> : null}
            {p.bio ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-ink-600 dark:text-ink-300">{p.bio}</p> : null}
            {p.marketsFollowed?.length ? <p className="mt-3 flex flex-wrap gap-1.5">{p.marketsFollowed.map((s) => <Link key={s} to={`/app/community/markets/${s}`} className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-300">{display(s)}</Link>)}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {v.self ? <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit profile</Button> : (
              <>
                <FollowButton targetType="user" targetId={p.id} following={v.following} size="md" onChange={load} />
                <Button variant="secondary" size="md" icon={MessageSquare} disabled={!v.canMessage} onClick={message} title={v.messageBlockedReason ?? undefined}>Message</Button>
                <Menu items={[
                  { label: v.muted ? 'Unmute' : 'Mute', icon: VolumeX, onClick: () => relation('mute', v.muted) },
                  { label: v.blocked ? 'Unblock' : 'Block', icon: Ban, danger: !v.blocked, onClick: () => relation('block', v.blocked) },
                  { label: 'Report', icon: Flag, onClick: () => setReport(true) },
                ]} />
              </>
            )}
          </div>
        </div>
        {!v.self && !v.canMessage && v.messageBlockedReason ? <p className="mt-3 text-xs text-ink-400">{v.messageBlockedReason}</p> : null}
        <div className="mt-5 flex flex-wrap gap-1 border-t border-ink-100 pt-4 text-sm dark:border-ink-800">
          {[['posts', 'Posts', data.counts.posts], ['ideas', 'Trade ideas', data.counts.ideas], ['followers', 'Followers', data.counts.followers], ['following', 'Following', data.counts.following]].map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined} className={clsx('rounded-lg px-3 py-1.5 font-medium', tab === k ? 'bg-ink-900 text-white dark:bg-ink-700' : 'text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800')}>{l} <span className="tabular-nums opacity-70">{n}</span></button>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
        {!items ? <div className="m-5 h-24 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" /> : null}
        {items && !items.length ? <p className="px-6 py-12 text-center text-sm text-ink-400">Nothing here yet.</p> : null}
        <div className="divide-y divide-ink-100 dark:divide-ink-800">
          {tab === 'posts' || tab === 'ideas'
            ? items?.map((post) => <PostCard key={post.id} post={post} />)
            : items?.map((u) => (
                <Link key={u.id} to={`/app/community/u/${u.username}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50 dark:hover:bg-ink-800/40">
                  <Avatar user={u} size={36} showOnline />
                  <span><span className="block text-sm font-medium text-ink-900 dark:text-ink-50">{u.name}</span><span className="text-xs text-ink-400">@{u.username}{u.headline ? ` · ${u.headline}` : ''}</span></span>
                </Link>
              ))}
        </div>
      </section>
      <p className="text-[11px] text-ink-400">Follower counts show audience size, not trading skill. Kotka does not rate or verify traders' results.</p>
      {editing ? <EditProfile profile={{ ...p }} onClose={() => setEditing(false)} onSaved={(u) => { setEditing(false); refresh(); navigate(`/app/community/u/${u}`); load(); }} /> : null}
      {report ? <ReportDialog target={{ type: 'user', id: p.id, label: p.name }} onClose={() => setReport(false)} /> : null}
    </div>
  );
}
