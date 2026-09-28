import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Ban, Copy, Flag, HelpCircle, MessageCircle, Pencil, Send, ShieldCheck, Sparkles, Star, ThumbsUp, Trash2, VolumeX } from 'lucide-react';
import { api } from '../../../lib/api';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { timeAgo, REACTIONS } from '../util';
import { Avatar, UserName } from './Identity';
import RichText from './RichText';
import Attachments from './Attachments';
import IdeaBlock from './IdeaBlock';
import SafetyWarning from './SafetyWarning';
import Menu from './Menu';
import { SaveButton } from './Buttons';
import ReportDialog from './ReportDialog';
import AiPanel, { useAiAction } from './AiPanel';
import { confirmDialog, toast } from '../../../lib/dialogs';

const KIND_LABEL = { idea: 'Trade idea', question: 'Question', poll: 'Poll', market: 'Market update', news: 'News discussion', achievement: 'Achievement' };
// Achievements get their own reactions: support, not likes.
const CHEERS = [['👏', 'Celebrate'], ['🔥', 'React'], ['💪', 'Encourage']];

export function ShareDialog({ post, onClose }) {
  const [convs, setConvs] = useState(null);
  const [sent, setSent] = useState(null);
  useEffect(() => {
    api.get('/community/conversations').then((r) => setConvs(r.conversations.filter((c) => ['dm', 'group', 'community'].includes(c.kind)))).catch(() => setConvs([]));
  }, []);
  const send = async (c) => {
    try {
      await api.post(`/community/conversations/${c.id}/messages`, { body: '', attachments: [{ type: 'post', postId: post.id }] });
      setSent(c.name);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return (
    <Modal open onClose={onClose} title="Share">
      <div className="space-y-4">
        <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/app/community/${post.kind === 'idea' ? 'ideas' : 'posts'}/${post.id}`).then(() => setSent('clipboard'))} className="flex w-full items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">
          <Copy className="h-4 w-4" /> Copy link
        </button>
        <div>
          <p className="mb-2 text-xs font-medium text-ink-500">Send in a chat</p>
          {!convs ? <p className="text-sm text-ink-400">Loading…</p> : !convs.length ? <p className="text-sm text-ink-400">No chats yet. Start one from a trader’s profile.</p> : null}
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {convs?.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => send(c)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
                  <Avatar user={c.other ?? { initials: c.name?.slice(0, 2).toUpperCase(), avatarUrl: c.imageUrl }} size={28} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <Send className="h-3.5 w-3.5 text-ink-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
        {sent ? <p role="status" className="text-sm text-profit-600">{sent === 'clipboard' ? 'Link copied.' : `Sent to ${sent}.`}</p> : null}
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}

export default function PostCard({ post: initial, reason, full = false, onChange }) {
  const navigate = useNavigate();
  const [post, setPost] = useState(initial);
  const [expanded, setExpanded] = useState(full);
  const [showPicker, setShowPicker] = useState(false);
  const [report, setReport] = useState(null);
  const [share, setShare] = useState(false);
  const [editing, setEditing] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const ai = useAiAction();
  useEffect(() => setPost(initial), [initial]);

  if (post.deleted || post.removed) {
    return <div className="px-5 py-4 text-sm italic text-ink-400">{post.removed ? 'This post was removed by a moderator.' : 'This post was deleted.'}</div>;
  }
  if (post.hiddenAuthor && !revealed) {
    return (
      <div className="flex items-center justify-between px-5 py-3 text-xs text-ink-400">
        Post from a trader you muted or blocked.
        <button type="button" onClick={() => setRevealed(true)} className="font-medium text-accent-700 hover:underline dark:text-accent-300">Show</button>
      </div>
    );
  }

  const link = `/app/community/${post.kind === 'idea' ? 'ideas' : 'posts'}/${post.id}`;
  const mine = post.reactions.find((r) => r.mine);
  const react = async (emoji) => {
    setShowPicker(false);
    try {
      const r = await api.post(`/community/posts/${post.id}/reactions`, { emoji });
      const next = { ...post, reactions: r.reactions, reactionCount: r.reactionCount };
      setPost(next);
      onChange?.(next);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this post?', message: 'It will be removed for everyone. This can’t be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await api.delete(`/community/posts/${post.id}`);
      setPost({ ...post, deleted: true });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const saveEdit = async () => {
    try {
      const { post: p } = await api.patch(`/community/posts/${post.id}`, { body: editing });
      setPost(p);
      setEditing(null);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const relation = async (kind) => {
    if (!(await confirmDialog({ title: `${kind === 'block' ? 'Block' : 'Mute'} ${post.author.name}?`, message: kind === 'block' ? 'You won’t see each other’s posts or messages, and they can’t message you. You can undo this in Settings.' : 'Their posts and messages will be hidden from you. They won’t be told.', confirmLabel: kind === 'block' ? 'Block' : 'Mute', danger: kind === 'block' }))) return;
    await api.post(`/community/users/${post.author.id}/${kind}`, {});
    setPost({ ...post, hiddenAuthor: true });
  };
  const body = post.idea ? post.idea.thesis : post.body;
  const long = body && body.length > 420;
  const images = post.attachments.filter((a) => a.type === 'image');

  return (
    <article className="px-5 py-4">
      {reason || post.featured ? (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-400">
          {post.featured ? <Star className="h-3 w-3 text-accent-500" /> : null}
          {post.featured && !reason ? 'Featured by Kotka' : reason}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Link to={post.author?.username ? `/app/community/u/${post.author.username}` : '#'} className="shrink-0"><Avatar user={post.author} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <UserName user={post.author} />
                <Link to={link} className="text-xs text-ink-400 hover:underline" title={new Date(post.createdAt).toLocaleString()}>{timeAgo(post.createdAt)}{post.editedAt ? ' · edited' : ''}</Link>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {KIND_LABEL[post.kind] ? <span className="rounded bg-ink-100 px-1.5 py-px font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">{KIND_LABEL[post.kind]}</span> : null}
                {post.instrument ? <Link to={`/app/community/markets/${post.instrument.symbol}`} className="rounded bg-accent-500/10 px-1.5 py-px font-mono font-semibold text-accent-800 hover:bg-accent-500/20 dark:text-accent-300">{post.instrument.display}</Link> : null}
                {post.topics?.map((t) => <span key={t} className="text-ink-400">#{t}</span>)}
              </div>
            </div>
            <Menu
              items={[
                post.mine && post.kind !== 'poll' ? { label: 'Edit', icon: Pencil, onClick: () => setEditing(post.body) } : null,
                post.mine ? { label: 'Delete', icon: Trash2, danger: true, onClick: remove } : null,
                !post.mine ? { label: 'Report', icon: Flag, onClick: () => setReport({ type: 'post', id: post.id, label: 'post' }) } : null,
                !post.mine && post.author?.username ? { label: `Mute @${post.author.username}`, icon: VolumeX, onClick: () => relation('mute') } : null,
                !post.mine && post.author?.username ? { label: `Block @${post.author.username}`, icon: Ban, danger: true, onClick: () => relation('block') } : null,
              ]}
            />
          </div>

          {post.kind === 'idea' ? <IdeaBlock idea={post.idea} /> : null}
          <SafetyWarning warnings={post.warnings} />
          {editing !== null ? (
            <div className="mt-2 space-y-2">
              <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={4} className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
              <div className="flex gap-2"><Button size="sm" onClick={saveEdit}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
            </div>
          ) : body ? (
            <div className={clsx('mt-2 text-[15px] leading-relaxed text-ink-800 dark:text-ink-100', !expanded && long && 'line-clamp-6')}>
              {post.kind === 'idea' ? <p className="mb-1 text-[11px] font-semibold text-ink-500 dark:text-ink-400">Reasoning</p> : null}
              <RichText text={body} />
            </div>
          ) : null}
          {long && !expanded ? <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-xs font-medium text-accent-700 hover:underline dark:text-accent-300">Show more</button> : null}
          {post.kind === 'idea' && post.body ? <p className="mt-2 text-sm text-ink-600 dark:text-ink-300"><RichText text={post.body} /></p> : null}
          {post.poll ? <div className="mt-2"><Attachments items={[{ type: 'poll', poll: post.poll }]} /></div> : null}
          {post.news ? (
            <Link to={`/app/community/news/${post.news.id}`} className="mt-2 block rounded-xl border border-ink-100 p-3 text-sm hover:border-accent-300 dark:border-ink-800 dark:hover:border-accent-700">
              <span className="font-medium text-ink-900 dark:text-ink-50">{post.news.headline}</span>
              <span className="block text-[11px] text-ink-400">{post.news.official ? 'Official · ' : ''}{post.news.provider}</span>
            </Link>
          ) : null}
          <Attachments items={post.attachments} onAnalyze={(mediaId) => ai.run('chart', '/community/ai/analyze-chart', { mediaId, postId: post.id })} />

          <div className="relative mt-3 flex flex-wrap items-center gap-1 text-ink-500 dark:text-ink-400">
            {post.kind === 'achievement' ? (
              CHEERS.map(([emoji, label]) => {
                const r = post.reactions.find((x) => x.emoji === emoji);
                return (
                  <button key={emoji} type="button" onClick={() => react(emoji)} aria-pressed={!!r?.mine} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-ink-100 dark:hover:bg-ink-800', r?.mine && 'bg-accent-500/10 text-accent-800 dark:text-accent-300')}>
                    <span className="text-sm">{emoji}</span> <span className="hidden sm:inline">{label}</span> {r?.count ? <span className="tabular-nums">{r.count}</span> : null}
                  </button>
                );
              })
            ) : (
            <>
            <button type="button" onClick={() => react(mine?.emoji ?? 'like')} onContextMenu={(e) => { e.preventDefault(); setShowPicker(true); }} aria-pressed={!!mine} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-ink-100 dark:hover:bg-ink-800', mine && 'text-accent-700 dark:text-accent-300')}>
              {mine && mine.emoji !== 'like' ? <span className="text-sm">{mine.emoji}</span> : <ThumbsUp className="h-4 w-4" />}
              {post.reactionCount || ''}
            </button>
            <button type="button" onClick={() => setShowPicker((s) => !s)} className="h-8 rounded-lg px-1.5 text-xs hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="More reactions">+</button>
            {showPicker ? (
              <div className="absolute bottom-9 left-0 z-20 flex gap-1 rounded-xl border border-ink-100 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-800">
                {REACTIONS.map((e) => <button key={e} type="button" onClick={() => react(e)} className="rounded-lg px-1.5 py-1 text-base hover:bg-ink-100 dark:hover:bg-ink-700" aria-label={`React ${e}`}>{e}</button>)}
              </div>
            ) : null}
            </>
            )}
            <Link to={link} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-ink-100 dark:hover:bg-ink-800">
              <MessageCircle className="h-4 w-4" /> {post.commentCount || ''} <span className="hidden sm:inline">{post.kind === 'idea' ? 'Discuss' : post.kind === 'question' ? 'Answer' : 'Comment'}</span>
            </Link>
            {post.kind === 'idea' ? (
              <Link to={`${link}?challenge=1`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-ink-100 dark:hover:bg-ink-800">
                <ShieldCheck className="h-4 w-4" /> <span className="hidden sm:inline">Challenge</span>
              </Link>
            ) : null}
            <SaveButton itemType={post.kind === 'idea' ? 'idea' : 'post'} itemId={post.id} saved={post.saved} />
            <button type="button" onClick={() => setShare(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-ink-100 dark:hover:bg-ink-800"><Send className="h-4 w-4" /> <span className="hidden sm:inline">Share</span></button>
            <Menu
              label="Ask Kotka AI"
              icon={Sparkles}
              align="left"
              buttonClassName="text-accent-600 dark:text-accent-400"
              items={[
                post.kind === 'idea' ? { label: 'Stress-test this idea', icon: ShieldCheck, onClick: () => ai.run('challenge', '/community/ai/challenge', { postId: post.id }) } : null,
                post.commentCount >= 3 ? { label: 'Summarise discussion', icon: Sparkles, onClick: () => ai.run('summary', '/community/ai/summarize', { postId: post.id }) } : null,
                { label: 'Fact check', icon: HelpCircle, onClick: () => ai.run('factcheck', '/community/ai/fact-check', { targetType: 'post', targetId: post.id }) },
                images[0] ? { label: 'Analyse chart', icon: Sparkles, onClick: () => ai.run('chart', '/community/ai/analyze-chart', { mediaId: images[0].mediaId, postId: post.id }) } : null,
                { label: 'Ask Kotka about this', icon: Sparkles, onClick: () => navigate(`/app/ai?prompt=${encodeURIComponent(`About this ${KIND_LABEL[post.kind]?.toLowerCase() ?? 'post'}${post.author?.username ? ` by @${post.author.username}` : ''}${post.instrument ? ` on ${post.instrument.display}` : ''}: "${(body ?? '').slice(0, 600)}"`)}`) },
              ]}
            />
          </div>
          <AiPanel state={ai.state} onClose={ai.clear} className="mt-3" />
        </div>
      </div>
      {report ? <ReportDialog target={report} onClose={() => setReport(null)} /> : null}
      {share ? <ShareDialog post={post} onClose={() => setShare(false)} /> : null}
    </article>
  );
}
