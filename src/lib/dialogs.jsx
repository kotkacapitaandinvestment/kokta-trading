import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

// Kotka's own confirm / prompt dialogs and toasts. The browser's alert(),
// confirm() and prompt() are never used: they look foreign, can't be styled
// and block the page. Call these from anywhere; <DialogHost /> renders them.
//
//   if (!(await confirmDialog({ title: 'Delete this post?', danger: true }))) return;
//   const note = await promptDialog({ title: 'Add a note', optional: true });
//   toast('Saved');  toast(err.message, { tone: 'error' });

let state = { dialog: null, toasts: [] };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const set = (patch) => {
  state = { ...state, ...patch };
  emit();
};
let seq = 0;

export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => set({ dialog: { kind: 'confirm', id: ++seq, title, message, confirmLabel, cancelLabel, danger, resolve } }));
}

// Resolves to the text entered, or null if cancelled.
export function promptDialog({ title, message, label, placeholder, defaultValue = '', confirmLabel = 'OK', cancelLabel = 'Cancel', optional = false, multiline = false, maxLength = 1000, danger = false } = {}) {
  return new Promise((resolve) => set({ dialog: { kind: 'prompt', id: ++seq, title, message, label, placeholder, defaultValue, confirmLabel, cancelLabel, optional, multiline, maxLength, danger, resolve } }));
}

export function toast(message, { tone = 'success', duration } = {}) {
  const id = ++seq;
  set({ toasts: [...state.toasts, { id, message, tone }].slice(-4) });
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), duration ?? (tone === 'error' ? 6500 : 4000));
}

const useDialogState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

function Dialog({ d }) {
  const [value, setValue] = useState(d.defaultValue ?? '');
  const input = useRef(null);
  const confirmBtn = useRef(null);
  const close = (result) => {
    set({ dialog: null });
    d.resolve(result);
  };
  const ok = () => close(d.kind === 'prompt' ? value.trim() : true);
  const cancel = () => close(d.kind === 'prompt' ? null : false);
  const canConfirm = d.kind !== 'prompt' || d.optional || value.trim().length > 0;

  useEffect(() => {
    (d.kind === 'prompt' ? input.current : confirmBtn.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const field = 'w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50';
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={cancel} />
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dlg-${d.id}-t`}
        aria-describedby={d.message ? `dlg-${d.id}-m` : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (canConfirm) ok();
        }}
        className="relative w-full max-w-sm animate-slide-up rounded-2xl border border-ink-100 bg-white p-5 shadow-pop dark:border-ink-700 dark:bg-ink-900 dark:shadow-none"
      >
        <div className="flex items-start gap-3">
          {d.danger ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loss-50 text-loss-500 dark:bg-loss-500/10">
              <AlertTriangle className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={`dlg-${d.id}-t`} className="text-base font-semibold text-ink-900 dark:text-ink-50">{d.title}</h2>
            {d.message ? <p id={`dlg-${d.id}-m`} className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-500 dark:text-ink-400">{d.message}</p> : null}
          </div>
        </div>
        {d.kind === 'prompt' ? (
          <label className="mt-4 block">
            {d.label ? <span className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">{d.label}{d.optional ? <span className="font-normal text-ink-400"> (optional)</span> : null}</span> : null}
            {d.multiline ? (
              <textarea ref={input} value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={d.maxLength} placeholder={d.placeholder} className={clsx(field, 'py-2')} />
            ) : (
              <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} maxLength={d.maxLength} placeholder={d.placeholder} className={clsx(field, 'h-10')} />
            )}
          </label>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={cancel} className="h-10 rounded-lg px-4 text-sm font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">{d.cancelLabel}</button>
          <button
            ref={confirmBtn}
            type="submit"
            disabled={!canConfirm}
            className={clsx('h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50', d.danger ? 'bg-loss-500 text-white hover:bg-loss-600' : 'bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100')}
          >
            {d.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info };

export function DialogHost() {
  const { dialog, toasts } = useDialogState();
  return createPortal(
    <>
      {dialog ? <Dialog key={dialog.id} d={dialog} /> : null}
      <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(var(--bottom-nav, 0px) + 16px)' }} aria-live="polite">
        {toasts.map((t) => {
          const Icon = TOAST_ICON[t.tone] ?? Info;
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-md animate-slide-up items-start gap-2.5 rounded-xl border border-ink-100 bg-white px-4 py-3 text-sm text-ink-800 shadow-pop dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
              <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', t.tone === 'error' ? 'text-loss-500' : t.tone === 'success' ? 'text-profit-600 dark:text-profit-400' : 'text-accent-600')} />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button type="button" onClick={() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) })} className="shrink-0 text-ink-400 hover:text-ink-700 dark:hover:text-ink-100" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
