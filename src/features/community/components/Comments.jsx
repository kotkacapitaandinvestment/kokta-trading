import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CornerDownRight, Flag, HelpCircle, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import Button from '../../../components/ui/Button';
import { useRealtime } from '../realtime';
import { timeAgo } from '../util';
import { Avatar, UserName } from './Identity';
import RichText from './RichText';
import SafetyWarning from './SafetyWarning';
import Menu from './Menu';
import ReportDialog from './ReportDialog';
import { MentionTextarea } from './inputs';
import AiPanel, { useAiAction } from './AiPanel';

const CATEGORIES = [
  ['technical', 'Technical'],
  ['fundamental', 'Fundamental'],
  ['risk', 'Risk'],
  ['timing', 'Timing'],
  ['liquidity', 'Liquidity'],
  ['invalidation', 'Invalidation'],
];

function CommentForm({ targetType, targetId, parentId, challenge, onPosted, onCancel, autoFocus }) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState(challenge ? 'fundamental' : null);
  const [state, setState] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const { comment } = await api.post('/community/comments', { targetType, targetId, parentId, body, challengeCategory: challenge ? category : undefined });
      setBody('');
      setState(null);
      onPosted(comment);
    } catch (err) {
      setState({ error: err.message });
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      {challenge ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-700 dark:text-ink-200">What assumption do you disagree with?</p>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Challenge category">
            {CATEGORIES.map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={category === v} onClick={() => setCategory(v)} className={clsx('rounded-md px-2 py-1 text-xs font-medium', category === v ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'bg-ink-50 text-ink-600 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-300')}>{l}</button>
            ))}
          </div>
        </div>
      ) : null}
      <MentionTextarea value={body} onChange={setBody} rows={challenge ? 3 : 2} maxLength={3000} autoFocus={autoFocus} placeholder={challenge ? 'Explain the assumption and why you disagree. Debate the idea, not the person.' : parentId ? 'Reply…' : 'Add a comment…'} className="w-full rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
      {state?.error ? <p role="alert" className="text-xs text-loss-500">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" size="sm" disabled={!body.trim() || state?.busy}>{challenge ? 'Post challenge' : 'Comment'}</Button>
      </div>
    </form>
  );
}

