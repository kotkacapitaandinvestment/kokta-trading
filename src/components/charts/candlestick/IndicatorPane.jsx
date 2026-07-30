import { ComposedChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import { MARGIN, Y_AXIS_WIDTH, formatTime } from './theme';
import CrosshairOverlay from './CrosshairOverlay';

export default function IndicatorPane({ data, height, palette, syncId, dataKey, color, crosshairEnabled, hover, onMouseMove, onMouseLeave }) {
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
          <YAxis domain={[0, 100]} width={Y_AXIS_WIDTH} tick={{ fontSize: 10, fill: palette.axisText }} ticks={[30, 50, 70]} />
          <Tooltip content={() => null} cursor={false} />
          <ReferenceLine y={70} stroke={palette.down} strokeDasharray="2 2" />
          <ReferenceLine y={30} stroke={palette.up} strokeDasharray="2 2" />
          <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {crosshairEnabled ? <CrosshairOverlay hover={hover} width="100%" height={height} showHorizontal={false} palette={palette} /> : null}
    </div>
  );
}
