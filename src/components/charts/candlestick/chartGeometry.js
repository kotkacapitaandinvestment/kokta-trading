export function getPlotGeometry(containerRef, yAxisWidth, margin) {
  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const plotLeft = rect.left + yAxisWidth + margin.left;
  const plotWidth = Math.max(1, rect.width - yAxisWidth - margin.left - margin.right);
  return { rect, plotLeft, plotWidth };
}

// Fractional absolute bar index under a given clientX, given the current
// visible {start,end} window. Caller rounds if it needs an integer bar.
export function pixelXToIndex(clientX, geometry, range) {
  const ratio = (clientX - geometry.plotLeft) / geometry.plotWidth;
  const width = range.end - range.start;
  return range.start + ratio * width;
}

// Inverse of pixelXToIndex, for rendering: absolute bar index -> pixel X
// relative to the container's own left edge (usable directly as an SVG x
// coordinate inside an overlay sized to the container).
export function indexToPixelX(index, geometry, range, containerRect) {
  const width = range.end - range.start;
  const pxPerBar = geometry.plotWidth / width;
  return (geometry.plotLeft - containerRect.left) + (index - range.start) * pxPerBar;
}
