import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useRealtime } from '../realtime';
import ChatView from './ChatView';

// Loads a conversation's access, members and pins, then renders the chat.
export default function ConversationChat({ conversationId, variant, isPublic, focusId, header, emptyText, onDetails }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const load = () =>
    api
      .get(`/community/conversations/${conversationId}`)
      .then((d) => {
        setDetails(d);
        onDetails?.(d);
      })
      .catch((err) => setError(err.message));
  useEffect(() => {
    setDetails(null);
    load();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime('conversation', (d) => d.conversationId === conversationId && load());
  if (error) return <p className="p-6 text-sm text-loss-500">{error}</p>;
  if (!details) return <div className="m-4 flex-1 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />;
  if (!details.access.canRead) {
    const c = details.conversation;
    const request = async () => {
      try {
        await api.post(`/community/conversations/${c.id}/join`, {});
        load();
      } catch (err) {
        setError(err.message);
      }
    };
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
        <p className="text-base font-semibold text-ink-900 dark:text-ink-50">{c.name}</p>
        {c.description ? <p className="mt-1 max-w-md text-sm text-ink-500">{c.description}</p> : null}
        <p className="mt-2 text-xs text-ink-400">Private community · {c.memberCount} member{c.memberCount === 1 ? '' : 's'}</p>
        {details.access.pending ? <p className="mt-4 text-sm text-ink-500">Your request is waiting for an admin.</p> : <button type="button" onClick={request} className="mt-4 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white dark:bg-accent-500 dark:text-ink-950">Request to join</button>}
      </div>
    );
  }
  return (
    <ChatView
      key={conversationId}
      conversationId={conversationId}
      variant={variant ?? details.conversation.kind}
      isPublic={isPublic}
      access={details.access}
      members={details.members}
      pins={details.pins}
      focusId={focusId}
      header={typeof header === 'function' ? header(details, load) : header}
      emptyText={emptyText}
    />
  );
}
