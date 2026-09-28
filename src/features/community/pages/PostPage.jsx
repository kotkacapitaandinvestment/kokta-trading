import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import { api } from '../../../lib/api';
import Button from '../../../components/ui/Button';
import PostCard from '../components/PostCard';
import Comments from '../components/Comments';
import { FollowButton } from '../components/Buttons';
import { IdeaStatus } from '../components/IdeaBlock';

function IdeaStatusEditor({ post, onUpdated }) {
  const [status, setStatus] = useState(post.idea.status === 'open' ? 'updated' : post.idea.status);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const save = async () => {
    try {
      const { post: p } = await api.patch(`/community/ideas/${post.id}/status`, { status, note });
      setNote('');
      onUpdated(p);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
      <p className="text-xs font-semibold text-ink-700 dark:text-ink-200">Update your idea</p>
      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800" aria-label="What’s changed">
          <option value="updated">Post an update</option>
          <option value="closed">Close the idea</option>
          <option value="invalidated">No longer valid</option>
          <option value="open">Reopen</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What changed? (shown to followers)" className="h-9 flex-1 rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
        <Button size="sm" onClick={save} disabled={status !== 'open' && !note.trim()}>Save</Button>
      </div>
      {error ? <p role="alert" className="text-xs text-loss-500">{error}</p> : null}
    </div>
  );
}

export default function PostPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null);
    api.get(`/community/posts/${id}`).then(setData).catch((err) => setError(err.message));
  }, [id]);
  useEffect(() => {
    const c = params.get('c');
    if (c && data) setTimeout(() => document.getElementById(`c-${c}`)?.scrollIntoView({ block: 'center' }), 600);
  }, [data, params]);
  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const post = data.post;
  const idea = post.idea;
  return (
    <div className="space-y-4">
      <Link to={idea ? '/app/community/ideas' : '/app/community'} className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
        <PostCard post={post} full />
        {idea ? (
          <div className="space-y-3 border-t border-ink-100 px-5 py-4 dark:border-ink-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-500">{data.followers} following this idea's updates</p>
              {!data.canEdit ? <FollowButton targetType="idea" targetId={post.id} following={post.followingIdea} labels={['Follow updates', 'Following updates']} /> : null}
            </div>
            {data.canEdit ? <IdeaStatusEditor post={post} onUpdated={(p) => setData((d) => ({ ...d, post: p }))} /> : null}
            {idea.history?.length > 1 ? (
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400"><History className="h-3.5 w-3.5" /> Status history</p>
                <ol className="mt-2 space-y-1.5 border-l border-ink-200 pl-3 dark:border-ink-700">
                  {idea.history.map((h, i) => (
                    <li key={i} className="text-xs text-ink-600 dark:text-ink-300"><IdeaStatus status={h.status} /> <span className="text-ink-400">{new Date(h.at).toLocaleString()}</span>{h.note ? <span className="block">{h.note}</span> : null}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <Comments targetType="post" targetId={post.id} canChallenge={!!idea} startChallenge={params.get('challenge') === '1'} />
      </div>
    </div>
  );
}
