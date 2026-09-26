import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { BarChart3, LineChart, Loader2, Lock, Mic, Send, Square, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { blobToDataUrl, supportsVoice } from '../util';
import { InstrumentSelect, ImagePicker, UploadPreviews, useImageUploads, MentionTextarea, display } from '../components/inputs';

// Voice notes: up to 2 minutes, recorded as Opus in WebM/MP4.
function useRecorder() {
  const [state, setState] = useState({ recording: false, ms: 0 });
  const rec = useRef(null);
  const chunks = useRef([]);
  const started = useRef(0);
  const timer = useRef(null);
  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => window.MediaRecorder.isTypeSupported?.(t)) ?? '';
    rec.current = new window.MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    chunks.current = [];
    rec.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.current.start();
    started.current = Date.now();
    setState({ recording: true, ms: 0 });
    timer.current = setInterval(() => {
      const ms = Date.now() - started.current;
      setState({ recording: true, ms });
      if (ms > 120000) stop();
    }, 250);
  };
  const stop = () =>
    new Promise((resolve) => {
      clearInterval(timer.current);
      if (!rec.current) return resolve(null);
      rec.current.onstop = () => {
        rec.current.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.current.mimeType || 'audio/webm' });
        const durationMs = Date.now() - started.current;
        rec.current = null;
        setState({ recording: false, ms: 0 });
        resolve({ blob, durationMs });
      };
      rec.current.stop();
    });
  const cancel = async () => {
    await stop();
  };
  return { ...state, start, stop, cancel };
}

