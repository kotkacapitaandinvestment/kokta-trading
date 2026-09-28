import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { compressImage } from '../util';
import { Avatar } from './Identity';

export const INSTRUMENT_OPTIONS = [
  ['Forex', ['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY']],
  ['Metals', ['XAUUSD', 'XAGUSD']],
  ['Crypto', ['BTCUSD', 'ETHUSD']],
  ['Indices', ['NAS100', 'SPX500', 'US30']],
];
export const display = (s) => (s && /^[A-Z]{6}$/.test(s) ? `${s.slice(0, 3)}/${s.slice(3)}` : s);

export function InstrumentSelect({ value, onChange, required, className, placeholder = 'Market' }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} required={required} className={clsx('h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-800 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100', className)}>
      <option value="">{placeholder}</option>
      {INSTRUMENT_OPTIONS.map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((s) => <option key={s} value={s}>{display(s)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// Uploads images (compressed in the browser) and returns media ids.
export function useImageUploads(max = 4) {
  const [items, setItems] = useState([]); // { key, preview, mediaId?, error?, busy }
  const add = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, max - items.length);
    for (const file of list) {
      const key = `${file.name}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      setItems((prev) => [...prev, { key, preview, busy: true }]);
      try {
        const { dataUrl, width, height } = await compressImage(file);
        const { media } = await api.post('/media', { dataUrl, width, height });
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, busy: false, mediaId: media.id } : it)));
      } catch (err) {
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, busy: false, error: err.message } : it)));
      }
    }
  };
  const remove = (key) => setItems((prev) => prev.filter((it) => it.key !== key));
  return { items, add, remove, reset: () => setItems([]), busy: items.some((i) => i.busy), attachments: items.filter((i) => i.mediaId).map((i) => ({ type: 'image', mediaId: i.mediaId })) };
}

export function ImagePicker({ uploads, max = 4, label = 'Add image' }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploads.add(e.target.files); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploads.items.length >= max} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-40 dark:text-ink-400 dark:hover:bg-ink-800" aria-label={label} title={label}>
        <ImagePlus className="h-4 w-4" />
      </button>
    </>
  );
}

export function UploadPreviews({ uploads }) {
  if (!uploads.items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {uploads.items.map((it) => (
        <div key={it.key} className="relative">
          <img src={it.preview} alt="" className={clsx('h-16 w-16 rounded-lg object-cover', it.error && 'opacity-40')} />
          {it.busy ? <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" /> : null}
          <button type="button" onClick={() => uploads.remove(it.key)} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-900 p-0.5 text-white" aria-label="Remove image"><X className="h-3 w-3" /></button>
          {it.error ? <span className="absolute inset-x-0 bottom-0 truncate bg-loss-500 px-1 text-[9px] text-white" title={`${it.error} Tap × and try again.`}>Didn’t upload</span> : null}
        </div>
      ))}
    </div>
  );
}

// Textarea with @mention autocomplete. autoGrow sizes it to its content up
// to its CSS max-height, then it scrolls.
export const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, onKeyDown, className, wrapperClassName, autoGrow = false, ...props }, ref) {
  const [q, setQ] = useState(null);
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState(0);
  const inner = useRef(null);
  const el = ref ?? inner;
  useLayoutEffect(() => {
    const t = el.current;
    if (!autoGrow || !t) return;
    t.style.height = 'auto';
    const max = parseFloat(getComputedStyle(t).maxHeight) || 160;
    t.style.height = `${Math.min(t.scrollHeight + 2, max)}px`;
    t.style.overflowY = t.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, autoGrow, el]);
  useEffect(() => {
    if (q === null || q.length < 1) return setUsers([]);
    const t = setTimeout(() => api.get(`/community/people?q=${encodeURIComponent(q)}`).then((r) => { setUsers(r.users.slice(0, 6)); setActive(0); }).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);
  const detect = (text, pos) => {
    const m = /(?:^|\s)@([a-z0-9_]{0,20})$/i.exec(text.slice(0, pos));
    setQ(m ? m[1] : null);
  };
  const pick = (u) => {
    const pos = el.current.selectionStart;
    const before = value.slice(0, pos).replace(/@([a-z0-9_]{0,20})$/i, `@${u.username} `);
    onChange(before + value.slice(pos));
    setQ(null);
    requestAnimationFrame(() => el.current?.setSelectionRange(before.length, before.length));
  };
  return (
    <div className={clsx('relative', wrapperClassName)}>
      <textarea
        ref={el}
        value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if (users.length && q !== null) {
            if (e.key === 'ArrowDown') { e.preventDefault(); return setActive((a) => (a + 1) % users.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); return setActive((a) => (a - 1 + users.length) % users.length); }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick(users[active]); }
            if (e.key === 'Escape') return setQ(null);
          }
          onKeyDown?.(e);
        }}
        className={className}
        {...props}
      />
      {users.length && q !== null ? (
        <ul className="absolute bottom-full left-0 z-30 mb-1 w-64 overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-pop dark:border-ink-700 dark:bg-ink-800" role="listbox">
          {users.map((u, i) => (
            <li key={u.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(u); }} className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === active ? 'bg-ink-50 dark:bg-ink-700' : '')}>
                <Avatar user={u} size={24} />
                <span className="truncate font-medium text-ink-800 dark:text-ink-100">{u.name}</span>
                <span className="truncate text-xs text-ink-400">@{u.username}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
