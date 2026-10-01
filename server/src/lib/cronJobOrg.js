// cron-job.org REST API client (https://docs.cron-job.org/rest-api.html).
// Kotka keeps one job that calls /api/research/cron hourly; rotating the
// cron token in the admin updates that job's Authorization header here, so
// the schedule never falls out of sync with the token.

import { prisma } from './prisma.js';
import { decryptSecret } from './crypto.js';
import { cachedSource } from './research/cache.js';

const API = 'https://api.cron-job.org';
export const CRON_PATH = '/api/research/cron';
// The uptime check behind the public status page, every 5 minutes, with the same token.
export const PROBE_PATH = '/api/status/probe';

// The JobStatus codes from the cron-job.org API docs, in plain words.
export const JOB_STATUS = {
  0: 'Hasn’t run yet',
  1: 'Worked',
  2: 'Couldn’t find Kotka’s address',
  3: 'Couldn’t reach Kotka',
  4: 'Kotka returned an error',
  5: 'Took too long',
  6: 'Kotka sent back too much data',
  7: 'The link is invalid',
  8: 'cron-job.org had a problem',
  9: 'Failed for an unknown reason',
};

// { configured, apiKey }: configured means an enabled integration row exists,
// even if its key turns out to be unusable — callers must not treat that as
// "no cron-job.org" and silently rotate the token out from under the job.
export async function getCronJobOrgKey() {
  const row = await prisma.integration.findUnique({ where: { provider: 'cronjob' } }).catch(() => null);
  if (!row?.enabled) return { configured: false, apiKey: null };
  let apiKey = null;
  try {
    apiKey = row.secretCipher ? decryptSecret(row.secretCipher).trim() || null : null;
  } catch {
    apiKey = null;
  }
  return { configured: true, apiKey };
}

async function call(apiKey, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`cron-job.org API error (${res.status})${text ? `: ${text.slice(0, 160)}` : ''}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

export async function cronJobOrgTestConnection(apiKey) {
  const data = await call(apiKey, 'GET', '/jobs');
  const kotka = (data.jobs ?? []).filter((j) => j.url.includes(CRON_PATH));
  return kotka.length ? 'Connected. Kotka’s hourly update is set up in this account.' : 'Connected. The hourly update isn’t set up yet: create it in Fundamental Research.';
}

function jobDefinition({ url, token }) {
  return {
    url,
    enabled: true,
    title: 'Kotka Trading: research refresh + AI model health',
    saveResponses: true,
    requestMethod: 0, // GET
    requestTimeout: 30,
    redirectSuccess: false,
    schedule: { timezone: 'UTC', expiresAt: 0, hours: [-1], mdays: [-1], minutes: [7], months: [-1], wdays: [-1] },
    extendedData: { headers: { Authorization: `Bearer ${token}` } },
    notification: { onFailure: true, onFailureCount: 3, onSuccess: true, onDisable: true, onSslCertExpiry: false },
  };
}

// Points the Kotka job at a new token. An existing job only gets its header
// patched (its URL is left alone, so rotating from a dev machine can't
// repoint production's schedule at localhost). A missing job is recreated
// against `url`, which must be a public https address.
export async function syncCronJob({ apiKey, jobId, url, token }) {
  const r = await syncMainJob({ apiKey, jobId, url, token });
  // The uptime check uses the same token: keep it in step (best effort).
  const jobs = (await call(apiKey, 'GET', '/jobs').catch(() => ({ jobs: [] }))).jobs ?? [];
  for (const j of jobs.filter((x) => x.url.includes(PROBE_PATH))) {
    await call(apiKey, 'PATCH', `/jobs/${j.jobId}`, { job: { extendedData: { headers: { Authorization: `Bearer ${token}` } } } }).catch((err) => console.error('Uptime check token update failed:', err.message));
  }
  return r;
}

async function syncMainJob({ apiKey, jobId, url, token }) {
  if (jobId) {
    try {
      await call(apiKey, 'PATCH', `/jobs/${jobId}`, { job: { enabled: true, extendedData: { headers: { Authorization: `Bearer ${token}` } } } });
      return { jobId, created: false };
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  const existing = (await call(apiKey, 'GET', '/jobs')).jobs?.find((j) => j.url.includes(CRON_PATH));
  if (existing) {
    await call(apiKey, 'PATCH', `/jobs/${existing.jobId}`, { job: { enabled: true, extendedData: { headers: { Authorization: `Bearer ${token}` } } } });
    return { jobId: existing.jobId, created: false };
  }
  if (!url || !/^https:\/\//.test(url) || /localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Do this from the live Kotka site, not a test copy, so cron-job.org gets the right address.');
  }
  const created = await call(apiKey, 'PUT', '/jobs', { job: jobDefinition({ url, token }) });
  return { jobId: created.jobId, created: true };
}

export async function getCronJobStatus(apiKey, jobId) {
  const { jobDetails: d } = await call(apiKey, 'GET', `/jobs/${jobId}`);
  const at = (s) => (s ? new Date(s * 1000).toISOString() : null);
  return {
    jobId: d.jobId,
    enabled: d.enabled,
    url: d.url,
    lastStatus: JOB_STATUS[d.lastStatus] ?? 'Unknown result',
    lastStatusCode: d.lastStatus,
    lastStatusOk: d.lastStatus === 1,
    lastExecution: at(d.lastExecution),
    lastDurationMs: d.lastDuration ?? null,
    nextExecution: at(d.nextExecution),
  };
}

// Status of the Kotka job for admin views; cached 15 minutes (cron-job.org
// rate-limits its API).
export async function cronJobView(settings, { fresh = false } = {}) {
  const { configured, apiKey } = await getCronJobOrgKey();
  if (!configured) return { managed: false };
  if (!apiKey) return { managed: true, jobId: settings.cron?.jobId ?? null, error: 'Kotka couldn’t use the cron-job.org key in Connected services. Check it there.' };
  if (!settings.cron?.jobId) return { managed: true, jobId: null };
  try {
    const { data } = await cachedSource(`cronjob:status:${settings.cron.jobId}`, 15 * 60 * 1000, () => getCronJobStatus(apiKey, settings.cron.jobId), { bypass: fresh });
    return { managed: true, jobId: settings.cron.jobId, status: data };
  } catch (err) {
    return { managed: true, jobId: settings.cron.jobId, error: err.message };
  }
}