function CommentItem({ c, replies, onReply, onChanged, depth = 0 }) {
  const [editing, setEditing] = useState(null);
  const [report, setReport] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const ai = useAiAction();
  if (c.hiddenAuthor && !revealed) return <p className="py-2 text-xs text-ink-400">Comment from a trader you muted. <button type="button" className="text-accent-700 underline dark:text-accent-300" onClick={() => setRevealed(true)}>Show</button></p>;
  const save = async () => {
    try {
      const { comment } = await api.patch(`/community/comments/${c.id}`, { body: editing });
      onChanged(comment);
      setEditing(null);
    } catch (err) {
      window.alert(err.message);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this comment?')) return;
    await api.delete(`/community/comments/${c.id}`);
    onChanged({ ...c, deleted: true, body: '' });
  };
  return (
    <div id={`c-${c.id}`} className={clsx('py-3', depth && 'pl-10')}>
      <div className="flex gap-2.5">
        <Avatar user={c.author} size={depth ? 26 : 32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              <UserName user={c.author} showHandle={false} />
              <span className="text-xs text-ink-400">{timeAgo(c.createdAt)}{c.editedAt ? ' · edited' : ''}</span>
              {c.challengeCategory ? <span className="inline-flex items-center gap-1 rounded bg-accent-500/15 px-1.5 py-px text-[10px] font-semibold uppercase text-accent-800 dark:text-accent-300"><ShieldCheck className="h-3 w-3" /> Challenge: {c.challengeCategory}</span> : null}
            </div>
            {!c.deleted && !c.removed ? (
              <Menu
                items={[
                  c.mine ? { label: 'Edit', icon: Pencil, onClick: () => setEditing(c.body) } : null,
                  c.mine ? { label: 'Delete', icon: Trash2, danger: true, onClick: remove } : null,
                  { label: 'Fact check with Kotka', icon: HelpCircle, onClick: () => ai.run('factcheck', '/community/ai/fact-check', { targetType: 'comment', targetId: c.id }) },
                  !c.mine ? { label: 'Report', icon: Flag, onClick: () => setReport(true) } : null,
                ]}
              />
            ) : null}
          </div>
          {c.deleted || c.removed ? (
            <p className="text-sm italic text-ink-400">{c.removed ? 'Removed by a moderator.' : 'Deleted.'}</p>
          ) : editing !== null ? (
            <div className="mt-1 space-y-2">
              <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={3} className="w-full rounded-lg border border-ink-200 bg-white p-2 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
              <div className="flex gap-2"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
            </div>
          ) : (
            <>
              <SafetyWarning warnings={c.warnings} compact />
              <p className="mt-0.5 text-sm leading-relaxed text-ink-800 dark:text-ink-100"><RichText text={c.body} /></p>
              {!depth ? <button type="button" onClick={() => onReply(c.id)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400"><CornerDownRight className="h-3 w-3" /> Reply</button> : null}
            </>
          )}
          <AiPanel state={ai.state} onClose={ai.clear} className="mt-2" />
        </div>
      </div>
      {replies?.map((r) => <CommentItem key={r.id} c={r} onReply={onReply} onChanged={onChanged} depth={1} />)}
      {report ? <ReportDialog target={{ type: 'comment', id: c.id, label: 'comment' }} onClose={() => setReport(false)} /> : null}
    </div>
  );
}

// Comments and structured challenges for a post, trade idea or news item.
export default function Comments({ targetType, targetId, canChallenge = false, startChallenge = false }) {
  const [comments, setComments] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [mode, setMode] = useState(startChallenge && canChallenge ? 'challenge' : 'comment');
  const [filter, setFilter] = useState('all');
  const load = () => api.get(`/community/comments?targetType=${targetType}&targetId=${targetId}`).then((r) => setComments(r.comments)).catch(() => setComments([]));
  useEffect(() => { load(); }, [targetType, targetId]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime('comment', (d) => {
    if (d.targetId === targetId && !comments?.some((c) => c.id === d.commentId)) load();
  });
  const upsert = (c) => setComments((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [...prev, c]));
  const tree = useMemo(() => {
    const list = (comments ?? []).filter((c) => filter === 'all' || c.challengeCategory);
    const top = list.filter((c) => !c.parentId);
    return top.map((c) => ({ c, replies: list.filter((r) => r.parentId === c.id) }));
  }, [comments, filter]);
  const challengeCount = (comments ?? []).filter((c) => c.challengeCategory).length;

  return (
    <section aria-label="Discussion" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Discussion {comments ? <span className="font-normal text-ink-400">({comments.length})</span> : null}</h2>
        {canChallenge && challengeCount ? (
          <div className="flex gap-1 text-xs">
            {[['all', 'All'], ['challenges', `Challenges (${challengeCount})`]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={clsx('rounded-md px-2 py-1 font-medium', filter === v ? 'bg-ink-900 text-white dark:bg-ink-700' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>{l}</button>)}
          </div>
        ) : null}
      </div>
      {canChallenge ? (
        <div className="flex gap-1 rounded-lg bg-ink-50 p-1 text-xs dark:bg-ink-800" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'comment'} onClick={() => setMode('comment')} className={clsx('flex-1 rounded-md py-1.5 font-medium', mode === 'comment' ? 'bg-white shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500')}>Comment</button>
          <button type="button" role="tab" aria-selected={mode === 'challenge'} onClick={() => setMode('challenge')} className={clsx('flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 font-medium', mode === 'challenge' ? 'bg-white shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500')}><ShieldCheck className="h-3.5 w-3.5" /> Challenge thesis</button>
        </div>
      ) : null}
      <CommentForm key={mode} targetType={targetType} targetId={targetId} challenge={mode === 'challenge'} onPosted={upsert} autoFocus={startChallenge} />
      <div className="divide-y divide-ink-100 dark:divide-ink-800">
        {!comments ? <p className="py-4 text-sm text-ink-400">Loading…</p> : !tree.length ? <p className="py-6 text-center text-sm text-ink-400">No discussion yet. Start the conversation.</p> : null}
        {tree.map(({ c, replies }) => (
          <div key={c.id}>
            <CommentItem c={c} replies={replies} onReply={setReplyTo} onChanged={upsert} />
            {replyTo === c.id ? <div className="pb-3 pl-10"><CommentForm targetType={targetType} targetId={targetId} parentId={c.id} onPosted={(r) => { upsert(r); setReplyTo(null); }} onCancel={() => setReplyTo(null)} autoFocus /></div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
