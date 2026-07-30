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
import { simulatorRouter } from './routes/simulator.js';
import { meStatsRouter } from './routes/meStats.js';
import { marketDataRouter } from './routes/marketData.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { createCrudRouter } from './lib/crudRouter.js';
import { prisma } from './lib/prisma.js';

export const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const requireAdmin = [requireAuth, requireRole('admin', 'super_admin')];

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/journal', journalRouter);
app.use('/api/checklist', checklistRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/integrations', adminIntegrationsRouter);
app.use('/api/admin/users', requireAdmin, adminUsersRouter);
app.use('/api/admin/content', requireAdmin, createCrudRouter(prisma.contentItem));
app.use('/api/admin/courses', requireAdmin, createCrudRouter(prisma.course));
app.use('/api/admin/announcements', requireAdmin, createCrudRouter(prisma.announcement));
app.use('/api/admin/market-news', requireAdmin, createCrudRouter(prisma.marketNewsItem, { orderBy: { publishedAt: 'desc' } }));
app.use('/api/admin/stats', requireAdmin, adminStatsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/simulator', simulatorRouter);
app.use('/api/me', meStatsRouter);
app.use('/api/market', marketDataRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
