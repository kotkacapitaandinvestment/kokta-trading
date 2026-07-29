function colorFor(value) {
  if (value === null) return 'bg-ink-50 dark:bg-ink-800/40';
  if (value > 0) return value > 300 ? 'bg-profit-500' : value > 100 ? 'bg-profit-400' : 'bg-profit-50 dark:bg-profit-500/20';
  if (value < 0) return value < -300 ? 'bg-loss-500' : value < -100 ? 'bg-loss-400' : 'bg-loss-50 dark:bg-loss-500/20';
  return 'bg-ink-100 dark:bg-ink-800';
}

export default function PerformanceHeatmap({ days = 35 }) {
  const cells = Array.from({ length: days }, (_, i) => {
    const seeded = Math.sin(i * 12.9898) * 43758.5453;
    const frac = seeded - Math.floor(seeded);
    if (frac < 0.25) return null;
    return Math.round((frac - 0.5) * 900);
  });

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {cells.map((v, i) => (
        <div
          key={i}
          title={v === null ? 'No trades' : `$${v}`}
          className={`aspect-square rounded-md ${colorFor(v)}`}
        />
      ))}
    </div>
  );
}
