import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMarketPulse, getOfficialCalendar } from '../lib/marketPulse.js';
import { metered, free } from '../lib/usage/index.js';

export const marketDataRouter = Router();
marketDataRouter.use(requireAuth);

// Each fresh load is one Market Intelligence view. The data is end-of-day
// and cached, so reloading the same view within 15 minutes counts once.
marketDataRouter.get('/pulse', metered('market_intelligence', 'market_pulse', async () => {
  const pulse = await getMarketPulse();
  // Without a price source set up nothing is loaded, so nothing is charged.
  return pulse.configured ? pulse : free(pulse);
}, { view: () => 'all' }));

const calendarDays = (req) => Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 45);

marketDataRouter.get('/calendar', metered('market_intelligence', 'economic_calendar', (req) => getOfficialCalendar({ days: calendarDays(req) }), { view: (req) => `days=${calendarDays(req)}` }));
