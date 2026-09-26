import { useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, BarChart3, HelpCircle, LineChart, MessageSquare, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { api } from '../../../lib/api';
import Button from '../../../components/ui/Button';
import { useCommunity } from '../CommunityContext';
import { Avatar } from './Identity';
import { InstrumentSelect, ImagePicker, UploadPreviews, useImageUploads, MentionTextarea } from './inputs';

const TYPES = [
  { kind: 'post', label: 'Post', icon: MessageSquare },
  { kind: 'market', label: 'Market', icon: LineChart },
  { kind: 'idea', label: 'Trade idea', icon: TrendingUp },
  { kind: 'poll', label: 'Poll', icon: BarChart3 },
  { kind: 'question', label: 'Question', icon: HelpCircle },
];
const TIMEFRAMES = ['15m', '30m', '1H', '4H', 'Daily', 'Weekly', 'Monthly'];
export const TOPICS = ['macro', 'technical', 'price-action', 'risk', 'psychology', 'education', 'central-banks', 'inflation', 'employment', 'geopolitics', 'crypto', 'commodities'];

const field = 'h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50';

export default function Composer({ onCreated, defaultKind = 'post', defaultInstrument = null, compact = false, lockKind = false }) {
  const { profile } = useCommunity();
  const [kind, setKind] = useState(defaultKind);
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState('');
  const [instrument, setInstrument] = useState(defaultInstrument);
  const [topics, setTopics] = useState([]);
  const [idea, setIdea] = useState({ direction: 'bullish', timeframe: '4H', entry: '', stop: '', target: '', thesis: '' });
  const [poll, setPoll] = useState({ question: '', options: ['', ''], closesInHours: 72 });
  const [state, setState] = useState(null);
  const uploads = useImageUploads(4);

  const rr = (() => {
    const [e, s, t] = [idea.entry, idea.stop, idea.target].map(Number);
    if (![e, s, t].every((v) => v > 0) || e === s) return null;
    return Math.round((Math.abs(t - e) / Math.abs(e - s)) * 100) / 100;
  })();

  const reset = () => {
    setBody('');
    setTopics([]);
    setIdea({ direction: 'bullish', timeframe: '4H', entry: '', stop: '', target: '', thesis: '' });
    setPoll({ question: '', options: ['', ''], closesInHours: 72 });
    uploads.reset();
    if (compact) setOpen(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const { post } = await api.post('/community/posts', {
        kind,
        body,
        instrument,
        topics,
        attachments: uploads.attachments,
        ...(kind === 'idea' ? { idea: { ...idea, entry: Number(idea.entry), stop: Number(idea.stop), target: Number(idea.target) } } : {}),
        ...(kind === 'poll' ? { poll: { ...poll, options: poll.options.filter((o) => o.trim()) } } : {}),
      });
      setState(null);
      reset();
      onCreated?.(post);
    } catch (err) {
      setState({ error: err.message });
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm text-ink-400 hover:bg-ink-50/60 dark:hover:bg-ink-800/30">
        <Avatar user={profile} size={36} />
        {kind === 'idea' ? 'Publish a trade idea…' : 'Share a view, a chart or a question…'}
        <Plus className="ml-auto h-4 w-4" />
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 px-5 py-4">
      {!lockKind ? (
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Post type">
          {TYPES.map((t) => (
            <button key={t.kind} type="button" role="tab" aria-selected={kind === t.kind} onClick={() => setKind(t.kind)} className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors', kind === t.kind ? 'bg-ink-900 text-white dark:bg-accent-500 dark:text-ink-950' : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800')}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {kind === 'idea' ? (
        <div className="space-y-3 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
          <div className="flex flex-wrap gap-2">
            <InstrumentSelect value={instrument} onChange={setInstrument} required />
            <div className="flex overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700" role="radiogroup" aria-label="Direction">
              {[['bullish', 'Bullish', TrendingUp], ['bearish', 'Bearish', TrendingDown]].map(([v, l, I]) => (
                <button key={v} type="button" role="radio" aria-checked={idea.direction === v} onClick={() => setIdea({ ...idea, direction: v })} className={clsx('inline-flex items-center gap-1 px-3 text-xs font-medium', idea.direction === v ? (v === 'bullish' ? 'bg-profit-500 text-white' : 'bg-loss-500 text-white') : 'text-ink-600 dark:text-ink-300')}>
                  <I className="h-3.5 w-3.5" /> {l}
                </button>
              ))}
            </div>
            <select value={idea.timeframe} onChange={(e) => setIdea({ ...idea, timeframe: e.target.value })} className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100" aria-label="Timeframe">
              {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['entry', 'stop', 'target'].map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[11px] font-medium capitalize text-ink-500">{k === 'stop' ? 'Stop loss' : k === 'target' ? 'Take profit' : 'Entry'}</span>
                <input inputMode="decimal" value={idea[k]} onChange={(e) => setIdea({ ...idea, [k]: e.target.value.replace(/[^\d.]/g, '') })} className={`${field} font-mono`} required />
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-500">Reward-to-risk: <span className="font-mono font-semibold text-ink-800 dark:text-ink-100">{rr ? `${rr}:1` : 'n/a'}</span></p>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-500">Thesis: why, and what would prove you wrong</span>
            <textarea value={idea.thesis} onChange={(e) => setIdea({ ...idea, thesis: e.target.value })} rows={4} maxLength={5000} required className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
          </label>
          <p className="text-[11px] text-ink-400">Trade ideas are market theses for discussion. They are not signals, and Kotka does not verify them.</p>
        </div>
      ) : null}

      {kind === 'poll' ? (
        <div className="space-y-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
          <input value={poll.question} onChange={(e) => setPoll({ ...poll, question: e.target.value })} placeholder="Question, e.g. What is your EUR/USD view this week?" maxLength={200} className={field} required />
          {poll.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={(e) => setPoll({ ...poll, options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Option ${i + 1}`} maxLength={80} className={field} required={i < 2} />
              {poll.options.length > 2 ? <button type="button" onClick={() => setPoll({ ...poll, options: poll.options.filter((_, j) => j !== i) })} className="text-ink-400" aria-label="Remove option"><X className="h-4 w-4" /></button> : null}
            </div>
          ))}
          <div className="flex items-center justify-between">
            {poll.options.length < 6 ? <button type="button" onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })} className="text-xs font-medium text-accent-700 dark:text-accent-300">+ Add option</button> : <span />}
            <select value={poll.closesInHours} onChange={(e) => setPoll({ ...poll, closesInHours: Number(e.target.value) })} className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-xs dark:border-ink-700 dark:bg-ink-800" aria-label="Poll length">
              {[[24, '1 day'], [72, '3 days'], [168, '1 week']].map(([v, l]) => <option key={v} value={v}>Closes in {l}</option>)}
            </select>
          </div>
        </div>
      ) : null}

      <MentionTextarea
        value={body}
        onChange={setBody}
        rows={kind === 'idea' ? 2 : 3}
        maxLength={5000}
        placeholder={kind === 'question' ? 'Ask the community, e.g. Why did EUR/USD move after the inflation release?' : kind === 'idea' ? 'Anything to add (optional)' : kind === 'poll' ? 'Context (optional)' : 'Share a view or a chart. Use @ to mention a trader.'}
        className="w-full resize-y rounded-xl border border-ink-200 bg-white p-3 text-[15px] leading-relaxed text-ink-900 outline-none placeholder:text-ink-400 focus:border-accent-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
      />
      <UploadPreviews uploads={uploads} />

      <div className="flex flex-wrap items-center gap-2">
        <ImagePicker uploads={uploads} label="Add chart or image" />
        {kind !== 'idea' ? <InstrumentSelect value={instrument} onChange={setInstrument} required={kind === 'market'} className="h-9" placeholder={kind === 'market' ? 'Choose market' : 'Market (optional)'} /> : null}
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-lg px-2.5 text-xs font-medium text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800">{topics.length ? topics.map((t) => `#${t}`).join(' ') : '# Topics'}</summary>
          <div className="absolute z-20 mt-1 flex w-64 flex-wrap gap-1 rounded-xl border border-ink-100 bg-white p-2 shadow-pop dark:border-ink-700 dark:bg-ink-800">
            {TOPICS.map((t) => (
              <button key={t} type="button" onClick={() => setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : prev.length < 3 ? [...prev, t] : prev))} className={clsx('rounded-md px-2 py-1 text-xs', topics.includes(t) ? 'bg-accent-500 text-ink-950' : 'bg-ink-50 text-ink-600 dark:bg-ink-700 dark:text-ink-200')}>#{t}</button>
            ))}
          </div>
        </details>
        <div className="ml-auto flex items-center gap-2">
          {compact ? <Button type="button" variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }}>Cancel</Button> : null}
          <Button type="submit" size="sm" disabled={state?.busy || uploads.busy}>{state?.busy ? 'Posting…' : kind === 'idea' ? 'Publish idea' : 'Post'}</Button>
        </div>
      </div>
      {state?.error ? <p role="alert" className="flex items-center gap-1.5 text-xs text-loss-500"><AlertCircle className="h-3.5 w-3.5" /> {state.error}</p> : null}
    </form>
  );
}
