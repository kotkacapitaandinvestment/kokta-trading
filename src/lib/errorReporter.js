// Sends errors that happen in people's browsers to Kotka's own error
// tracking (no third-party service). The server strips anything personal;
// this side also drops query strings and reports the same error at most
// once a minute, and never more than 20 in a visit.

const RELEASE = typeof __KOTKA_RELEASE__ !== 'undefined' ? __KOTKA_RELEASE__ : 'dev';
const seen = new Map();
let sent = 0;
let queue = [];
let timer = null;

function browser() {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  return `${name} on ${os}`;
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({
    errors: queue.splice(0, 5),
    sample: { browser: browser(), screen: `${window.innerWidth}x${window.innerHeight}`, standalone: window.matchMedia?.('(display-mode: standalone)').matches === true },
  });
  try {
    fetch('/api/telemetry/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'include', keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never cause another error.
  }
}

export function reportError(error, { kind = 'error' } = {}) {
  try {
    const message = String(error?.message ?? error ?? 'Unknown error').slice(0, 500);
    // Noise from browser extensions and cancelled requests, not Kotka's code.
    if (/ResizeObserver loop|Script error\.?$|AbortError|The user aborted a request|chrome-extension:|moz-extension:/i.test(message)) return;
    const key = `${kind}:${message}`;
    const last = seen.get(key);
    if (last && Date.now() - last < 60e3) return;
    seen.set(key, Date.now());
    if (sent >= 20) return;
    sent += 1;
    queue.push({ message: `${kind === 'error' ? '' : `${kind}: `}${message}`, stack: String(error?.stack ?? '').slice(0, 6000), path: window.location.pathname, release: RELEASE });
    if (!timer) timer = setTimeout(flush, 1000);
  } catch {
    // ignore
  }
}

export function startErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { kind: 'unhandled promise' }));
  window.addEventListener('pagehide', flush);
}
