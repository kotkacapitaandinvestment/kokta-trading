import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from './realtime';

// The signed-in trader's Community identity and live unread counts.
const CommunityContext = createContext(null);

export function CommunityProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, profile: null, needsProfile: false, prefs: null, unread: { notifications: 0, messages: 0 }, suggestedUsername: null });
  const [activeConversation, setActiveConversation] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/community/me');
      setState({ loading: false, ...me });
      return me;
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  useRealtime('notification', (d) => {
    const n = d.notification;
    if (!n || (n.type === 'message' && n.data?.conversationId === activeConversation)) return;
    setState((s) => ({ ...s, unread: { ...s.unread, notifications: s.unread.notifications + (n.count > 1 ? 0 : 1) } }));
  });
  const deliveredAt = useRef({});
  useRealtime('message', (d) => {
    if (!['dm', 'group'].includes(d.kind) || d.message?.author?.id === state.profile?.id || d.conversationId === activeConversation) return;
    setState((s) => ({ ...s, unread: { ...s.unread, messages: s.unread.messages + 1 } }));
    if (Date.now() - (deliveredAt.current[d.conversationId] ?? 0) > 2000) {
      deliveredAt.current[d.conversationId] = Date.now();
      api.post(`/community/conversations/${d.conversationId}/delivered`, {}).catch(() => {});
    }
  });

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      setUnread: (patch) => setState((s) => ({ ...s, unread: { ...s.unread, ...patch } })),
      setProfile: (profile) => setState((s) => ({ ...s, profile: { ...s.profile, ...profile }, needsProfile: !profile.username && s.needsProfile })),
      activeConversation,
      setActiveConversation,
    }),
    [state, refresh, activeConversation],
  );
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  return useContext(CommunityContext) ?? { loading: true, unread: { notifications: 0, messages: 0 } };
}
