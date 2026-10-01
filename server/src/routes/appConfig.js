import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { loadAppSettings, publicAppConfig } from '../lib/appSettings.js';
import { loadGameSettings } from '../lib/game/config.js';
import { PAIRS } from '../lib/game/pairs.js';
import { INSTRUMENTS } from '../lib/instruments.js';

// Public, unauthenticated: switches the landing page, sign-up form and app
// shell need before anyone signs in.
export const appConfigRouter = Router();

appConfigRouter.get('/config', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json(publicAppConfig(await loadAppSettings()));
}));

// The Trading Game's money rules as they are right now, for the public help
// centre (so it never quotes an out-of-date fee or minimum).
appConfigRouter.get('/game-rules', asyncHandler(async (req, res) => {
  const s = await loadGameSettings();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    feeBps: s.feeBps,
    minStakeKobo: s.minStakeKobo,
    maxStakeKobo: s.maxStakeKobo,
    dailyStakeLimitKobo: s.dailyStakeLimitKobo,
    minDepositKobo: s.minDepositKobo,
    minWithdrawalKobo: s.minWithdrawalKobo,
    withdrawalApproval: s.withdrawalApproval,
    noTradeRefund: s.noTradeRefund !== false,
    startingCapital: s.startingCapital,
  });
}));


// Facts for the landing page, read from the same places the app uses: how the
// next Trading Arena match will be scored, Kotka's practice markets, and the
// Community market rooms. Nothing here is written for marketing.
appConfigRouter.get('/showcase', asyncHandler(async (req, res) => {
  const s = await loadGameSettings();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    scoring: Object.entries(s.weights).map(([key, weight]) => ({ key, weight })),
    pairs: PAIRS.map((p) => ({ symbol: p.symbol, category: p.category })),
    rooms: INSTRUMENTS.map((i) => ({ symbol: i.display, market: i.market })),
  });
}));
