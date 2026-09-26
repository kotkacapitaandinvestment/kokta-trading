import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import { api } from '../../../lib/api';

export default function Invite() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get(`/community/invite/${code}`).then(setData).catch((err) => setError(err.message)); }, [code]);
  const join = async () => {
    try {
      const r = await api.post(`/community/invite/${code}/join`, {});
      if (r.status === 'pending') setError('Request sent. An admin will review it.');
      else navigate(`/app/community/messages/${r.conversationId}`);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-ink-100 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
      {error ? <p className="text-sm text-ink-600 dark:text-ink-300">{error}</p> : !data ? <p className="text-sm text-ink-400">Loading invite…</p> : (
        <>
          <p className="text-xs uppercase tracking-wide text-ink-400">You've been invited to a {data.conversation.kind === 'group' ? 'private group' : 'community'}</p>
          <h1 className="mt-2 text-xl font-semibold text-ink-900 dark:text-ink-50">{data.conversation.name}</h1>
          {data.conversation.description ? <p className="mt-1 text-sm text-ink-500">{data.conversation.description}</p> : null}
          <p className="mt-2 text-xs text-ink-400">{data.conversation.memberCount} member{data.conversation.memberCount === 1 ? '' : 's'}</p>
          <Button className="mt-5" onClick={join}>{data.conversation.joinPolicy === 'approval' ? 'Request to join' : 'Join'}</Button>
        </>
      )}
    </div>
  );
}
