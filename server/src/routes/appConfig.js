import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { loadAppSettings, publicAppConfig } from '../lib/appSettings.js';
import { loadGameSettings } from '../lib/game/config.js';

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

