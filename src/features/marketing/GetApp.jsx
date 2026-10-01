import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, Download, ExternalLink, Search, Smartphone } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { installContext, isXiaomiPhone, openInChromeUrl, useInstallPrompt } from '../../lib/pwa';
import { toast } from '../../lib/dialogs';

// "Get the app": Kotka installs straight from the browser (no app store).
// The steps depend on the phone and browser, so the page works out which
// one it's open in and shows only those steps, plus where to find the app
// afterwards (on Android it goes to the app list, not always the home screen).
const BROWSER_NAME = { chrome: 'Chrome', samsung: 'Samsung Internet', firefox: 'Firefox', edge: 'Edge', opera: 'Opera', miui: 'Mi Browser', 'chrome-ios': 'Chrome', safari: 'Safari', inapp: 'an app’s built-in browser', other: 'this browser' };

function Steps({ items }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white dark:bg-white dark:text-ink-900">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

const B = ({ children }) => <span className="font-semibold text-ink-900 dark:text-ink-50">{children}</span>;

export default function GetApp() {
  const { user } = useAuth();
  const installer = useInstallPrompt();
  const seen = useMemo(() => installContext(), []);
  const [xiaomi, setXiaomi] = useState(seen.xiaomi);
  const ctx = { ...seen, xiaomi };
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (seen.platform === 'android' && !seen.xiaomi) isXiaomiPhone().then((x) => x && setXiaomi(true));
  }, [seen]);
  useEffect(() => {
    if (installer.justInstalled) setDone(true);
  }, [installer.justInstalled]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/install`);
      toast('Link copied. Paste it into Chrome.');
    } catch {
      toast('Copy this address into Chrome: www.kotkafinance.online/install');
    }
  };
  const install = async () => {
    if (await installer.install()) setDone(true);
  };

  let title;
  let body;
  if (installer.standalone) {
    title = 'You’re using the Kotka app';
    body = <p className="text-sm text-ink-600 dark:text-ink-300">Kotka is already installed on this device. Keep it on your home screen for one-tap access.</p>;
  } else if (ctx.inApp) {
    title = 'Open Kotka in your browser first';
    body = (
      <div className="space-y-4">
        <p className="text-sm text-ink-600 dark:text-ink-300">You opened Kotka inside another app (like WhatsApp, Instagram or Facebook). Apps can’t be installed from there. Open this page in {ctx.platform === 'ios' ? 'Safari' : 'Chrome'}, then install.</p>
        {ctx.platform === 'android' ? <Button as="a" href={openInChromeUrl('/install')} icon={ExternalLink}>Open in Chrome</Button> : null}
        <Steps items={ctx.platform === 'ios'
          ? [<>Tap the <B>⋯</B> or <B>Share</B> menu in this app.</>, <>Choose <B>Open in Safari</B> (or Open in browser).</>, <>Then follow the steps shown there.</>]
          : [<>Or tap the <B>⋮</B> menu at the top right of this screen.</>, <>Choose <B>Open in Chrome</B> (or Open in browser).</>, <>Then follow the steps shown there.</>]} />
        <Button variant="ghost" size="sm" icon={Copy} onClick={copyLink}>Copy the link instead</Button>
      </div>
    );
  } else if (ctx.platform === 'ios') {
    title = 'Add Kotka to your Home Screen';
    body = (
      <Steps items={[
        <>Tap <B>Share</B> {ctx.browser === 'safari' ? 'at the bottom of Safari' : 'in the address bar (Chrome on iPhone supports this too)'}.</>,
        <>Scroll down and tap <B>Add to Home Screen</B>.</>,
        <>Tap <B>Add</B>. Kotka appears on your Home Screen like any app, and alerts work from there.</>,
      ]} />
    );
  } else if (ctx.platform === 'android') {
    title = 'Install Kotka on this phone';
    const chromeSteps = [
      <>Tap the <B>⋮</B> menu at the top right of Chrome.</>,
      <>Tap <B>Install app</B> (on some phones it says <B>Add to Home screen</B>, then <B>Install</B>).</>,
      <>Confirm with <B>Install</B>. Chrome can take up to a minute to finish and shows a message when it’s done.</>,
    ];
    const steps = {
      chrome: chromeSteps,
      samsung: [<>Tap the <B>☰</B> menu at the bottom right.</>, <>Tap <B>Add page to</B>, then <B>Home screen</B>.</>, <>Tap <B>Add</B>.</>],
      firefox: [<>Tap the <B>⋮</B> menu.</>, <>Tap <B>Install</B> (or <B>Add to Home screen</B>).</>, <>Confirm.</>],
      edge: [<>Tap the <B>⋯</B> menu at the bottom.</>, <>Tap <B>Add to phone</B> or <B>Install app</B>.</>, <>Confirm.</>],
    }[ctx.browser];
    body = (
      <div className="space-y-5">
        {installer.canInstall ? <Button onClick={install} icon={Download}>Install Kotka</Button> : null}
        {steps ? (
          <div>
            {installer.canInstall ? <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">If the button doesn’t work, install from the menu instead:</p> : null}
            <Steps items={steps} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-600 dark:text-ink-300">{BROWSER_NAME[ctx.browser]} can’t install apps reliably. Open this page in <B>Chrome</B> (it comes with almost every Android phone), then tap Install.</p>
            <Button as="a" href={openInChromeUrl('/install')} icon={ExternalLink}>Open in Chrome</Button>
          </div>
        )}
        {ctx.xiaomi ? (
          <div className="rounded-xl bg-amber-400/15 p-4 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
            <p className="font-semibold">On Xiaomi, Redmi and POCO phones</p>
            <p className="mt-1">The phone blocks home-screen icons from browsers at first. If nothing appears: open <B>Settings</B> → <B>Apps</B> → <B>Chrome</B> → <B>Other permissions</B> → allow <B>Home screen shortcuts</B>, then install again.</p>
          </div>
        ) : null}
      </div>
    );
  } else {
    title = 'Install Kotka on this computer';
    body = (
      <div className="space-y-4">
        {installer.canInstall ? <Button onClick={install} icon={Download}>Install Kotka</Button> : null}
        <Steps items={[
          <>In Chrome or Edge, click the <B>install</B> icon at the right end of the address bar (a screen with a down arrow).</>,
          <>Or open the browser menu and choose <B>Install Kotka</B> (Chrome: Cast, save and share → Install page as app).</>,
          <>Kotka opens in its own window and appears with your other apps.</>,
        ]} />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-ink-50 dark:bg-ink-950">
      <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Link to={user ? '/app/dashboard' : '/'} className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka app</span>
          </Link>
          <Link to="/help" className="text-xs font-medium text-ink-600 hover:underline dark:text-ink-300">Help</Link>
        </header>

        {done ? (
          <section className="rounded-2xl bg-white p-6 dark:bg-ink-900" role="status">
            <p className="flex items-center gap-2 text-lg font-semibold text-ink-900 dark:text-ink-50"><CheckCircle2 className="h-5 w-5 text-profit-600" /> Kotka is installed</p>
            <WhereIsIt ctx={ctx} />
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-6 dark:bg-ink-900">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400"><Smartphone className="h-4 w-4" /> Free, straight from the browser · no app store</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">{title}</h1>
            <div className="mt-5">{body}</div>
          </section>
        )}

        {!installer.standalone && !done ? (
          <section className="mt-4 rounded-2xl bg-white p-6 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-50">Already installed but can’t find it?</h2>
            <WhereIsIt ctx={ctx} />
          </section>
        ) : null}

        <p className="mt-6 text-xs leading-relaxed text-ink-500 dark:text-ink-400">The app is Kotka itself, with its own icon and window, alerts, and the same account. It updates by itself, so there’s nothing to download again.</p>
      </div>
    </div>
  );
}

function WhereIsIt({ ctx }) {
  if (ctx.platform === 'ios') {
    return <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">Look on your Home Screen, often on the last page. You can also swipe down on the Home Screen and search <B>Kotka</B>.</p>;
  }
  if (ctx.platform === 'android') {
    return (
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        <p className="flex items-start gap-2"><Search className="mt-0.5 h-4 w-4 shrink-0" /><span>Android puts new apps in your <B>app list</B>, not always on the home screen. Swipe up from the bottom of the home screen and search <B>Kotka</B>.</span></p>
        <p>Found it? Press and hold the icon, then drag it onto your home screen.</p>
        <p>Not in the app list either? Some phones, like Xiaomi, Redmi, POCO, vivo and OPPO, stop browsers adding apps until you allow it: open <B>Settings</B> → <B>Apps</B> → <B>Chrome</B> → <B>Permissions</B> (or <B>Other permissions</B>), allow <B>Home screen shortcuts</B> (sometimes called Desktop shortcuts), then install again.</p>
      </div>
    );
  }
  return <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">Kotka is with your other apps: in the Start menu on Windows, or Launchpad and the Applications folder on a Mac.</p>;
}
