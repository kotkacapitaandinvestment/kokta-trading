import { memo, useState } from 'react';
import clsx from 'clsx';
import { Ban, Bookmark, Check, CheckCheck, Copy, CornerUpLeft, Flag, HelpCircle, MessagesSquare, Pencil, Pin, PinOff, SmilePlus, Sparkles, Trash2, VolumeX } from 'lucide-react';
import { api } from '../../../lib/api';
import { clock, REACTIONS } from '../util';
import { Avatar, UserName } from '../components/Identity';
import RichText from '../components/RichText';
import Attachments from '../components/Attachments';
import SafetyWarning from '../components/SafetyWarning';
import Menu from '../components/Menu';

function Receipt({ message, receipt }) {
  // Only for your own messages in DMs and groups.
  if (!receipt) return <Check className="h-3.5 w-3.5 text-ink-400" aria-label="Sent" />;
  const t = new Date(message.createdAt).getTime();
  if (receipt.read && new Date(receipt.read).getTime() >= t) return <CheckCheck className="h-3.5 w-3.5 text-accent-500" aria-label="Read" />;
  if (receipt.delivered && new Date(receipt.delivered).getTime() >= t) return <CheckCheck className="h-3.5 w-3.5 text-ink-400" aria-label="Delivered" />;
  return <Check className="h-3.5 w-3.5 text-ink-400" aria-label="Sent" />;
}

