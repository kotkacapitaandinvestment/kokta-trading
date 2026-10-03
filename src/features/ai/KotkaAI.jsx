import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { History, ImagePlus, Send, Star, Sparkles, X } from 'lucide-react';
import Hint from '../../components/ui/Hint';
import PageHeader from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import ConversationList from './components/ConversationList';
import ChatMessage from './components/ChatMessage';
import { markets, timeframes } from './options';
import { api } from '../../lib/api';
import { compressImage } from '../community/util';
import { toast } from '../../lib/dialogs';
import UsageMeter from '../../components/UsageMeter';
import { usageNote, actionReached, refusalText, requestKey, whenItResets } from '../../lib/usage';

// Starting points that show what Kotka can read. Each is answered from live
// app data, not general knowledge.
const SUGGESTIONS = [
  'Which currency is fundamentally strongest right now?',
  'Summarise the EUR/USD research and what could change it',
  'What high-impact releases are coming this week?',
  'How volatile is gold compared with its usual range?',
  'What changed in the US dollar research recently?',
  'How am I doing against my risk rules today?',
];

// A new analysis opens straight away as a draft; the conversation is only
// created when the first message goes, so no empty chats pile up and a quick
// first message can't land in the previous one.
const DRAFT = 'draft';

export default function KotkaAI() {
  const [conversations, setConversations] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messagesCache, setMessagesCache] = useState({});
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [market, setMarket] = useState('Forex');
  const [timeframe, setTimeframe] = useState('15m');
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(() => (params.get('prompt') ?? '').slice(0, 2000));
  const [status, setStatus] = useState(null);
  // "Ask Kotka" links elsewhere in the app arrive with ?prompt=; they open a
  // fresh conversation with the question filled in. Nothing is sent until the
  // trader presses send, so a link (from anyone) can't spend their AI allowance.
  const booted = useRef(false);
  const autoSend = useRef(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [lastSource, setLastSource] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const fromLink = params.get('prompt');
    const linkMarket = markets.includes(params.get('market')) ? params.get('market') : null;
    if (linkMarket) setMarket(linkMarket);
    api.get('/ai/conversations').then(({ conversations: list }) => {
      setConversations(list);
      if (fromLink) setParams({}, { replace: true });
      setActiveId(fromLink || !list.length ? DRAFT : list[0].id);
    }).catch(() => setLoadError('We couldn’t load Kotka AI. Refresh the page to try again.'));
    api.get('/ai/usage').then(setUsage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId || activeId === DRAFT || messagesCache[activeId]) return;
    api.get(`/ai/conversations/${activeId}`).then(({ messages }) => {
      setMessagesCache((prev) => ({ ...prev, [activeId]: messages }));
    });
  }, [activeId, messagesCache]);

  const isDraft = activeId === DRAFT;
  const active = isDraft ? { id: DRAFT, favorite: false } : conversations?.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? messagesCache[activeId] ?? [] : [];
  // Limits and pauses come from the server (Usage Control); this only shows them.
  const limitReached = !!usage && (usage.paused || usage.headline?.remaining === 0);
  const chartLimit = actionReached(usage, 'chart_analysis');
  const note = usageNote(usage);

  const handleNew = () => {
    if (thinking) return;
    setMessagesCache((prev) => ({ ...prev, [DRAFT]: [] }));
    setActiveId(DRAFT);
    setLastSource(null);
  };

  const handleToggleFavorite = () => {
    if (!active || isDraft) return;
    api.patch(`/ai/conversations/${active.id}`, { favorite: !active.favorite }).then(({ conversation }) => {
      setConversations((prev) => prev.map((c) => (c.id === conversation.id ? conversation : c)));
    });
  };

  // Charts are resized and re-encoded in the browser (smaller upload, no
  // photo metadata); the server accepts PNG, JPEG or WebP under 4 MB.
  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { dataUrl } = await compressImage(file, { maxSide: 2000, quality: 0.85 });
      setPendingImage(dataUrl);
    } catch {
      toast('That file couldn’t be opened as an image. Try a PNG or JPEG screenshot.', { tone: 'error' });
    }
  };

  const handleSend = async (override) => {
    const text = typeof override === 'string' ? override : input;
    if ((!text.trim() && !pendingImage) || !active || thinking) return;
    const content = text.trim();
    const image = pendingImage;
    let conversationId = active.id;
    const wasEmpty = (messagesCache[conversationId] ?? []).length === 0;

    const userMsg = { id: `local-user-${Date.now()}`, role: 'user', content: content || 'Chart attached for review.', image };
    setMessagesCache((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), userMsg] }));
    setInput('');
    setPendingImage(null);
    setThinking(true);

    if (conversationId === DRAFT) {
      try {
        const { conversation } = await api.post('/ai/conversations', { market });
        conversationId = conversation.id;
        setConversations((prev) => [conversation, ...(prev ?? [])]);
        setMessagesCache((prev) => ({ ...prev, [conversation.id]: prev[DRAFT] ?? [userMsg], [DRAFT]: [] }));
        setActiveId(conversation.id);
      } catch (err) {
        setMessagesCache((prev) => ({ ...prev, [DRAFT]: [] }));
        setInput(text);
        setPendingImage(image);
        setThinking(false);
        toast(err.message || 'Kotka AI couldn’t start that analysis. Please try again.', { tone: 'error' });
        return;
      }
    }

    const assistantLocalId = `local-assistant-${Date.now()}`;
    let placeholderAdded = false;

    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey() },
        body: JSON.stringify({ content, image, timeframe }),
      });

      // Refused before Kotka AI ran: a usage limit, a pause, or too many too fast.
      if (res.status === 429 || res.status === 503 || res.status === 409) {
        const data = await res.json().catch(() => ({}));
        api.get('/ai/usage').then(setUsage).catch(() => {});
        const text = refusalText(data) ?? 'Kotka AI couldn’t take that message right now. Please try again in a moment.';
        setMessagesCache((prev) => ({
          ...prev,
          [conversationId]: [...prev[conversationId], { id: `local-limit-${Date.now()}`, role: 'assistant', content: text }],
        }));
        return;
      }

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assembled = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === 'meta') {
            setLastSource(event.source);
          } else if (event.type === 'status') {
            setStatus(event.text);
          } else if (event.type === 'delta') {
            if (event.text.trim()) setStatus(null);
            assembled += event.text;
            if (!placeholderAdded) {
              placeholderAdded = true;
              setMessagesCache((prev) => ({ ...prev, [conversationId]: [...prev[conversationId], { id: assistantLocalId, role: 'assistant', content: assembled }] }));
            } else {
              const snapshot = assembled;
              setMessagesCache((prev) => ({
                ...prev,
                [conversationId]: prev[conversationId].map((m) => (m.id === assistantLocalId ? { ...m, content: snapshot } : m)),
              }));
            }
          } else if (event.type === 'done') {
            const finalId = event.messageId;
            setMessagesCache((prev) => ({
              ...prev,
              [conversationId]: prev[conversationId].map((m) => (m.id === assistantLocalId ? { ...m, id: finalId } : m)),
            }));
          }
        }
      }

      api.get('/ai/usage').then(setUsage);
      api.get('/ai/conversations').then(({ conversations: list }) => setConversations(list));
      if (wasEmpty && content) {
        const title = content.slice(0, 48);
        api.patch(`/ai/conversations/${conversationId}`, { title }).then(({ conversation }) => {
          setConversations((prev) => prev.map((c) => (c.id === conversation.id ? conversation : c)));
        });
      }
    } catch {
      setLastSource('error');
      setMessagesCache((prev) => ({
        ...prev,
        [conversationId]: [...prev[conversationId], { id: `local-err-${Date.now()}`, role: 'assistant', content: "Couldn't reach Kotka AI right now. Try again shortly." }],
      }));
    } finally {
      setThinking(false);
      setStatus(null);
    }
  };

  useEffect(() => {
    if (!autoSend.current || !active || (!isDraft && !messagesCache[active.id]) || !input.trim()) return;
    autoSend.current = false;
    handleSend();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-loss-500 dark:bg-ink-900">{loadError}</p>;
  if (!conversations) return <div role="status" className="h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" aria-label="Loading your conversations" />;

  return (
    <div className="flex h-[calc(100dvh_-_6.5rem_-_var(--bottom-nav)_-_var(--banners,0px))] min-h-[26rem] flex-col sm:h-[calc(100dvh_-_7rem_-_var(--bottom-nav)_-_var(--banners,0px))] lg:h-[calc(100dvh_-_8rem_-_var(--banners,0px))]">
      <PageHeader
        compact
        eyebrow="Kotka AI"
        title="Your institutional trading mentor"
        description="Kotka challenges assumptions, evaluates probability, and questions bias. It will never hand you a signal."
      />

      <Card className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-72 shrink-0 border-r border-ink-100 dark:border-ink-800 md:block">
          <ConversationList
            conversations={conversations}
            activeId={active?.id}
            onSelect={setActiveId}
            onNew={handleNew}
            search={search}
            onSearch={setSearch}
          />
        </div>

        {/* Phones: past analyses slide over the chat. */}
        {showHistory ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-white dark:bg-ink-900 md:hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
              <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">Past analyses</span>
              <button type="button" onClick={() => setShowHistory(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Close past analyses"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1">
              <ConversationList
                conversations={conversations}
                activeId={active?.id}
                onSelect={(id) => { setActiveId(id); setShowHistory(false); }}
                onNew={() => { handleNew(); setShowHistory(false); }}
                search={search}
                onSearch={setSearch}
              />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Sparkles className="h-8 w-8 text-accent-500" />
              <p className="text-sm text-ink-500 dark:text-ink-400">Start a new analysis to talk to Kotka AI.</p>
              <Button onClick={handleNew}>New analysis</Button>
              {conversations.length ? (
                <button type="button" onClick={() => setShowHistory(true)} className="text-xs font-medium text-ink-500 underline-offset-2 hover:underline dark:text-ink-400 md:hidden">
                  Open a past analysis ({conversations.length})
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-3 py-2.5 dark:border-ink-800 sm:gap-3 sm:px-4 sm:py-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowHistory(true)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-300 md:hidden" aria-label="Past analyses" title="Past analyses"><History className="h-4 w-4" /></button>
                  <Select value={market} onChange={(e) => setMarket(e.target.value)} className="h-8 w-32 text-xs" aria-label="Market" title="Market you're discussing">
                    {markets.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                  <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="h-8 w-24 text-xs" aria-label="Chart timeframe" title="Chart timeframe you trade">
                    {timeframes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  {lastSource && lastSource !== 'nvidia' ? (
                    <Badge tone="warning">{lastSource === 'vision_unconfigured' ? 'Chart reading is off right now' : 'Kotka AI is having trouble. Try again soon.'}</Badge>
                  ) : null}
                  <UsageMeter usage={usage} />
                  {!isDraft ? (
                    <button onClick={handleToggleFavorite} className="text-ink-300 hover:text-amber-400" aria-label={active.favorite ? 'Remove from favourites' : 'Add to favourites'} title={active.favorite ? 'Remove from favourites' : 'Add to favourites'}>
                      <Star className={active.favorite ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4'} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin p-4">
                {activeMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-50 dark:bg-ink-800">
                      <Sparkles className="h-5 w-5 text-accent-500" />
                    </div>
                    <p className="text-sm font-medium text-ink-700 dark:text-ink-200">Bring me your thesis, not your hope.</p>
                    <p className="mt-1 max-w-sm text-xs text-ink-400">
                      Describe your setup or upload a chart. I'll question your structure, your risk, and your bias before
                      we talk direction.
                    </p>
                    <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-1.5">
                      {SUGGESTIONS.map((q) => (
                        <button key={q} type="button" onClick={() => handleSend(q)} disabled={limitReached} className="rounded-full border border-ink-200 px-3 py-1.5 text-xs text-ink-600 transition-colors hover:border-accent-500 hover:text-ink-900 disabled:opacity-50 dark:border-ink-700 dark:text-ink-300 dark:hover:text-ink-50">
                          {q}
                        </button>
                      ))}
                    </div>
                    <Hint id="ai-sees-app" className="mt-4 max-w-sm text-left">Kotka reads your journal, the research, market data, the calendar, news and Community, so ask about any of it.</Hint>
                  </div>
                ) : (
                  activeMessages.map((m) => <ChatMessage key={m.id} {...m} />)
                )}
                {thinking && (status || !activeMessages.some((m) => m.id.startsWith('local-assistant-'))) ? (
                  <div className="flex items-center gap-2 text-xs text-ink-400" role="status">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-white dark:bg-white dark:text-ink-900">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                    </span>
                    {status ? `${status}…` : 'Kotka is thinking…'}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-ink-100 p-3 dark:border-ink-800">
                {note ? (
                  <p className={note.tone === 'loss' ? 'mb-2 text-xs text-loss-500' : note.tone === 'warning' ? 'mb-2 text-xs text-amber-600 dark:text-amber-400' : 'mb-2 text-xs text-ink-500 dark:text-ink-400'} role="status">{note.text}</p>
                ) : chartLimit ? (
                  <p className="mb-2 text-xs text-ink-500 dark:text-ink-400" role="status">You’ve reached your limit for chart readings. It resets {whenItResets(chartLimit.headline.resetAt)}. Questions without a chart still work in a new chat.</p>
                ) : null}
                {pendingImage ? (
                  <div className="mb-2 flex items-center gap-2">
                    <img src={pendingImage} alt="Chart preview" className="h-12 w-12 rounded-lg object-cover" />
                    <button onClick={() => setPendingImage(null)} className="text-xs text-loss-500 hover:underline">
                      Remove
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImagePick}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={limitReached || !!chartLimit}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
                    aria-label="Upload chart"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    disabled={limitReached}
                    placeholder="Ask about a market, the research, your trades, or explain a setup…"
                    className="h-10 max-h-32 flex-1 resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink-400 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
                  />
                  <Button onClick={handleSend} icon={Send} size="md" disabled={thinking || limitReached} aria-label="Send">
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
