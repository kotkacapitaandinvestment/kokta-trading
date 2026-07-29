import { useMemo, useState } from 'react';
import { Plus, Search, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { NotebookPen } from 'lucide-react';
import JournalEntryForm from './JournalEntryForm';
import { usePersistedState } from '../../lib/usePersistedState';
import { journalEntries as seedEntries } from '../../lib/mockData';

const resultTone = { win: 'profit', loss: 'loss', breakeven: 'neutral' };

function aiReviewFor(entry) {
  if (entry.result === 'loss') {
    return "This loss looks process-consistent if your invalidation was hit cleanly. The real question: did you size this the same as your winning trades, or did conviction creep in?";
  }
  if (!entry.checklistComplete) {
    return 'This trade worked out, but it bypassed your own checklist. Outcome bias will tell you it was fine — track whether this becomes a pattern.';
  }
  return 'Clean process: checklist complete, defined invalidation, reward-to-risk above 2. This is the trade to study when building size confidence.';
}

export default function Journal() {
  const [entries, setEntries] = usePersistedState('journal.entries', seedEntries);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => `${e.market} ${e.strategy} ${e.session}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [entries, search],
  );

  const handleSave = (entry) => {
    setEntries((prev) => [entry, ...prev]);
    setShowForm(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Journal"
        title="Trading Journal"
        description="Every trade, every emotion, every lesson — in one disciplined record."
        actions={
          <Button icon={Plus} onClick={() => setShowForm(true)}>
            New entry
          </Button>
        }
      />

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

      {filtered.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No journal entries yet"
          description="Log your first trade to start building your performance history."
          action={<Button onClick={() => setShowForm(true)}>New entry</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Market</th>
                <th className="px-5 py-3 font-medium">Strategy</th>
                <th className="px-5 py-3 font-medium">Direction</th>
                <th className="px-5 py-3 font-medium">R:R</th>
                <th className="px-5 py-3 font-medium">Checklist</th>
                <th className="px-5 py-3 text-right font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setDetail(e)}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                >
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400">{e.date}</td>
                  <td className="px-5 py-3 font-medium text-ink-800 dark:text-ink-100">{e.market}</td>
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400">{e.strategy}</td>
                  <td className="px-5 py-3 text-ink-500 dark:text-ink-400">{e.direction}</td>
                  <td className="px-5 py-3">
                    <Badge tone={resultTone[e.result]}>{e.reward ?? e.rr ?? '—'}R</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {e.checklistComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-profit-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-ink-300" />
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    <span className={e.pnl >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}>
                      {e.pnl >= 0 ? '+' : ''}${e.pnl}
                    </span>
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
            <Card className="border-accent-100 bg-accent-50/50 p-4 dark:border-accent-900/30 dark:bg-accent-900/10">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-400">
                <Sparkles className="h-3.5 w-3.5" /> Kotka AI Review
              </div>
              <p className="text-sm text-ink-700 dark:text-ink-200">{aiReviewFor(detail)}</p>
            </Card>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
