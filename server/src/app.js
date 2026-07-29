import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { journalRouter } from './routes/journal.js';
import { checklistRouter } from './routes/checklist.js';
import { settingsRouter } from './routes/settings.js';
import { adminIntegrationsRouter } from './routes/adminIntegrations.js';
import { aiRouter } from './routes/ai.js';

export const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/journal', journalRouter);
app.use('/api/checklist', checklistRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/integrations', adminIntegrationsRouter);
app.use('/api/ai', aiRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
