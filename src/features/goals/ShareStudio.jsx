import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Copy, Download, EyeOff, Globe2, Link2, Loader2, Lock, Share2, SlidersHorizontal } from 'lucide-react';
import { getFontEmbedCSS, toBlob, toJpeg } from 'html-to-image';
import Modal from '../../components/ui/Modal';
import { api } from '../../lib/api';
import AchievementCard, { CardPreview } from './AchievementCard';
import { FORMATS, localToday, presetKeys, snapshotFor } from './card';

// ── image export ───────────────────────────────────────────────────────────
let fontCSS = null;
const exportOpts = async (node) => {
  fontCSS ??= await getFontEmbedCSS(node).catch(() => '');
  return { pixelRatio: 1, cacheBust: false, fontEmbedCSS: fontCSS, style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' } };
};
// Safari sometimes paints images and fonts only on the second pass.
async function renderPng(node) {
  const opts = await exportOpts(node);
  await toBlob(node, opts).catch(() => null);
  const blob = await toBlob(node, opts);
  if (!blob) throw new Error('The image could not be created in this browser.');
  return blob;
}
async function renderOgJpeg(node) {
  const opts = { ...(await exportOpts(node)), pixelRatio: 0.75, quality: 0.9, backgroundColor: '#070706' };
  await toJpeg(node, opts).catch(() => null);
  return toJpeg(node, opts);
}

// Safari only downloads from a link that is in the document.
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name, rel: 'noopener' });
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const canShareFiles = () => {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([new Blob()], 'k.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
};

const MODES = [
  { id: 'public', label: 'Public', icon: Globe2, text: 'Achievement, streak, badges and level. Never profit, trades, risk or notes.' },
  { id: 'custom', label: 'Custom', icon: SlidersHorizontal, text: 'Choose each detail yourself.' },
  { id: 'private', label: 'Private', icon: EyeOff, text: 'See the full card. Nothing can be shared.' },
];

function FormatGlyph({ id }) {
  const [w, h] = { '1:1': [16, 16], '9:16': [11, 19], '16:9': [20, 11], '4:5': [14, 17] }[id];
  return <span className="inline-block rounded-[3px] border-2 border-current" style={{ width: w, height: h }} />;
}

export default function ShareStudio({ source, sourceId, onClose }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('public');
  const [keys, setKeys] = useState([]);
  const [format, setFormat] = useState('1:1');
  const [ack, setAck] = useState(false);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(null);
  const exportRef = useRef(null);
  const ogRef = useRef(null);
  const fileShare = useMemo(canShareFiles, []);

  useEffect(() => {
    api.get(`/goals/cards/${source}/${sourceId}?today=${localToday()}`).then((r) => {
      setCard(r.card);
      setKeys(r.preset);
    }).catch((err) => setError(err.message));
  }, [source, sourceId]);

  const active = useMemo(() => (!card ? [] : mode === 'public' ? presetKeys(card) : mode === 'private' ? card.fields.map((f) => f.key) : keys), [card, mode, keys]);
  const snap = useMemo(() => (card ? snapshotFor(card, active) : null), [card, active]);
  const sensitiveOn = card ? card.fields.filter((f) => f.sensitive && active.includes(f.key)) : [];
  const shareable = mode !== 'private' && (!sensitiveOn.length || ack);
  const signature = `${mode}|${[...active].sort().join(',')}`;
  useEffect(() => {
    setLink(null);
    setAck(false);
  }, [signature]);

  if (error) {
    return (
      <Modal open onClose={onClose} title="Share achievement">
        <p className="text-sm text-loss-500">{error}</p>
      </Modal>
    );
  }

  const toggle = (k) => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const flash = (text, tone = 'ok') => setStatus({ text, tone });

  const run = async (name, fn) => {
    if (!shareable) return;
    setBusy(name);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      if (err?.name !== 'AbortError') flash(err.message || 'That did not work. Try Download instead.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const fileName = `kotka-${(snap?.headline ?? 'achievement').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${format.replace(':', 'x')}.png`;
  const download = () =>
    run('download', async () => {
      saveBlob(await renderPng(exportRef.current), fileName);
      flash('Image downloaded.');
    });
  const copyImage = () =>
    run('copy', async () => {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('This browser can’t copy images. Use Download instead.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderPng(exportRef.current) })]);
      flash('Image copied. Paste it into a post or chat.');
    });
  const nativeShare = (extraText) =>
    run('native', async () => {
      const blob = await renderPng(exportRef.current);
      await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], text: extraText ?? snap.sentence });
    });

  // A public page showing only the chosen fields; created on first use.
  const ensureLink = async () => {
    if (link) return link;
    const image = await renderOgJpeg(ogRef.current).catch(() => null);
    const { share } = await api.post('/goals/shares', { source, sourceId, fields: active, sensitiveAck: sensitiveOn.length > 0 && ack, image, width: 1200, height: 675, today: localToday() });
    const made = { ...share, url: `${window.location.origin}${share.path}` };
    setLink(made);
    return made;
  };
  const copyLink = () =>
    run('link', async () => {
      const l = await ensureLink();
      await navigator.clipboard.writeText(l.url);
      flash('Public link copied.');
    });
  const openShare = (name, build) => {
    if (!shareable) return;
    // Open the window inside the click so it isn't blocked, then point it at the share URL.
    const w = window.open('about:blank', '_blank');
    run(name, async () => {
      try {
        const l = await ensureLink();
        const target = build(l.url, `${snap.sentence} Discipline over reckless risk.`);
        if (w) w.location.href = target;
        else window.location.href = target;
      } catch (err) {
        w?.close();
        throw err;
      }
    });
  };
  const instagram = () => {
    if (fileShare) return nativeShare();
    return run('instagram', async () => {
      saveBlob(await renderPng(exportRef.current), fileName);
      flash('Instagram doesn’t accept posts from websites. The image is downloaded: post it from your photos in Instagram (Story size works best).');
    });
  };

  const groups = card
    ? [
        ['On the card', card.fields.filter((f) => !f.sensitive && !['name', 'username'].includes(f.key))],
        ['About you', card.fields.filter((f) => ['name', 'username'].includes(f.key))],
        ['Sensitive (off unless you turn it on)', card.fields.filter((f) => f.sensitive)],
      ].filter(([, list]) => list.length)
    : [];

  const btn = 'flex h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800';

  return (
    <Modal open onClose={onClose} title="Share achievement" width="max-w-5xl">
      {!card || !snap ? (
        <div className="h-72 animate-pulse rounded-xl bg-ink-50 dark:bg-ink-800" />
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col items-center gap-3">
            <CardPreview snap={snap} format={format} maxWidth={Math.min(420, typeof window !== 'undefined' ? window.innerWidth - 72 : 420)} maxHeight={520} />
            <p className="max-w-sm text-center text-[11px] leading-relaxed text-ink-400">
              {snap.verification === 'verified' ? 'Verified by a connected broker account.' : 'Self-reported: built from your own Kotka check-ins, goals and journal. Kotka marks a result Verified only after a broker connection confirms it, and none is connected.'}
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Format</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FORMATS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFormat(f.id)} aria-pressed={format === f.id} title={f.hint} className={clsx('flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs transition-colors', format === f.id ? 'border-accent-500 bg-accent-500/10 text-ink-900 dark:text-ink-50' : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400')}>
                    <FormatGlyph id={f.id} />
                    <span className="font-medium">{f.label} <span className="font-mono text-[10px] opacity-70">{f.id}</span></span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-400">{FORMATS.find((f) => f.id === format)?.hint}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Privacy</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-50 p-1 dark:bg-ink-800">
                {MODES.map((m) => (
                  <button key={m.id} type="button" onClick={() => { setMode(m.id); if (m.id === 'custom' && !keys.length) setKeys(presetKeys(card)); }} aria-pressed={mode === m.id} className={clsx('flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors', mode === m.id ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-ink-50' : 'text-ink-500 dark:text-ink-400')}>
                    <m.icon className="h-4 w-4" /> {m.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{MODES.find((m) => m.id === mode)?.text}</p>

              {mode === 'custom' ? (
                <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-ink-100 p-3 dark:border-ink-800">
                  {groups.map(([title, list]) => (
                    <fieldset key={title}>
                      <legend className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{title.startsWith('Sensitive') ? <Lock className="h-3 w-3" /> : null}{title}</legend>
                      {list.map((f) => (
                        <label key={f.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800">
                          <input type="checkbox" checked={keys.includes(f.key)} onChange={() => toggle(f.key)} className="mt-0.5 h-4 w-4 accent-[#B58637]" />
                          <span className="min-w-0">
                            <span className="text-ink-800 dark:text-ink-100">{f.label}</span>
                            <span className="block truncate text-xs text-ink-400">{Array.isArray(f.value) ? (typeof f.value[0] === 'object' ? `${f.value.length} items` : f.value.join(', ')) : f.value}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              ) : null}
              {mode === 'public' ? (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {card.fields.filter((f) => presetKeys(card).includes(f.key)).map((f) => <span key={f.key} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">{f.label}</span>)}
                </p>
              ) : null}

              {sensitiveOn.length && mode === 'custom' ? (
                <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#B58637]" />
                  <span>I understand my {sensitiveOn.map((f) => f.label.toLowerCase()).join(', ')} will be visible to anyone I share this with.</span>
                </label>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Share</p>
              {mode === 'private' ? <p className="mb-2 text-xs text-ink-500 dark:text-ink-400">Private: only you can see this card. Switch to Public or Custom to share it.</p> : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={copyImage}>{busy === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copy image</button>
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={download}>{busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download</button>
                {fileShare ? <button type="button" className={btn} disabled={!shareable || !!busy} onClick={() => nativeShare()}>{busy === 'native' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share…</button> : null}
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={copyLink}>{busy === 'link' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Copy link</button>
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={() => openShare('whatsapp', (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`)}>WhatsApp</button>
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={instagram}>Instagram</button>
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={() => openShare('linkedin', (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`)}>LinkedIn</button>
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={() => openShare('x', (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`)}>X</button>
                <button type="button" className={btn} disabled={!shareable || !!busy} onClick={() => openShare('facebook', (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`)}>Facebook</button>
              </div>
              {status ? <p role="status" className={clsx('mt-2 text-xs', status.tone === 'error' ? 'text-loss-500' : 'text-profit-600 dark:text-profit-400')}>{status.text}</p> : null}
              {link ? <p className="mt-2 truncate text-xs text-ink-500 dark:text-ink-400">Public link: <a href={link.url} target="_blank" rel="noreferrer" className="font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300">{link.url.replace(/^https?:\/\//, '')}</a></p> : null}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">Link-based options create a public Kotka page showing only what’s on this card. Remove it any time under Public links in Goal Room. Instagram and WhatsApp Status take images, not links: use Share… on your phone or Download.</p>
            </div>
          </div>
        </div>
      )}

      {/* Full-size cards for export, kept off-screen. */}
      {snap ? (
        <div aria-hidden="true" style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          <AchievementCard ref={exportRef} snap={snap} format={format} />
          <AchievementCard ref={ogRef} snap={snap} format="16:9" />
        </div>
      ) : null}
    </Modal>
  );
}
