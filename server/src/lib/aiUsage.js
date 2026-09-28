// Kotka AI helpers shared by chat, journal reviews and Community actions.
// Usage accounting for all of them lives in lib/usage/.

import { prisma } from './prisma.js';

const TONES = {
  'Direct & challenging': 'Be direct and challenging: name weak reasoning plainly and push back hard on bias.',
  'Supportive & measured': 'Be supportive and measured: still challenge weak reasoning, but in a calm, encouraging way.',
  'Purely analytical': 'Be purely analytical: stick to structure, probability and risk, with minimal commentary on psychology unless asked.',
};

export async function tonePreference(userId) {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { aiPreferences: true } }).catch(() => null);
  return TONES[settings?.aiPreferences?.tone] ?? null;
}
