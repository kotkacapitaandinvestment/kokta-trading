import clsx from 'clsx';
import { MousePointer2, TrendingUp, Minus, Waves, Ruler, Trash2 } from 'lucide-react';

const TOOLS = [
  { id: 'cursor', label: 'Select', icon: MousePointer2 },
  { id: 'trendline', label: 'Trendline', icon: TrendingUp },
  { id: 'ray', label: 'Horizontal ray', icon: Minus },
  { id: 'fib', label: 'Fibonacci retracement', icon: Waves },
  { id: 'measure', label: 'Measure', icon: Ruler },
];

export default function DrawingToolbar({ activeTool, onSelectTool, onClearAll, hasDrawings, palette }) {
  const isTerminal = !!palette.bg;
  return (
    <div
      className={clsx(
        'mb-2 flex items-center gap-1 rounded-lg p-1',
        isTerminal ? 'bg-[#161b26]' : 'bg-ink-50 dark:bg-ink-800',
      )}
    >
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const active = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            onClick={() => onSelectTool(tool.id)}
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              active
                ? 'bg-accent-500 text-white'
                : isTerminal
                  ? 'text-[#8b93a7] hover:bg-[#1e2530] hover:text-white'
                  : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-700',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        );
      })}
      <div className={clsx('mx-1 h-5 w-px', isTerminal ? 'bg-[#2a2e39]' : 'bg-ink-200 dark:bg-ink-700')} />
      <button
        type="button"
        title="Clear all drawings"
        aria-label="Clear all drawings"
        onClick={onClearAll}
        disabled={!hasDrawings}
        className={clsx(
          'flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          isTerminal ? 'text-[#8b93a7] hover:bg-[#1e2530] hover:text-loss-400' : 'text-ink-500 hover:bg-ink-100 hover:text-loss-500 dark:text-ink-400 dark:hover:bg-ink-700',
        )}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