function MessageItem({ m, meId, variant, grouped, canModerate, receipt, focused, onReply, onThread, onEdit, onReport, onAi, onJump, inThread }) {
  const [picker, setPicker] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const own = m.author?.id === meId;
  const bubble = variant === 'dm' || variant === 'group';

  if (m.kind === 'system') return <p className="py-2 text-center text-[11px] text-ink-400">{m.body}</p>;
  if (m.hiddenAuthor && !revealed) {
    return <p className="px-4 py-1 text-xs text-ink-400">Message from a trader you muted or blocked. <button type="button" className="underline" onClick={() => setRevealed(true)}>Show</button></p>;
  }

  const react = async (emoji) => {
    setPicker(false);
    try {
      await api.post(`/community/messages/${m.id}/reactions`, { emoji });
    } catch (err) {
      window.alert(err.message);
    }
  };
  const remove = async () => {
    if (!window.confirm(own ? 'Delete this message for everyone?' : 'Remove this message as a moderator?')) return;
    try {
      await api.delete(`/community/messages/${m.id}`, {});
    } catch (err) {
      window.alert(err.message);
    }
  };
  const pin = async () => {
    try {
      await api.post(`/community/messages/${m.id}/pin`, { pinned: !m.pinnedAt });
    } catch (err) {
      window.alert(err.message);
    }
  };
  const relation = async (kind) => {
    if (!window.confirm(`${kind === 'block' ? 'Block' : 'Mute'} ${m.author.name}?`)) return;
    await api.post(`/community/users/${m.author.id}/${kind}`, {});
    window.location.reload();
  };
  const gone = m.deleted || m.removed;
  const image = m.attachments?.find((a) => a.type === 'image');

  const content = (
    <>
      {m.replyTo ? (
        <button type="button" onClick={() => onJump?.(m.replyTo.id)} className={clsx('mb-1 block max-w-full truncate rounded-md border-l-2 border-accent-500 px-2 py-1 text-left text-xs', bubble && own ? 'bg-ink-900/20 text-ink-100' : 'bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-400')}>
          <span className="font-medium">{m.replyTo.author?.name ?? 'Deleted account'}</span>: {m.replyTo.deleted ? 'deleted message' : m.replyTo.body || (m.replyTo.hasAttachments ? 'attachment' : '')}
        </button>
      ) : null}
      {gone ? (
        <p className="text-sm italic text-ink-400">{m.removed ? 'Removed by a moderator' : 'Message deleted'}</p>
      ) : (
        <>
          <SafetyWarning warnings={m.warnings} compact />
          {m.body ? <div className="text-[15px] leading-relaxed"><RichText text={m.body} /></div> : null}
          <Attachments items={m.attachments} compact onAnalyze={(mediaId) => onAi('chart', '/community/ai/analyze-chart', { mediaId, messageId: m.id })} />
        </>
      )}
    </>
  );

  const reactions = m.reactions?.length ? (
    <div className={clsx('mt-1 flex flex-wrap gap-1', bubble && own && 'justify-end')}>
      {m.reactions.map((r) => (
        <button key={r.emoji} type="button" onClick={() => react(r.emoji)} aria-pressed={r.mine} className={clsx('inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-xs', r.mine ? 'border-accent-500 bg-accent-500/10 text-ink-900 dark:text-ink-50' : 'border-ink-200 text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300')}>
          {r.emoji} <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  ) : null;

  const threadLink = !inThread && m.threadCount ? (
    <button type="button" onClick={() => onThread(m)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline dark:text-accent-300">
      <MessagesSquare className="h-3.5 w-3.5" /> {m.threadCount} {m.threadCount === 1 ? 'reply' : 'replies'}
    </button>
  ) : null;

  const toolbar = !gone ? (
    <div className={clsx('absolute -top-3 z-10 hidden items-center gap-0.5 rounded-lg border border-ink-100 bg-white p-0.5 shadow-card group-hover:flex dark:border-ink-700 dark:bg-ink-800', bubble && own ? 'left-2' : 'right-3')}>
      <button type="button" onClick={() => setPicker((p) => !p)} className="rounded-md p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700" aria-label="React"><SmilePlus className="h-4 w-4" /></button>
      <button type="button" onClick={() => onReply(m)} className="rounded-md p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700" aria-label="Reply"><CornerUpLeft className="h-4 w-4" /></button>
      {!inThread && variant !== 'dm' ? <button type="button" onClick={() => onThread(m)} className="rounded-md p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700" aria-label="Reply in thread"><MessagesSquare className="h-4 w-4" /></button> : null}
      <Menu
        buttonClassName="h-6 w-6"
        items={[
          own && m.body ? { label: 'Edit', icon: Pencil, onClick: () => onEdit(m) } : null,
          { label: 'Copy text', icon: Copy, onClick: () => navigator.clipboard?.writeText(m.body ?? '') },
          { label: 'Save', icon: Bookmark, onClick: () => api.post('/community/saved', { itemType: 'message', itemId: m.id }).then(() => window.alert('Saved.')) },
          canModerate || variant === 'dm' ? { label: m.pinnedAt ? 'Unpin' : 'Pin', icon: m.pinnedAt ? PinOff : Pin, onClick: pin } : null,
          m.body && m.body.length > 20 ? { label: 'Fact check with Kotka', icon: HelpCircle, onClick: () => onAi('factcheck', '/community/ai/fact-check', { targetType: 'message', targetId: m.id }) } : null,
          image ? { label: 'Analyze chart', icon: Sparkles, onClick: () => onAi('chart', '/community/ai/analyze-chart', { mediaId: image.mediaId, messageId: m.id }) } : null,
          !own ? { label: 'Report', icon: Flag, onClick: () => onReport(m) } : null,
          !own && m.author?.id ? { label: 'Mute trader', icon: VolumeX, onClick: () => relation('mute') } : null,
          !own && m.author?.id ? { label: 'Block trader', icon: Ban, danger: true, onClick: () => relation('block') } : null,
          own || canModerate ? { label: own ? 'Delete' : 'Remove (moderator)', icon: Trash2, danger: true, onClick: remove } : null,
        ]}
      />
      {picker ? (
        <div className="absolute right-0 top-8 flex gap-0.5 rounded-xl border border-ink-100 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-800">
          {REACTIONS.map((e) => <button key={e} type="button" onClick={() => react(e)} className="rounded-md px-1.5 py-0.5 text-base hover:bg-ink-100 dark:hover:bg-ink-700" aria-label={`React ${e}`}>{e}</button>)}
        </div>
      ) : null}
    </div>
  ) : null;

  if (bubble) {
    return (
      <div id={`m-${m.id}`} className={clsx('group relative flex px-4', own ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-3', focused && 'animate-pulse')}>
        {!own && variant === 'group' ? <span className="mr-2 w-8 shrink-0">{!grouped ? <Avatar user={m.author} size={32} /> : null}</span> : null}
        <div className={clsx('relative max-w-[78%] rounded-2xl px-3 py-2', own ? 'rounded-br-md bg-ink-900 text-white dark:bg-accent-500/20 dark:text-ink-50' : 'rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-ink-800 dark:text-ink-50 dark:ring-ink-700', m.pinnedAt && 'ring-2 ring-accent-500/60')}>
          {!own && variant === 'group' && !grouped ? <p className="mb-0.5 text-xs font-semibold text-accent-700 dark:text-accent-300">{m.author?.name}</p> : null}
          {toolbar}
          {content}
          <p className={clsx('mt-0.5 flex items-center justify-end gap-1 text-[10px]', own ? 'text-ink-300' : 'text-ink-400')}>
            {m.pinnedAt ? <Pin className="h-3 w-3" /> : null}
            {m.editedAt ? 'edited · ' : ''}
            {clock(m.createdAt)}
            {own && !gone ? <Receipt message={m} receipt={receipt} /> : null}
          </p>
          {reactions}
          {threadLink}
        </div>
      </div>
    );
  }

  // Rooms, events and communities: compact rows.
  return (
    <div id={`m-${m.id}`} className={clsx('group relative flex gap-3 px-4 hover:bg-ink-50/70 dark:hover:bg-ink-800/30', grouped ? 'py-0.5' : 'pt-2.5 pb-0.5', focused && 'bg-accent-500/10', m.pinnedAt && 'border-l-2 border-accent-500')}>
      <span className="w-9 shrink-0">{!grouped ? <Avatar user={m.author} size={36} /> : <span className="hidden pt-1 text-right text-[10px] text-ink-300 group-hover:block">{clock(m.createdAt)}</span>}</span>
      <div className="min-w-0 flex-1 pb-1">
        {!grouped ? (
          <div className="flex items-baseline gap-2">
            <UserName user={m.author} showHandle={false} className="text-sm" />
            <span className="text-[11px] text-ink-400" title={new Date(m.createdAt).toLocaleString()}>{clock(m.createdAt)}{m.editedAt ? ' · edited' : ''}</span>
            {m.pinnedAt ? <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-300"><Pin className="h-3 w-3" /> Pinned</span> : null}
          </div>
        ) : null}
        <div className="text-ink-800 dark:text-ink-100">{content}</div>
        {reactions}
        {threadLink}
      </div>
      {toolbar}
    </div>
  );
}

export default memo(MessageItem);
