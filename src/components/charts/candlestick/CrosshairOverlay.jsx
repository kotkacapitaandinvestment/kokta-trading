import { formatTime } from './theme';

export default function CrosshairOverlay({ hover, width, height, showHorizontal = false, palette }) {
  if (!hover || !width || !height) return null;
  const { x, y, price, bar } = hover;

  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ width, height }}>
      <svg width={width} height={height} className="absolute left-0 top-0">
        <line x1={x} x2={x} y1={0} y2={height} stroke={palette.crosshair} strokeWidth={1} strokeDasharray="3 3" />
        {showHorizontal && y != null ? (
          <line x1={0} x2={width} y1={y} y2={y} stroke={palette.crosshair} strokeWidth={1} strokeDasharray="3 3" />
        ) : null}
      </svg>

      {showHorizontal && price != null ? (
        <div
          className="absolute right-0 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ top: y, backgroundColor: palette.crosshair }}
        >
          {price.toLocaleString(undefined, { maximumFractionDigits: 5 })}
        </div>
      ) : null}

      {bar ? (
        <div
          className="absolute -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ left: x, top: height - 16, backgroundColor: palette.crosshair }}
        >
          {formatTime(bar.t)}
        </div>
      ) : null}
    </div>
  );
}
