import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { loadAppSettings, publicAppConfig } from '../lib/appSettings.js';

// Public, unauthenticated: switches the landing page, sign-up form and app
// shell need before anyone signs in.
export const appConfigRouter = Router();

appConfigRouter.get('/config', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json(publicAppConfig(await loadAppSettings()));
}));

