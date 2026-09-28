import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Landmark, Sparkles } from 'lucide-react';
import { api } from '../../../lib/api';
import { safeHref } from '../../../lib/safeHref';
import Button from '../../../components/ui/Button';
import { ago } from '../util';
import { SaveButton } from '../components/Buttons';
import Comments from '../components/Comments';
import PostCard from '../components/PostCard';
import AiPanel, { useAiAction } from '../components/AiPanel';

export default function NewsDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const ai = useAiAction();
  useEffect(() => { api.get(`/community/news/${id}`).then(setData).catch((err) => setError(err.message)); }, [id]);
  if (error) return <p className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{error}</p>;
  if (!data) return <div className="h-80 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />;
  const n = data.news;
  const explanation = ai.state ?? (n.explanation ? { kind: 'explain', result: n.explanation, cached: true } : null);
  return (
    <div className="space-y-4">
      <Link to="/app/community" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
      <article className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          {n.official ? <span className="inline-flex items-center gap-1 font-semibold text-accent-700 dark:text-accent-300"><Landmark className="h-3.5 w-3.5" /> Official release</span> : null}
          <span>{n.provider}</span><span>· {ago(n.publishedAt)}</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-ink-900 dark:text-ink-50">{n.headline}</h1>
        {n.summary ? <p className="mt-3 text-[15px] leading-relaxed text-ink-700 dark:text-ink-200">{n.summary}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={safeHref(n.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">Read the full story <ExternalLink className="h-3 w-3" /></a>
          <SaveButton itemType="news" itemId={n.id} saved={data.saved} />
          {!n.explanation && !ai.state ? <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => ai.run('explain', '/community/ai/explain-news', { newsId: n.id })}>Why it matters</Button> : null}
        </div>
        {n.relatedMarkets?.length ? <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">Related markets: {n.relatedMarkets.map((m) => <Link key={m.symbol} to={`/app/community/markets/${m.symbol}`} className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-ink-700 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-200">{m.display}</Link>)}</p> : null}
      </article>
      {explanation ? <AiPanel state={explanation} onClose={ai.clear} /> : null}
      {data.posts.length ? (
        <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
          <h2 className="border-b border-ink-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400 dark:border-ink-800">Traders' takes</h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">{data.posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
        </section>
      ) : null}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"><Comments targetType="news" targetId={n.id} /></div>
    </div>
  );
}
