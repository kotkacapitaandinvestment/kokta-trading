import { useState } from 'react';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const emotions = ['Calm', 'Confident', 'Anxious', 'Frustrated', 'Fearful', 'Greedy', 'Satisfied'];

export default function ClosePositionForm({ entry, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    result: 'win',
    pnl: '',
    reward: '',
    emotionAfter: 'Calm',
    mistakes: '',
    lessons: '',
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      pnl: parseFloat(form.pnl) || 0,
      reward: parseFloat(form.reward) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Closing {entry.direction} {entry.market} entered at {entry.entry} on {entry.date}.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Select name="result" label="Result" value={form.result} onChange={set('result')}>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="breakeven">Breakeven</option>
        </Select>
        <Input name="pnl" label="P&L ($)" type="number" step="any" value={form.pnl} onChange={set('pnl')} required />
      </div>

      <Input name="reward" label="Reward (R multiple)" type="number" step="any" placeholder="e.g. 2.5" value={form.reward} onChange={set('reward')} />

      <Select name="emotionAfter" label="Emotion after trade" value={form.emotionAfter} onChange={set('emotionAfter')}>
        {emotions.map((e) => <option key={e}>{e}</option>)}
      </Select>

      <Input name="mistakes" label="Mistakes" placeholder="What did you do wrong, if anything?" value={form.mistakes} onChange={set('mistakes')} />
      <Input name="lessons" label="Lessons" placeholder="What will you do differently next time?" value={form.lessons} onChange={set('lessons')} />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Close position</Button>
      </div>
    </form>
  );
}
