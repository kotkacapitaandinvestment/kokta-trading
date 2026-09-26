import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useRealtime, useChannels } from '../realtime';
import { useCommunity } from '../CommunityContext';

// Live reactions arrive viewer-neutral ({ emoji, count, userIds }); turn them
// into the view shape with "mine".
export const withMine = (reactions, meId) => (reactions ?? []).map((r) => ({ emoji: r.emoji, count: r.count, mine: r.mine ?? (r.userIds ?? []).includes(meId) }));

// Messages, live updates, typing and receipts for one conversation (or one
// thread of it when threadRootId is set).
export function useConversation(conversationId, { threadRootId = null, isPublic = false, focusId = null } = {}) {
  const { profile, setActiveConversation, setUnread } = useCommunity();
  const meId = profile?.id;
  const [messages, setMessages] = useState([]);
  const [root, setRoot] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typing, setTyping] = useState({});
  const [receipts, setReceipts] = useState({}); // userId -> { read, delivered }
  const [focus, setFocus] = useState(focusId);
  const lastRead = useRef(0);

  useChannels(isPublic && conversationId ? [`conv:${conversationId}`] : []);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const r = focusId && !threadRootId
        ? await api.get(`/community/conversations/${conversationId}/messages/around/${focusId}`)
        : await api.get(`/community/conversations/${conversationId}/messages?limit=50${threadRootId ? `&thread=${threadRootId}` : ''}`);
      setMessages(r.messages);
      setHasMore(r.hasMore);
      setRoot(r.root ?? null);
      if (r.focusId) setFocus(r.focusId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId, threadRootId, focusId]);

  useEffect(() => {
    setMessages([]);
    load();
  }, [load]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || !messages.length) return 0;
    const r = await api.get(`/community/conversations/${conversationId}/messages?limit=50&before=${messages[0].id}${threadRootId ? `&thread=${threadRootId}` : ''}`);
    setMessages((prev) => [...r.messages, ...prev]);
    setHasMore(r.hasMore);
    return r.messages.length;
  }, [conversationId, threadRootId, hasMore, messages]);

  const markRead = useCallback(() => {
    if (!conversationId || threadRootId || document.visibilityState !== 'visible') return;
    if (Date.now() - lastRead.current < 1500) return;
    lastRead.current = Date.now();
    api.post(`/community/conversations/${conversationId}/read`, {}).then(() => api.get('/community/me').then((m) => setUnread(m.unread)).catch(() => {})).catch(() => {});
  }, [conversationId, threadRootId, setUnread]);

  useEffect(() => {
    if (threadRootId || !conversationId) return undefined;
    setActiveConversation(conversationId);
    markRead();
    return () => setActiveConversation(null);
  }, [conversationId, threadRootId, markRead, setActiveConversation]);

  const mine = (d) => d.conversationId === conversationId;
  const upsert = (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? { ...x, ...m, reactions: withMine(m.reactions, meId) } : x)) : [...prev, { ...m, reactions: withMine(m.reactions, meId) }]));

  useRealtime('message', (d) => {
    if (!mine(d)) return;
    const m = d.message;
    const belongs = threadRootId ? m.threadRootId === threadRootId : !m.threadRootId;
    if (!belongs) return;
    upsert(m);
    setTyping((t) => {
      const next = { ...t };
      delete next[m.author?.id];
      return next;
    });
    if (m.author?.id !== meId) markRead();
  });
  useRealtime('message_updated', (d) => {
    if (!mine(d)) return;
    setMessages((prev) => prev.map((x) => (x.id === d.message.id ? { ...x, ...d.message, reactions: withMine(d.message.reactions, meId) } : x)));
    if (root?.id === d.message.id) setRoot((r) => ({ ...r, ...d.message, reactions: withMine(d.message.reactions, meId) }));
  });
  useRealtime('message_removed', (d) => {
    if (!mine(d)) return;
    setMessages((prev) => prev.map((x) => (x.id === d.messageId ? { ...x, removed: true, body: '', attachments: [] } : x)));
  });
  useRealtime('reaction', (d) => {
    if (!mine(d)) return;
    setMessages((prev) => prev.map((x) => (x.id === d.messageId ? { ...x, reactions: withMine(d.reactions, meId) } : x)));
    if (root?.id === d.messageId) setRoot((r) => ({ ...r, reactions: withMine(d.reactions, meId) }));
  });
  useRealtime('thread', (d) => {
    if (!mine(d) || threadRootId) return;
    setMessages((prev) => prev.map((x) => (x.id === d.rootId ? { ...x, threadCount: (x.threadCount ?? 0) + 1, lastThreadAt: d.lastThreadAt } : x)));
  });
  useRealtime('poll', (d) => {
    if (!mine(d)) return;
    setMessages((prev) => prev.map((x) => (x.id === d.messageId ? { ...x, attachments: x.attachments.map((a) => (a.type === 'poll' ? { ...a, poll: { ...d.poll, myVote: a.poll?.myVote ?? null } } : a)) } : x)));
  });
  useRealtime('typing', (d) => {
    if (!mine(d) || d.user?.id === meId || (d.threadRootId ?? null) !== (threadRootId ?? null)) return;
    setTyping((t) => ({ ...t, [d.user.id]: { name: d.user.name, until: Date.now() + 4500 } }));
  });
  useRealtime('read', (d) => mine(d) && setReceipts((r) => ({ ...r, [d.userId]: { ...r[d.userId], read: d.at, delivered: d.at } })));
  useRealtime('delivered', (d) => mine(d) && setReceipts((r) => ({ ...r, [d.userId]: { ...r[d.userId], delivered: d.at } })));

  // Expire typing indicators.
  useEffect(() => {
    const t = setInterval(() => setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > Date.now()))), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  return { messages, setMessages, upsert, root, hasMore, loadOlder, loading, error, reload: load, typing: Object.values(typing).map((t) => t.name), receipts, setReceipts, focus, setFocus };
}
