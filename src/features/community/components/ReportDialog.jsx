import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { api } from '../../../lib/api';

const CATEGORIES = [
  ['scam', 'Scam or fake investment offer'],
  ['fraud', 'Financial fraud or payment request'],
  ['manipulation', 'Market manipulation or pump scheme'],
  ['impersonation', 'Impersonating Kotka or someone else'],
  ['spam', 'Spam or signal-selling'],
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate speech'],
  ['illegal', 'Illegal activity'],
  ['other', 'Something else'],
];

export default function ReportDialog({ target, onClose }) {
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState(null);
  if (!target) return null;
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      const r = await api.post('/community/reports', { targetType: target.type, targetId: target.id, category, details });
      setState({ done: r.message });
    } catch (err) {
      setState({ error: err.message });
    }
  };
  return (
    <Modal open onClose={onClose} title={target.type === 'user' ? `Report ${target.label}` : `Report this ${target.label ?? target.type}`}>
      {state?.done ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-600 dark:text-ink-300">{state.done}</p>
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="mb-2 text-sm font-medium text-ink-700 dark:text-ink-200">What's wrong?</legend>
            {CATEGORIES.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800">
                <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} className="accent-accent-600" />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">Details (optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
          </label>
          {state?.error ? <p role="alert" className="text-sm text-loss-500">{state.error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!category || state?.busy}>Send report</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
