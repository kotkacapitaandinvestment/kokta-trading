import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, Loader2, MessagesSquare, Pin, Search, Sparkles, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { useCommunity } from '../CommunityContext';
import { dayLabel } from '../util';
import ReportDialog from '../components/ReportDialog';
import AiPanel, { useAiAction } from '../components/AiPanel';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';
import { useConversation } from './useConversation';

const GROUP_MS = 5 * 60 * 1000;

function MessageList({ conv, meId, variant, canModerate, receiptFor, onReply, onThread, onEdit, onReport, onAi, inThread, emptyText }) {
  const box = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const prevLen = useRef(0);
  const restore = useRef(null);
  const { messages, hasMore, loadOlder, loading, focus, setFocus } = conv;

  const scrollToBottom = (smooth) => box.current?.scrollTo({ top: box.current.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

  // Keep the view pinned to the bottom for new messages; preserve position
  // when older ones are prepended.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current;
      restore.current = null;
    } else if (focus) {
      const target = document.getElementById(`m-${focus}`);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        setTimeout(() => setFocus(null), 2500);
      }
    } else if (messages.length > prevLen.current) {
      const last = messages[messages.length - 1];
      if (atBottom || last?.author?.id === meId || prevLen.current === 0) scrollToBottom(prevLen.current !== 0);
      else setUnseen((n) => n + (messages.length - prevLen.current));
    }
    prevLen.current = messages.length;
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = async () => {
    const el = box.current;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setUnseen(0);
    if (el.scrollTop < 120 && hasMore && restore.current === null) {
      restore.current = el.scrollHeight - el.scrollTop;
      const n = await loadOlder();
      if (!n) restore.current = null;
    }
  };

  const jump = async (id) => {
    if (document.getElementById(`m-${id}`)) {
      document.getElementById(`m-${id}`).scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFocus(id);
      setTimeout(() => setFocus(null), 2500);
    }
  };

  const rows = useMemo(() => {
    const out = [];
    let prev = null;
    for (const m of messages) {
      const day = new Date(m.createdAt).toDateString();
      if (!prev || new Date(prev.createdAt).toDateString() !== day) out.push({ type: 'day', key: `d-${day}`, label: dayLabel(m.createdAt) });
      const grouped = prev && prev.kind !== 'system' && m.kind !== 'system' && prev.author?.id === m.author?.id && new Date(m.createdAt) - new Date(prev.createdAt) < GROUP_MS && new Date(prev.createdAt).toDateString() === day && !m.replyTo;
      out.push({ type: 'msg', key: m.id, m, grouped });
      prev = m;
    }
    return out;
  }, [messages]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={box} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain scrollbar-thin pb-3" aria-live="polite" aria-relevant="additions">
        {hasMore ? <p className="py-3 text-center text-xs text-ink-400"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading earlier messages</p> : null}
        {!hasMore && messages.length > 0 && !inThread ? <p className="py-4 text-center text-[11px] text-ink-400">Beginning of the conversation</p> : null}
        {loading && !messages.length ? <p className="py-10 text-center text-sm text-ink-400">Loading…</p> : null}
        {!loading && !messages.length ? <p className="px-6 py-16 text-center text-sm text-ink-400">{emptyText ?? 'No messages yet. Start the conversation.'}</p> : null}
        {rows.map((r) =>
          r.type === 'day' ? (
            <div key={r.key} className="sticky top-0 z-[5] flex justify-center py-2">
              <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-ink-500 shadow-sm ring-1 ring-ink-100 backdrop-blur dark:bg-ink-900/90 dark:text-ink-400 dark:ring-ink-800">{r.label}</span>
            </div>
          ) : (
            <MessageItem key={r.key} m={r.m} meId={meId} variant={variant} grouped={r.grouped} canModerate={canModerate} receipt={r.m.author?.id === meId ? receiptFor(r.m) : null} focused={focus === r.m.id} onReply={onReply} onThread={onThread} onEdit={onEdit} onReport={onReport} onAi={onAi} onJump={jump} inThread={inThread} />
          ),
        )}
      </div>
      {!atBottom && (unseen > 0 || messages.length > 20) ? (
        <button type="button" onClick={() => { scrollToBottom(true); setUnseen(0); }} className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-xs font-medium text-white shadow-pop dark:bg-accent-500 dark:text-ink-950">
          <ArrowDown className="h-3.5 w-3.5" /> {unseen ? `${unseen} new message${unseen === 1 ? '' : 's'}` : 'Latest'}
        </button>
      ) : null}
    </div>
  );
}

