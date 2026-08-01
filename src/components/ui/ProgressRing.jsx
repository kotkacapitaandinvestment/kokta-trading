import { CHART_COLORS } from '../../lib/chartColors';

export default function ProgressRing({ value = 0, size = 96, strokeWidth = 8, label, sublabel, color = CHART_COLORS.accent }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-ink-100 dark:stroke-ink-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-ink-900 dark:text-ink-50">{label ?? `${value}`}</span>
        {sublabel ? <span className="text-[10px] uppercase tracking-wide text-ink-400">{sublabel}</span> : null}
      </div>
    </div>
  );
}
