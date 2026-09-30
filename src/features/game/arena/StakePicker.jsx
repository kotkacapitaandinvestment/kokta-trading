// Stake: the usual amounts, or your own within the rules.
import { useState } from 'react';
import clsx from 'clsx';
import { naira, stakeOptions, stakeProblem } from '../format';

const chip = (on) =>
  clsx(
    'h-9 rounded-lg border px-3 text-sm tabular-nums transition-colors',
    on ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900' : 'border-ink-200 text-ink-700 hover:border-ink-400 dark:border-ink-700 dark:text-ink-200',
  );

export default function StakePicker({ rules, value, onChange, available }) {
  const options = stakeOptions(rules);
  const [custom, setCustom] = useState(!options.includes(value));
  const [text, setText] = useState(options.includes(value) ? '' : String(value / 100));
  const typed = Math.round(Number(text) * 100);
  const problem = custom ? stakeProblem(typed, rules) : null;
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Stake">
        {options.map((k) => (
          <button key={k} type="button" onClick={() => { setCustom(false); onChange(k); }} aria-pressed={!custom && value === k} className={chip(!custom && value === k)}>
            {naira(k)}
          </button>
        ))}
        <button type="button" onClick={() => setCustom(true)} aria-pressed={custom} className={chip(custom)}>Custom</button>
      </div>
      {custom ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-ink-500">₦</span>
          <input
            autoFocus
            inputMode="numeric"
            value={text}
            aria-label="Custom stake in naira"
            placeholder={String(rules.minStakeKobo / 100)}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, '');
              setText(v);
              const k = Math.round(Number(v) * 100);
              if (!stakeProblem(k, rules)) onChange(k);
            }}
            className="h-9 w-32 rounded-lg border border-ink-200 bg-white px-2.5 text-sm tabular-nums outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
          />
          <span className="text-xs text-ink-400">{naira(rules.minStakeKobo)} to {naira(rules.maxStakeKobo)}, in steps of {naira(rules.stakeStepKobo)}</span>
        </div>
      ) : null}
      {problem && text ? <p className="mt-1.5 text-xs text-loss-500">{problem}</p> : available != null ? <p className={clsx('mt-1.5 text-xs', value > available ? 'text-loss-500' : 'text-ink-400')}>{value > available ? `You have ${naira(available)} available. Add money to your wallet first.` : `Available: ${naira(available)}`}</p> : null}
    </div>
  );
}

export function stakeReady(value, rules) {
  return !stakeProblem(value, rules);
}
