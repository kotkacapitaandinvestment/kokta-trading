// Installable app + Web Push on the client.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

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
  const standalone = isStandalone();
  return {
    canInstall: canPrompt && !standalone,
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
  if (!reg) throw new Error('Push needs the installed or production app. Reload and try again.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for Kotka in your browser settings.' : 'Permission was not given.');
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
