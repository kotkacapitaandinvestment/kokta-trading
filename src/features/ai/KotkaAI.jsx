import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, Star, Sparkles } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import ConversationList from './components/ConversationList';
import ChatMessage from './components/ChatMessage';
import { markets, timeframes } from './mockAssistant';
import { api } from '../../lib/api';

export default function KotkaAI() {
  const [conversations, setConversations] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messagesCache, setMessagesCache] = useState({});
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState('Forex');
  const [timeframe, setTimeframe] = useState('15m');
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [lastSource, setLastSource] = useState(null);
  const [usage, setUsage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/ai/conversations').then(({ conversations: list }) => {
      setConversations(list);
      if (list.length) setActiveId(list[0].id);
    });
    api.get('/ai/usage').then(setUsage);
  }, []);

  useEffect(() => {
    if (!activeId || messagesCache[activeId]) return;
    api.get(`/ai/conversations/${activeId}`).then(({ messages }) => {
      setMessagesCache((prev) => ({ ...prev, [activeId]: messages }));
    });
  }, [activeId, messagesCache]);

  const active = conversations?.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? messagesCache[activeId] ?? [] : [];
  const limitReached = usage && !usage.isPremium && usage.usageToday >= usage.usageLimit;

  const handleNew = () => {
    api.post('/ai/conversations', { market }).then(({ conversation }) => {
      setConversations((prev) => [conversation, ...(prev ?? [])]);
      setMessagesCache((prev) => ({ ...prev, [conversation.id]: [] }));
      setActiveId(conversation.id);
    });
  };

  const handleToggleFavorite = () => {
    if (!active) return;
    api.patch(`/ai/conversations/${active.id}`, { favorite: !active.favorite }).then(({ conversation }) => {
      setConversations((prev) => prev.map((c) => (c.id === conversation.id ? conversation : c)));
    });
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if ((!input.trim() && !pendingImage) || !active || thinking) return;
    const content = input.trim();
    const image = pendingImage;
    const conversationId = active.id;
    const wasEmpty = (messagesCache[conversationId] ?? []).length === 0;

    const userMsg = { id: `local-user-${Date.now()}`, role: 'user', content: content || 'Chart attached for review.', image };
    setMessagesCache((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), userMsg] }));
    setInput('');
    setPendingImage(null);
    setThinking(true);

    const assistantLocalId = `local-assistant-${Date.now()}`;
    let placeholderAdded = false;

    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, image, timeframe }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setUsage((prev) => ({ ...(prev ?? {}), usageToday: data.usageToday ?? prev?.usageToday, usageLimit: data.usageLimit ?? prev?.usageLimit, isPremium: false }));
        setMessagesCache((prev) => ({
          ...prev,
          [conversationId]: [...prev[conversationId], { id: `local-limit-${Date.now()}`, role: 'assistant', content: "You've hit today's message limit. Upgrade to Premium for unlimited access." }],
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
          } else if (event.type === 'delta') {
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
      setLastSource('mock');
      setMessagesCache((prev) => ({
        ...prev,
        [conversationId]: [...prev[conversationId], { id: `local-err-${Date.now()}`, role: 'assistant', content: "Couldn't reach Kotka AI right now. Try again shortly." }],
      }));
    } finally {
      setThinking(false);
    }
  };

  if (!conversations) return null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        eyebrow="Kotka AI"
        title="Your institutional trading mentor"
        description="Kotka challenges assumptions, evaluates probability, and questions bias. It will never hand you a signal."
      />

      <Card className="flex min-h-0 flex-1 overflow-hidden">
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

        <div className="flex min-w-0 flex-1 flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Sparkles className="h-8 w-8 text-accent-500" />
              <p className="text-sm text-ink-500 dark:text-ink-400">Start a new analysis to talk to Kotka AI.</p>
              <Button onClick={handleNew}>New analysis</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
                <div className="flex items-center gap-2">
                  <Select value={market} onChange={(e) => setMarket(e.target.value)} className="h-8 w-32 text-xs">
                    {markets.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                  <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="h-8 w-24 text-xs">
                    {timeframes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  {lastSource ? (
                    <Badge tone={lastSource === 'nvidia' ? 'profit' : lastSource === 'vision_unconfigured' ? 'warning' : 'neutral'}>
                      {lastSource === 'nvidia' ? 'Live · NVIDIA' : lastSource === 'vision_unconfigured' ? 'Vision not configured' : 'Scripted mentor'}
                    </Badge>
                  ) : null}
                  {usage ? (
                    usage.isPremium ? (
                      <span className="text-xs font-medium text-accent-600 dark:text-accent-400">Unlimited</span>
                    ) : (
                      <span className="text-xs text-ink-400">{usage.usageToday}/{usage.usageLimit} today</span>
                    )
                  ) : null}
                  <button onClick={handleToggleFavorite} className="text-ink-300 hover:text-amber-400">
                    <Star className={active.favorite ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4'} />
                  </button>
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
                  </div>
                ) : (
                  activeMessages.map((m) => <ChatMessage key={m.id} {...m} />)
                )}
                {thinking && !activeMessages.some((m) => m.id.startsWith('local-assistant-')) ? (
                  <div className="flex items-center gap-2 text-xs text-ink-400">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-white dark:bg-white dark:text-ink-900">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                    </span>
                    Kotka is thinking…
                  </div>
                ) : null}
              </div>

              <div className="border-t border-ink-100 p-3 dark:border-ink-800">
                {limitReached ? (
                  <p className="mb-2 text-xs text-loss-500">
                    You've reached today's {usage.usageLimit}-message limit. Upgrade to Premium for unlimited access.
                  </p>
                ) : null}
                {pendingImage ? (
                  <div className="mb-2 flex items-center gap-2">
                    <img src={pendingImage} alt="preview" className="h-12 w-12 rounded-lg object-cover" />
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
                    disabled={limitReached}
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
                    placeholder="Explain your setup, thesis, or paste a level…"
                    className="h-10 max-h-32 flex-1 resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink-400 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
                  />
                  <Button onClick={handleSend} icon={Send} size="md" disabled={thinking || limitReached}>
                    Send
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
