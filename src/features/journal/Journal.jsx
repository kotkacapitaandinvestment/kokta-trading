import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Hint from '../../components/ui/Hint';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { NotebookPen } from 'lucide-react';
import JournalEntryForm from './JournalEntryForm';
import ClosePositionForm from './ClosePositionForm';
import { api } from '../../lib/api';

const resultTone = { win: 'profit', loss: 'loss', breakeven: 'neutral' };

// Kotka AI's review is generated on request and saved with the entry.
function AiReview({ entry, onReviewed }) {
  const [state, setState] = useState(null);

  const run = async () => {
    setState({ loading: true });
    try {
      const { entry: updated } = await api.post(`/journal/${entry.id}/review`, {});
      onReviewed(updated);
      setState(null);
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <Card className="border-accent-100 bg-accent-50/50 p-4 dark:border-accent-900/30 dark:bg-accent-900/10">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-400">
          <Sparkles className="h-3.5 w-3.5" /> Kotka AI review
        </span>
        {entry.aiReviewAt ? <span className="text-[11px] text-ink-400">{new Date(entry.aiReviewAt).toLocaleDateString()}</span> : null}
      </div>
      {entry.aiReview ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700 dark:text-ink-200">{entry.aiReview.replace(/\s*—\s*/g, ', ')}</p>
      ) : (
        <p className="text-sm text-ink-500 dark:text-ink-400">Ask Kotka AI to review the process behind this trade, in the context of your recent record. It won't comment on direction or give signals.</p>
      )}
      {state?.error ? <p role="alert" className="mt-2 text-xs text-loss-500">{state.error}</p> : null}
      <Button size="sm" variant={entry.aiReview ? 'ghost' : 'secondary'} className="mt-3" icon={Sparkles} disabled={state?.loading} onClick={run}>
        {state?.loading ? 'Reviewing…' : entry.aiReview ? 'Review again' : 'Review this trade'}
      </Button>
    </Card>
  );
}

export default function Journal() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [closing, setClosing] = useState(null);

  useEffect(() => {
    api
      .get('/journal')
      .then(({ entries }) => setEntries(entries))
      .catch(() => setLoadError('We couldn’t load your journal. Refresh the page to try again.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => `${e.market} ${e.strategy} ${e.session}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, search],
  );

  const handleSave = async (entry) => {
    const { entry: saved } = await api.post('/journal', entry);
    setEntries((prev) => [saved, ...prev]);
    setShowForm(false);
  };

  const handleClose = async (data) => {
    const { entry: updated } = await api.patch(`/journal/${closing.id}/close`, data);
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setClosing(null);
  };

  const handleRowClick = (entry) => {
    if (entry.positionStatus === 'open') setClosing(entry);
    else setDetail(entry);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Journal"
        title="Trading Journal"
        description="Every trade, every emotion and every lesson, in one disciplined record."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            Log a trade
          </Button>
        }
      />

      <Hint id="journal-emotion" className="mb-4 max-w-2xl">Set the emotion before you enter, while it's honest. Analytics breaks your results down by it.</Hint>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by market, strategy, session…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : loadError ? (
        <p role="alert" className="rounded-xl border border-loss-500/30 bg-loss-50 px-4 py-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">{loadError}</p>
      ) : filtered.length === 0 && entries.length ? (
        <EmptyState icon={NotebookPen} title={`No trades match “${search}”`} description="Try a market, strategy or session name." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No trades logged yet"
          description="Log your first trade to start building your performance history."
          action={<Button onClick={() => setShowForm(true)}>Log a trade</Button>}
        />
      ) : (
        <Card className="overflow-x-auto" tabIndex={0} role="region" aria-label="Your trades (scroll sideways on small screens)">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Market</th>
                <th className="px-5 py-3 font-medium">Strategy</th>
                <th className="px-5 py-3 font-medium">Direction</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Checklist</th>
                <th className="px-5 py-3 text-right font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => handleRowClick(e)}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                >
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400">{e.date}</td>
                  <td className="px-5 py-3 font-medium text-ink-800 dark:text-ink-100">{e.market}</td>
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400">{e.strategy}</td>
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400">{e.direction}</td>
                  <td className="px-5 py-3">
                    {e.positionStatus === 'open' ? (
                      <Badge tone="accent">Open</Badge>
                    ) : (
                      <Badge tone={resultTone[e.result]}>{{ win: 'Win', loss: 'Loss', breakeven: 'Breakeven' }[e.result] ?? e.result}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {e.checklistComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-profit-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-ink-300" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    {e.positionStatus === 'open' ? (
                      <span className="text-ink-400">-</span>
                    ) : (
                      <span className={e.pnl >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}>
                        {e.pnl >= 0 ? '+' : ''}${e.pnl}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New journal entry" width="max-w-2xl">
        <JournalEntryForm onSubmit={handleSave} onCancel={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!closing} onClose={() => setClosing(null)} title="Close position">
        {closing ? <ClosePositionForm entry={closing} onSubmit={handleClose} onCancel={() => setClosing(null)} /> : null}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.market} · ${detail.date}` : ''} width="max-w-xl">
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-ink-400">Session</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.session}</p></div>
              <div><p className="text-xs text-ink-400">Direction</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.direction}</p></div>
              <div><p className="text-xs text-ink-400">Strategy</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.strategy}</p></div>
              <div><p className="text-xs text-ink-400">Entry</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.entry}</p></div>
              <div><p className="text-xs text-ink-400">Stop Loss</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.stopLoss}</p></div>
              <div><p className="text-xs text-ink-400">Take Profit</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.takeProfit}</p></div>
              <div><p className="text-xs text-ink-400">Confidence</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.confidence}/10</p></div>
              <div><p className="text-xs text-ink-400">Emotion before</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.emotionBefore}</p></div>
              <div><p className="text-xs text-ink-400">Emotion after</p><p className="font-medium text-ink-800 dark:text-ink-100">{detail.emotionAfter}</p></div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Mistakes</p>
              <p className="text-sm text-ink-600 dark:text-ink-300">{detail.mistakes || 'None recorded'}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Lessons</p>
              <p className="text-sm text-ink-600 dark:text-ink-300">{detail.lessons || 'None recorded'}</p>
            </div>
            <AiReview
              entry={detail}
              onReviewed={(updated) => {
                setDetail(updated);
                setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
              }}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
