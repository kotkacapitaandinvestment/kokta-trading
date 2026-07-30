import { ComposedChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { MARGIN, Y_AXIS_WIDTH, formatTime } from './theme';
import CrosshairOverlay from './CrosshairOverlay';

export default function VolumePane({ data, height, palette, syncId, crosshairEnabled, hover, onMouseMove, onMouseLeave }) {
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={MARGIN} syncId={syncId} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
          <XAxis
            dataKey="x"
            tickFormatter={(i) => formatTime(data.find((d) => d.x === i)?.t)}
            tick={{ fontSize: 10, fill: palette.axisText }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            width={Y_AXIS_WIDTH}
            tick={{ fontSize: 10, fill: palette.axisText }}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v)}
          />
          <Tooltip content={() => null} cursor={false} />
          <Bar dataKey="v" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.x} fill={d.isUp ? palette.volUp : palette.volDown} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      {crosshairEnabled ? <CrosshairOverlay hover={hover} width="100%" height={height} showHorizontal={false} palette={palette} /> : null}
    </div>
  );
}
