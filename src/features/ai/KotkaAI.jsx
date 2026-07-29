import { useRef, useState } from 'react';
import { ImagePlus, Send, Star, Sparkles } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ConversationList from './components/ConversationList';
import ChatMessage from './components/ChatMessage';
import { aiConversations } from '../../lib/mockData';
import { generateAssistantReply, markets, timeframes } from './mockAssistant';
import { useAuth } from '../../context/AuthContext';

export default function KotkaAI() {
  const { user } = useAuth();
  const isPremium = user?.role === 'premium' || user?.role === 'admin';
  const [conversations, setConversations] = useState(aiConversations);
  const [activeId, setActiveId] = useState(aiConversations[0]?.id);
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState('Forex');
  const [timeframe, setTimeframe] = useState('15m');
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [thinking, setThinking] = useState(false);
  const fileInputRef = useRef(null);
  const usageToday = 6;
  const usageLimit = isPremium ? Infinity : 10;

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  const updateActive = (updater) => {
    setConversations((prev) => prev.map((c) => (c.id === active.id ? updater(c) : c)));
  };

  const handleNew = () => {
    const id = `c${Date.now()}`;
    const fresh = {
      id,
      title: 'New analysis',
      market,
      updatedAt: new Date().toISOString(),
      favorite: false,
      messages: [],
    };
    setConversations((prev) => [fresh, ...prev]);
    setActiveId(id);
  };

  const handleToggleFavorite = () => {
    updateActive((c) => ({ ...c, favorite: !c.favorite }));
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSend = () => {
    if (!input.trim() && !pendingImage) return;
    const userMsg = { role: 'user', content: input.trim() || 'Chart attached for review.', image: pendingImage };
    const nextTitle = active.messages.length === 0 ? input.slice(0, 48) || 'Chart review' : active.title;

    updateActive((c) => ({
      ...c,
      title: nextTitle,
      market,
      updatedAt: new Date().toISOString(),
      messages: [...c.messages, userMsg],
    }));

    setInput('');
    setPendingImage(null);
    setThinking(true);

    setTimeout(() => {
      const reply = generateAssistantReply(userMsg.content, market);
      updateActive((c) => ({
        ...c,
        messages: [...c.messages, { role: 'assistant', content: reply }],
      }));
      setThinking(false);
    }, 900);
  };

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
              {!isPremium ? (
                <span className="text-xs text-ink-400">{usageToday}/{usageLimit} today</span>
              ) : (
                <span className="text-xs font-medium text-accent-600 dark:text-accent-400">Unlimited</span>
              )}
              <button onClick={handleToggleFavorite} className="text-ink-300 hover:text-amber-400">
                <Star className={active?.favorite ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4'} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin p-4">
            {active?.messages.length === 0 ? (
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
              active?.messages.map((m, i) => <ChatMessage key={i} {...m} />)
            )}
            {thinking ? (
              <div className="flex items-center gap-2 text-xs text-ink-400">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-white dark:bg-white dark:text-ink-900">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                </span>
                Kotka is thinking…
              </div>
            ) : null}
          </div>

          <div className="border-t border-ink-100 p-3 dark:border-ink-800">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
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
                placeholder="Explain your setup, thesis, or paste a level…"
                className="h-10 max-h-32 flex-1 resize-none rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
              />
              <Button onClick={handleSend} icon={Send} size="md" disabled={thinking}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
