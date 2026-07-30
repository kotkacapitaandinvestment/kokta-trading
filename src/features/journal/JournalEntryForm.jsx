import { useState } from 'react';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const emotions = ['Calm', 'Confident', 'Anxious', 'Frustrated', 'Fearful', 'Greedy', 'Satisfied'];
const sessions = ['Tokyo', 'London', 'New York', 'Sydney'];
const markets = ['EUR/USD', 'GBP/USD', 'GBP/JPY', 'XAU/USD', 'US30', 'NAS100', 'BTC/USD', 'Other'];

const blank = {
  positionStatus: 'closed',
  date: new Date().toISOString().slice(0, 10),
  market: 'EUR/USD',
  session: 'London',
  strategy: '',
  direction: 'Long',
  entry: '',
  stopLoss: '',
  takeProfit: '',
  risk: '1',
  result: 'win',
  pnl: '',
  emotionBefore: 'Calm',
  emotionAfter: 'Calm',
  confidence: 7,
  mistakes: '',
  lessons: '',
  checklistComplete: false,
};

export default function JournalEntryForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState(blank);
  const isOpen = form.positionStatus === 'open';

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsed = {
      ...form,
      entry: parseFloat(form.entry) || 0,
      stopLoss: parseFloat(form.stopLoss) || 0,
      takeProfit: parseFloat(form.takeProfit) || 0,
      risk: parseFloat(form.risk) || 0,
      pnl: parseFloat(form.pnl) || 0,
      confidence: Number(form.confidence),
    };
    onSubmit(parsed);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">Position status</span>
        <div className="flex gap-2">
          {['open', 'closed'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set('positionStatus')(s)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                form.positionStatus === s
                  ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {isOpen ? (
          <p className="mt-1.5 text-xs text-ink-400">You'll add the result and P&L later when you close this position.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input name="date" label="Date" type="date" value={form.date} onChange={set('date')} required />
        <Select name="market" label="Market" value={form.market} onChange={set('market')}>
          {markets.map((m) => <option key={m}>{m}</option>)}
        </Select>
        <Select name="session" label="Session" value={form.session} onChange={set('session')}>
          {sessions.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select name="direction" label="Direction" value={form.direction} onChange={set('direction')}>
          <option>Long</option>
          <option>Short</option>
        </Select>
      </div>

      <Input name="strategy" label="Strategy" placeholder="e.g. Liquidity Sweep + FVG" value={form.strategy} onChange={set('strategy')} required />

      <div className="grid grid-cols-3 gap-4">
        <Input name="entry" label="Entry" type="number" step="any" value={form.entry} onChange={set('entry')} required />
        <Input name="stopLoss" label="Stop Loss" type="number" step="any" value={form.stopLoss} onChange={set('stopLoss')} required />
        <Input name="takeProfit" label="Take Profit" type="number" step="any" value={form.takeProfit} onChange={set('takeProfit')} required />
      </div>

      <Input name="risk" label="Risk (%)" type="number" step="any" value={form.risk} onChange={set('risk')} />

      {!isOpen ? (
        <div className="grid grid-cols-2 gap-4">
          <Select name="result" label="Result" value={form.result} onChange={set('result')}>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </Select>
          <Input name="pnl" label="P&L ($)" type="number" step="any" value={form.pnl} onChange={set('pnl')} />
        </div>
      ) : null}

      <div className={isOpen ? '' : 'grid grid-cols-2 gap-4'}>
        <Select name="emotionBefore" label="Emotion before trade" value={form.emotionBefore} onChange={set('emotionBefore')}>
          {emotions.map((e) => <option key={e}>{e}</option>)}
        </Select>
        {!isOpen ? (
          <Select name="emotionAfter" label="Emotion after trade" value={form.emotionAfter} onChange={set('emotionAfter')}>
            {emotions.map((e) => <option key={e}>{e}</option>)}
          </Select>
        ) : null}
      </div>

      <div>
        <label htmlFor="confidence" className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">
          Confidence ({form.confidence}/10)
        </label>
        <input
          id="confidence"
          name="confidence"
          type="range"
          min="1"
          max="10"
          value={form.confidence}
          onChange={(e) => set('confidence')(Number(e.target.value))}
          className="w-full accent-ink-900"
        />
      </div>

      {!isOpen ? (
        <>
          <Input name="mistakes" label="Mistakes" placeholder="What did you do wrong, if anything?" value={form.mistakes} onChange={set('mistakes')} />
          <Input name="lessons" label="Lessons" placeholder="What will you do differently next time?" value={form.lessons} onChange={set('lessons')} />
        </>
      ) : null}

      <label htmlFor="checklistComplete" className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
        <input id="checklistComplete" name="checklistComplete" type="checkbox" checked={form.checklistComplete} onChange={set('checklistComplete')} className="h-4 w-4 rounded accent-ink-900" />
        Pre-trade checklist was completed for this trade
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{isOpen ? 'Log open position' : 'Save entry'}</Button>
      </div>
    </form>
  );
}
