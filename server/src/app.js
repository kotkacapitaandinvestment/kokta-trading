import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { journalRouter } from './routes/journal.js';
import { checklistRouter } from './routes/checklist.js';
import { settingsRouter } from './routes/settings.js';
import { adminIntegrationsRouter } from './routes/adminIntegrations.js';
import { adminUsersRouter } from './routes/adminUsers.js';
import { adminStatsRouter } from './routes/adminStats.js';
import { aiRouter } from './routes/ai.js';
import { meStatsRouter } from './routes/meStats.js';
import { marketDataRouter } from './routes/marketData.js';
import { researchRouter } from './routes/research.js';
import { adminResearchRouter } from './routes/adminResearch.js';
import { kycRouter } from './routes/kyc.js';
import { adminKycRouter } from './routes/adminKyc.js';
import { adminPlatformRouter } from './routes/adminPlatform.js';
import { appConfigRouter } from './routes/appConfig.js';
import { accountRouter } from './routes/account.js';
import { adminAnnouncementsRouter } from './routes/adminAnnouncements.js';
import { communityRouter } from './routes/community/index.js';
import { realtimeRouter } from './routes/realtime.js';
import { mediaRouter } from './routes/media.js';
import { adminCommunityRouter } from './routes/adminCommunity.js';
import { pushRouter } from './routes/push.js';
import { goalsRouter } from './routes/goals.js';
import { publicAchievementsRouter, achievementPage } from './routes/publicAchievements.js';
import { usageRouter } from './routes/usage.js';
import { adminUsageRouter } from './routes/adminUsage.js';
import { gameRouter, gameWebhookRouter } from './routes/game.js';
import { adminGameRouter } from './routes/adminGame.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { securityHeaders, sameOriginWrites } from './middleware/security.js';
import { isAllowedOrigin } from './lib/origins.js';
import { memoryLimit } from './lib/rateLimit.js';

export const app = express();
app.disable('x-powered-by');
// Vercel sets X-Forwarded-Proto/Host at its edge (and overwrites any a client sends).
app.set('trust proxy', true);

app.use('/api', securityHeaders);
// Only Kotka's own sites may call the API with credentials; never reflect any origin.
app.use(cors({ origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)), credentials: true }));
// Payment webhooks are verified against the exact bytes sent, so they get
// the raw body (and no JSON parsing) before anything else.
app.use('/api/game/webhooks', express.raw({ type: () => true, limit: '1mb' }));
// Bodies stay small, except the three routes that carry an image as base64.
const big = express.json({ limit: '6mb' });
app.use('/api/media', big);
app.use('/api/goals/shares', big);
app.use(/^\/api\/ai\/conversations\/[^/]+\/messages$/, big);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', sameOriginWrites);

const requireAdmin = [requireAuth, requireRole('admin', 'super_admin')];

app.get('/api/health', (req, res) => res.json({ ok: true }));
// Signed-out routes get a per-IP ceiling on top of their own checks.
app.use('/api/auth', memoryLimit('auth', 40, 60e3), authRouter);
app.use('/api/app', memoryLimit('app', 120, 60e3), appConfigRouter);
app.use('/api/account', accountRouter);
app.use('/api/kyc', kycRouter);
app.use('/api/community', communityRouter);
app.use('/api/realtime', realtimeRouter);
app.use('/api/media', mediaRouter);
app.use('/api/push', pushRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/public', memoryLimit('public', 120, 60e3), publicAchievementsRouter);
// Public achievement pages with link-preview tags (see vercel.json rewrite).
app.get('/achievement/:slug', memoryLimit('publicPage', 120, 60e3), achievementPage);
app.use('/api/journal', journalRouter);
app.use('/api/checklist', checklistRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/integrations', adminIntegrationsRouter);
app.use('/api/admin/users', requireAdmin, adminUsersRouter);
app.use('/api/admin/announcements', requireAdmin, adminAnnouncementsRouter);
app.use('/api/admin/stats', requireAdmin, adminStatsRouter);
app.use('/api/admin/kyc', requireAdmin, adminKycRouter);
app.use('/api/admin/platform', requireAdmin, adminPlatformRouter);
app.use('/api/admin/usage', requireAdmin, adminUsageRouter);
app.use('/api/usage', usageRouter);
app.use('/api/game/webhooks', gameWebhookRouter);
app.use('/api/game', gameRouter);
app.use('/api/admin/game', requireAdmin, adminGameRouter);
app.use('/api/ai', aiRouter);
app.use('/api/me', meStatsRouter);
app.use('/api/market', marketDataRouter);
app.use('/api/research', researchRouter);
app.use('/api/admin/research', adminResearchRouter);
app.use('/api/admin/community', adminCommunityRouter);

app.use((err, req, res, next) => {
  // Body-parser errors: too large, or not valid JSON.
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That’s too large to send. Try a smaller file.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'That request wasn’t understood. Please try again.' });
  // Errors marked `expose` carry a message written for people (and a status).
  // (Game and payment errors marked `expose` may be 502/503: still written for people.)
  if (err?.expose && typeof err.message === 'string') return res.status(err.status ?? 400).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