export default function MessageComposer({ conversationId, threadRootId = null, access, replyTo, onClearReply, editing, onDoneEditing, onSent, placeholder }) {
  const [body, setBody] = useState('');
  const [market, setMarket] = useState(null);
  const [showMarket, setShowMarket] = useState(false);
  const [poll, setPoll] = useState(null);
  const [state, setState] = useState(null);
  const uploads = useImageUploads(4);
  const recorder = useRecorder();
  const lastTyping = useRef(0);
  const input = useRef(null);

  useEffect(() => {
    if (editing) {
      setBody(editing.body);
      input.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  if (access && !access.canSend) {
    return (
      <div className="flex items-center gap-2 border-t border-ink-100 px-4 py-3 text-sm text-ink-500 dark:border-ink-800 dark:text-ink-400">
        <Lock className="h-4 w-4 shrink-0" /> {access.sendBlockedReason ?? 'You cannot send messages here.'}
      </div>
    );
  }

  const typing = () => {
    if (Date.now() - lastTyping.current < 3000) return;
    lastTyping.current = Date.now();
    api.post(`/community/conversations/${conversationId}/typing`, { threadRootId }).catch(() => {});
  };

  const send = async (extra = {}) => {
    if (state?.busy) return;
    if (editing) {
      setState({ busy: true });
      try {
        await api.patch(`/community/messages/${editing.id}`, { body });
        setBody('');
        onDoneEditing?.();
        setState(null);
      } catch (err) {
        setState({ error: err.message });
      }
      return;
    }
    const attachments = [...uploads.attachments, ...(market ? [{ type: 'market', symbol: market }] : []), ...(extra.attachments ?? [])];
    const pollPayload = poll ? { question: poll.question, options: poll.options.filter((o) => o.trim()) } : undefined;
    if (!body.trim() && !attachments.length && !pollPayload) return;
    setState({ busy: true });
    try {
      const { message } = await api.post(`/community/conversations/${conversationId}/messages`, { body, attachments, replyToId: replyTo?.id, threadRootId, poll: pollPayload });
      setBody('');
      setMarket(null);
      setPoll(null);
      uploads.reset();
      onClearReply?.();
      setState(null);
      onSent?.(message);
    } catch (err) {
      setState({ error: err.message });
    }
  };

  const sendVoice = async () => {
    const res = await recorder.stop();
    if (!res || res.durationMs < 800) return;
    setState({ busy: true });
    try {
      const dataUrl = await blobToDataUrl(res.blob);
      const { media } = await api.post('/media', { dataUrl, durationMs: res.durationMs });
      setState(null);
      await send({ attachments: [{ type: 'audio', mediaId: media.id }] });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <div className="border-t border-ink-100 bg-white px-3 py-2.5 dark:border-ink-800 dark:bg-ink-900">
      {replyTo || editing ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border-l-2 border-accent-500 bg-ink-50 px-3 py-1.5 text-xs dark:bg-ink-800">
          <span className="truncate text-ink-600 dark:text-ink-300">
            {editing ? 'Editing message' : <>Replying to <span className="font-semibold">{replyTo.author?.name}</span>: {replyTo.body?.slice(0, 80) || 'attachment'}</>}
          </span>
          <button type="button" onClick={() => { if (editing) { setBody(''); onDoneEditing?.(); } else onClearReply?.(); }} aria-label="Cancel"><X className="h-3.5 w-3.5 text-ink-400" /></button>
        </div>
      ) : null}
      <UploadPreviews uploads={uploads} />
      {market ? (
        <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-accent-500/10 px-2 py-1 text-xs font-medium text-accent-800 dark:text-accent-300">
          <LineChart className="h-3.5 w-3.5" /> Attaching {display(market)} (latest close)
          <button type="button" onClick={() => setMarket(null)} aria-label="Remove market"><X className="h-3 w-3" /></button>
        </div>
      ) : null}
      {poll ? (
        <div className="mb-2 space-y-1.5 rounded-xl border border-ink-100 p-2.5 dark:border-ink-800">
          <div className="flex items-center gap-2">
            <input value={poll.question} onChange={(e) => setPoll({ ...poll, question: e.target.value })} placeholder="Poll question" maxLength={200} className="h-8 flex-1 rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
            <button type="button" onClick={() => setPoll(null)} aria-label="Remove poll"><X className="h-4 w-4 text-ink-400" /></button>
          </div>
          {poll.options.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setPoll({ ...poll, options: poll.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Option ${i + 1}`} maxLength={80} className="h-8 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50" />
          ))}
          {poll.options.length < 6 ? <button type="button" onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })} className="text-xs font-medium text-accent-700 dark:text-accent-300">+ Option</button> : null}
        </div>
      ) : null}
      {showMarket ? (
        <div className="mb-2 flex items-center gap-2">
          <InstrumentSelect value={market} onChange={(v) => { setMarket(v); setShowMarket(false); }} placeholder="Choose a market to attach" />
          <button type="button" onClick={() => setShowMarket(false)} className="text-xs text-ink-400">Cancel</button>
        </div>
      ) : null}

      {recorder.recording ? (
        <div className="flex items-center gap-3 rounded-xl bg-loss-50 px-3 py-2 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-loss-500" /> Recording {Math.floor(recorder.ms / 1000)}s
          <button type="button" onClick={recorder.cancel} className="ml-auto text-xs font-medium text-ink-500">Cancel</button>
          <button type="button" onClick={sendVoice} className="flex h-8 w-8 items-center justify-center rounded-full bg-loss-500 text-white" aria-label="Stop and send"><Square className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          {!editing ? (
            <div className="flex h-10 shrink-0 items-center">
              <ImagePicker uploads={uploads} label="Attach image or chart" />
              <button type="button" onClick={() => setShowMarket((s) => !s)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800" aria-label="Attach market" title="Attach market"><LineChart className="h-4 w-4" /></button>
              {!threadRootId ? <button type="button" onClick={() => setPoll(poll ? null : { question: '', options: ['', ''] })} className="hidden h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800 sm:flex" aria-label="Create poll" title="Poll"><BarChart3 className="h-4 w-4" /></button> : null}
            </div>
          ) : null}
          <MentionTextarea
            ref={input}
            wrapperClassName="min-w-0 flex-1"
            autoGrow
            value={body}
            onChange={(v) => { setBody(v); typing(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={placeholder ?? 'Message'}
            className="block max-h-40 min-h-[40px] w-full resize-none overflow-hidden rounded-xl border border-ink-200 bg-ink-50/50 px-3 py-[9px] text-[15px] leading-5 text-ink-900 outline-none placeholder:text-ink-400 focus:border-accent-500 focus:bg-white dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
          />
          {!body.trim() && !uploads.items.length && !market && !poll && !editing && supportsVoice() ? (
            <button type="button" onClick={() => recorder.start().catch((err) => setState({ error: `Microphone unavailable: ${err.message}` }))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800" aria-label="Record voice message"><Mic className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={() => send()} disabled={state?.busy || uploads.busy} className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white disabled:opacity-50 dark:bg-accent-500 dark:text-ink-950')} aria-label={editing ? 'Save edit' : 'Send'}>
              {state?.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}
      {state?.error ? <p role="alert" className="mt-1.5 text-xs text-loss-500">{state.error}</p> : null}
    </div>
  );
}
