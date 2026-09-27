// The eight pre-trade conditions. Shared by the Checklist page and the
// interactive preview on the landing page.
export const CHECKLIST_ITEMS = [
  { id: 'trend', label: 'Trend confirmed?', hint: 'Higher timeframe bias matches your intended direction.' },
  { id: 'liquidity', label: 'Liquidity identified?', hint: 'You know where other traders’ stops are likely sitting, and whether price is heading for them.' },
  { id: 'entry', label: 'Entry model valid?', hint: 'This is a setup you’ve tested and written down, not a guess.' },
  { id: 'risk', label: 'Risk acceptable?', hint: 'Position risk is within your per-trade risk policy.' },
  { id: 'dailyLimit', label: 'Daily loss limit respected?', hint: "Taking this trade won't push you past today's loss limit." },
  { id: 'emotional', label: 'Emotional state stable?', hint: 'No revenge trading, fatigue, or overconfidence driving this decision.' },
  { id: 'news', label: 'News checked?', hint: 'No high-impact release imminent that invalidates the setup.' },
  { id: 'sizing', label: 'Position size calculated?', hint: 'Lot size derived from stop distance and account risk, not guesswork.' },
];