function Typing({ names }) {
  if (!names.length) return null;
  return <p className="px-4 pb-1 text-[11px] italic text-ink-400">{names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…'}</p>;
}

function ThreadPanel({ conversationId, root, variant, isPublic, access, canModerate, onClose, onAi }) {
  const { profile } = useCommunity();
  const conv = useConversation(conversationId, { threadRootId: root.id, isPublic });
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [report, setReport] = useState(null);
  const r = conv.root ?? root;
  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-ink-900 lg:static lg:z-auto lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-ink-100 lg:dark:border-ink-800" aria-label="Thread">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-50"><MessagesSquare className="h-4 w-4" /> Thread</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onAi('summary', '/community/ai/summarize', { conversationId, threadRootId: root.id })} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent-700 hover:bg-accent-500/10 dark:text-accent-300"><Sparkles className="h-3.5 w-3.5" /> Summarize</button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Close thread"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="border-b border-ink-100 pb-2 dark:border-ink-800">
        {r.createdAt ? <MessageItem m={r} meId={profile?.id} variant="room" grouped={false} canModerate={canModerate} onReply={() => {}} onThread={() => {}} onEdit={() => {}} onReport={() => {}} onAi={onAi} inThread /> : <p className="px-4 py-3 text-xs text-ink-400">Loading thread…</p>}
        <p className="px-4 text-[11px] text-ink-400">{conv.messages.length} {conv.messages.length === 1 ? 'reply' : 'replies'}</p>
      </div>
      <MessageList conv={conv} meId={profile?.id} variant="room" canModerate={canModerate} receiptFor={() => null} onReply={setReplyTo} onThread={() => {}} onEdit={setEditing} onReport={setReport} onAi={onAi} inThread emptyText="No replies yet." />
      <Typing names={conv.typing} />
      <MessageComposer conversationId={conversationId} threadRootId={root.id} access={access} replyTo={replyTo} onClearReply={() => setReplyTo(null)} editing={editing} onDoneEditing={() => setEditing(null)} placeholder="Reply in thread" />
      {report ? <ReportDialog target={{ type: 'message', id: report.id, label: 'message' }} onClose={() => setReport(null)} /> : null}
    </aside>
  );
}

