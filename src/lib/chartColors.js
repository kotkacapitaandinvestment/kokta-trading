// JS-side mirror of the Tailwind palette (tailwind.config.js) for Recharts,
// which renders via inline SVG props (stroke/fill/tick.fill) that can't
// consume Tailwind classes. Keep in sync with tailwind.config.js's ink/
// accent/profit/loss scales.
export const CHART_COLORS = {
  accent: '#D1A85B', // Primary Gold
  accentLight: '#F4D48E', // Highlight Gold
  accentBronze: '#B58637', // Supporting Gold
  accentDeep: '#936E33', // Bronze
  profit: '#3D9970',
  loss: '#C24A3F',
  grid: { light: '#EDE8DD', dark: '#262320' },
  tick: { light: '#948A7D', dark: '#B8AE9F' },
};

// Fundamental Research trend series. Validated with the dataviz palette
// validator against Kotka's card surfaces (#FFFFFF light / #0C0C0E dark):
// all checks pass (CVD ΔE 25.5+, normal-vision ΔE 27+, ≥3:1 contrast).
export const RESEARCH_SERIES = {
  base: { light: '#B58637', dark: '#B58637' },
  quote: { light: '#2a78d6', dark: '#3987e5' },
};
