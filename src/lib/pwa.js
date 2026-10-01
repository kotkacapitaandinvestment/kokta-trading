// Installable app + Web Push on the client.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

// Where Kotka is open, for the "Get the app" steps: which phone or computer,
// which browser, and whether it's a browser inside another app (WhatsApp,
// Instagram, Facebook…), where installing isn't possible at all.
export function installContext(agent = ua) {
  const android = /Android/i.test(agent);
  const ios = isIOS || /iPhone|iPad|iPod/i.test(agent);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|Twitter|Telegram|WhatsApp|LinkedInApp|GSA\//i.test(agent) || (android && /; wv\)/.test(agent));
  const browser = inApp ? 'inapp'
    : /SamsungBrowser/i.test(agent) ? 'samsung'
      : /MiuiBrowser|XiaoMi\/Mi/i.test(agent) ? 'miui'
        : /OPR\/|Opera|OPiOS|OPT\//i.test(agent) ? 'opera'
          : /Firefox|FxiOS/i.test(agent) ? 'firefox'
            : /EdgA?\/|EdgiOS/i.test(agent) ? 'edge'
              : /CriOS/i.test(agent) ? 'chrome-ios'
                : /Chrome\//i.test(agent) ? 'chrome'
                  : ios ? 'safari' : 'other';
  // Xiaomi, Redmi and POCO phones block home-screen icons from browsers until allowed.
  const xiaomi = android && /Xiaomi|Redmi|POCO|\bMi \d|M\d{4}[A-Z]\d+[A-Z]*|MIUI|HyperOS/i.test(agent);
  return { platform: android ? 'android' : ios ? 'ios' : 'desktop', browser, inApp, xiaomi };
}

// Chrome on Android hides the phone model from the user agent, but tells it
// when asked. Xiaomi model codes start with the year and month (2305…, M2101…).
export async function isXiaomiPhone() {
  try {
    const { model = '' } = (await navigator.userAgentData?.getHighEntropyValues?.(['model'])) ?? {};
    return /Xiaomi|Redmi|POCO|^Mi \d|^M?2\d{3}[0-9A-Z]{3,8}$/i.test(model.trim());
  } catch {
    return false;
  }
}

// Opens this page in Chrome from a browser inside another app (Android).
export const openInChromeUrl = (path = '/install') => `intent://${typeof window !== 'undefined' ? window.location.host : 'www.kotkafinance.online'}${path}#Intent;scheme=https;package=com.android.chrome;end`;

// ── Service worker ─────────────────────────────────────────────────────────
let registrationPromise = null;

export function registerServiceWorker() {
  // Dev builds skip it unless asked (localStorage kotka:sw-dev = 1), so hot
  // reload isn't fighting a cache.
  if (!('serviceWorker' in navigator) || (!import.meta.env.PROD && local.get('kotka:sw-dev') !== '1')) return null;
  registrationPromise ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
    console.warn('[pwa] service worker', err);
    return null;
  });
  return registrationPromise;
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await registrationPromise) ?? (await navigator.serviceWorker.getRegistration()) ?? null;
}

// ── Install prompt ─────────────────────────────────────────────────────────
let deferredPrompt = null;
let installedNow = false;
const installListeners = new Set();
const emitInstall = () => installListeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emitInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    emitInstall();
  });
}

export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => !!deferredPrompt,
  );
  const justInstalled = useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => installedNow,
  );
  const standalone = isStandalone();
  return {
    canInstall: canPrompt && !standalone,
    justInstalled,
    // iOS has no prompt; the user adds it from the Share menu.
    iosManual: isIOS && !standalone,
    standalone,
    install: async () => {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      emitInstall();
      return outcome === 'accepted';
    },
  };
}

// ── Web Push ───────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// 'unsupported' | 'needs-install' (iOS outside the Home Screen app) | 'denied' | 'default' | 'granted'
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return isIOS && !isStandalone() ? 'needs-install' : 'unsupported';
  return Notification.permission;
}

export async function currentSubscription() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  const reg = await registration();
  if (!reg) throw new Error('Notifications aren’t available here yet. Reload the page and try again.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for Kotka in your browser settings.' : 'You didn’t allow notifications. Tap Turn on whenever you’re ready.');
  const { publicKey } = await api.get('/push/key');
  let sub = await reg.pushManager.getSubscription();
  const key = urlBase64ToUint8Array(publicKey);
  // A subscription made with a different key can't receive Kotka's pushes.
  if (sub && sub.options?.applicationServerKey) {
    const existing = new Uint8Array(sub.options.applicationServerKey);
    if (existing.length !== key.length || existing.some((b, i) => b !== key[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  emitPush();
  return sub;
}

export async function disablePush() {
  local.set('kotka:push-nudge', 'done'); // turned off on purpose: don't offer it again
  const sub = await currentSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  emitPush();
}

// The server ties each browser's push subscription to the signed-in session
// (signing a device out stops its pushes). Once per visit, quietly tell it
// about this browser's subscription again. Never prompts.
export async function resyncPush() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (sessionStorage.getItem('kotka:push-synced')) return;
    const sub = await currentSubscription();
    if (!sub) return;
    await api.post('/push/subscribe', { subscription: sub.toJSON() });
    sessionStorage.setItem('kotka:push-synced', '1');
  } catch {
    // Push is optional; a failed sync is retried on the next visit.
  }
}

// Signing out: this browser should stop receiving that account's pushes.
export async function forgetDeviceOnLogout() {
  try {
    const sub = await currentSubscription();
    if (sub) {
      // Whoever signs in next on this browser gets offered push again.
      local.set('kotka:push-nudge', '');
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch {
    // Signing out must not fail because of push.
  }
}

const pushListeners = new Set();
function emitPush() {
  pushListeners.forEach((l) => l());
}

// { support, subscribed, endpoint, ready } for this browser.
export function usePushState() {
  const [state, setState] = useState({ support: pushSupport(), subscribed: false, endpoint: null, ready: false });
  useEffect(() => {
    let live = true;
    const read = async () => {
      const sub = await currentSubscription().catch(() => null);
      if (live) setState({ support: pushSupport(), subscribed: !!sub && pushSupport() === 'granted', endpoint: sub?.endpoint ?? null, ready: true });
    };
    read();
    pushListeners.add(read);
    return () => {
      live = false;
      pushListeners.delete(read);
    };
  }, []);
  return state;
}

// ── Small per-device memory for hints and nudges ───────────────────────────
export const local = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the hint just shows again.
    }
  },
};
