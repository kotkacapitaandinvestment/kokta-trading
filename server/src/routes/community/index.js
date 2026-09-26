import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { loadMe } from './context.js';
import { profilesRouter } from './profiles.js';
import { socialRouter } from './social.js';
import { conversationsRouter } from './conversations.js';
import { postsRouter } from './posts.js';
import { marketsRouter } from './markets.js';
import { discoveryRouter } from './discovery.js';
import { notificationsRouter } from './notifications.js';
import { reportsRouter } from './reports.js';
import { searchRouter } from './search.js';
import { aiRouter } from './ai.js';

export const communityRouter = Router();
communityRouter.use(requireAuth, loadMe);
for (const r of [profilesRouter, socialRouter, conversationsRouter, postsRouter, marketsRouter, discoveryRouter, notificationsRouter, reportsRouter, searchRouter, aiRouter]) communityRouter.use(r);