// variant: room | event | community | dm | group
export default function ChatView({ conversationId, variant = 'room', access, members = [], pins = [], isPublic = false, focusId = null, header = null, emptyText, className }) {
  const { profile } = useCommunity();
  const conv = useConversation(conversationId, { isPublic, focusId });
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [thread, setThread] = useState(null);
  const [report, setReport] = useState(null);
  const [pinList, setPinList] = useState(pins);
  const [showPins, setShowPins] = useState(false);
  const [search, setSearch] = useState(null);
  const ai = useAiAction();
  useEffect(() => setPinList(pins), [pins]);

  // Pins change with message updates.
  useEffect(() => {
    const pinned = conv.messages.filter((m) => m.pinnedAt && !m.deleted && !m.removed);
    if (pinned.length || pinList.some((p) => conv.messages.some((m) => m.id === p.id && !m.pinnedAt))) {
      setPinList((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        for (const m of conv.messages) {
          if (m.pinnedAt && !m.deleted && !m.removed) map.set(m.id, m);
          else map.delete(m.id);
        }
        return [...map.values()].sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
      });
    }
  }, [conv.messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Receipts: DMs show the other person's; groups show "read by everyone".
  const others = members.filter((m) => m.id !== profile?.id && m.status === 'active');
  const receiptFor = useCallback(
    (msg) => {
      if (!['dm', 'group'].includes(variant) || !others.length) return null;
      const live = others.map((o) => ({ read: conv.receipts[o.id]?.read ?? o.lastReadAt, delivered: conv.receipts[o.id]?.delivered ?? o.lastDeliveredAt }));
      const minOf = (k) => (live.some((x) => !x[k]) ? null : live.reduce((a, x) => (new Date(x[k]) < new Date(a) ? x[k] : a), live[0][k]));
      return { read: minOf('read'), delivered: minOf('delivered') };
    },
    [variant, others, conv.receipts],
  );

  const runSearch = async (q) => {
    if (q.trim().length < 2) return setSearch((s) => ({ ...s, results: [] }));
    const r = await api.get(`/community/conversations/${conversationId}/search?q=${encodeURIComponent(q)}`);
    setSearch((s) => ({ ...s, results: r.messages }));
  };

  const openThread = (m) => setThread(m.threadRootId ? { id: m.threadRootId } : m);

  return (
    <div className={clsx('flex min-h-0 flex-1', className)}>
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-1.5 dark:border-ink-800">
          {pinList.length ? (
            <button type="button" onClick={() => setShowPins((s) => !s)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-ink-50 dark:hover:bg-ink-800">
              <Pin className="h-3.5 w-3.5 shrink-0 text-accent-600" />
              <span className="truncate text-ink-600 dark:text-ink-300"><span className="font-semibold">{pinList[0].author?.name}:</span> {pinList[0].body || 'attachment'}</span>
              {pinList.length > 1 ? <span className="shrink-0 text-ink-400">+{pinList.length - 1}</span> : null}
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <button type="button" onClick={() => setSearch(search ? null : { q: '', results: null })} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800" aria-label="Search this conversation"><Search className="h-4 w-4" /></button>
          <button type="button" onClick={() => ai.run('summary', '/community/ai/summarize', { conversationId })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-500/10 dark:text-accent-300" title="Summarize with Kotka AI"><Sparkles className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Summarize</span></button>
        </div>
        {showPins ? (
          <div className="max-h-52 overflow-y-auto border-b border-ink-100 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/60">
            {pinList.map((p) => (
              <button key={p.id} type="button" onClick={() => { setShowPins(false); conv.setFocus(p.id); document.getElementById(`m-${p.id}`)?.scrollIntoView({ block: 'center' }); }} className="block w-full px-4 py-2 text-left text-xs hover:bg-ink-100 dark:hover:bg-ink-800">
                <span className="font-semibold text-ink-700 dark:text-ink-200">{p.author?.name}</span> <span className="text-ink-500">{p.body?.slice(0, 160) || 'attachment'}</span>
              </button>
            ))}
          </div>
        ) : null}
        {search ? (
          <div className="border-b border-ink-100 px-3 py-2 dark:border-ink-800">
            <input autoFocus value={search.q} onChange={(e) => { setSearch({ ...search, q: e.target.value }); runSearch(e.target.value); }} placeholder="Search messages in this conversation" className="h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            {search.results ? (
              <ul className="mt-2 max-h-60 overflow-y-auto">
                {!search.results.length ? <li className="py-2 text-xs text-ink-400">No matches.</li> : null}
                {search.results.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => { setSearch(null); if (m.threadRootId) setThread({ id: m.threadRootId }); else window.location.assign(`${window.location.pathname}?m=${m.id}`); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-ink-50 dark:hover:bg-ink-800">
                      <span className="font-semibold text-ink-700 dark:text-ink-200">{m.author?.name}</span> <span className="text-ink-400">{new Date(m.createdAt).toLocaleString()}</span>
                      <span className="block truncate text-ink-600 dark:text-ink-300">{m.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {ai.state ? <div className="max-h-[45%] overflow-y-auto border-b border-ink-100 p-3 dark:border-ink-800"><AiPanel state={ai.state} onClose={ai.clear} /></div> : null}
        {conv.error ? <p role="alert" className="p-6 text-sm text-loss-500">{conv.error}</p> : (
          <MessageList conv={conv} meId={profile?.id} variant={variant} canModerate={access?.canModerate} receiptFor={receiptFor} onReply={setReplyTo} onThread={openThread} onEdit={setEditing} onReport={setReport} onAi={ai.run} emptyText={emptyText} />
        )}
        <Typing names={conv.typing} />
        <MessageComposer conversationId={conversationId} access={access} replyTo={replyTo} onClearReply={() => setReplyTo(null)} editing={editing} onDoneEditing={() => setEditing(null)} placeholder={variant === 'room' ? 'Share what you see in this market…' : undefined} />
      </div>
      {thread ? <ThreadPanel key={thread.id} conversationId={conversationId} root={thread} variant={variant} isPublic={isPublic} access={access} canModerate={access?.canModerate} onClose={() => setThread(null)} onAi={ai.run} /> : null}
      {report ? <ReportDialog target={{ type: 'message', id: report.id, label: 'message' }} onClose={() => setReport(null)} /> : null}
    </div>
  );
}
