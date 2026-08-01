import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

export default function ChatMessage({ role, content, image }) {
  const { user } = useAuth();
  const isUser = role === 'user';

  return (
    <div className={clsx('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          isUser ? 'bg-accent-500 text-ink-950' : 'bg-ink-900 text-white dark:bg-white dark:text-ink-900',
        )}
      >
        {isUser ? (user?.initials ?? 'U') : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={clsx('max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed', isUser
        ? 'border-l-2 border-accent-500 bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100'
        : 'bg-ink-50 text-ink-700 dark:bg-ink-800 dark:text-ink-200')}
      >
        {image ? (
          <img src={image} alt="Uploaded chart" className="mb-2 max-h-56 w-full rounded-lg object-cover" />
        ) : null}
        {content}
      </div>
    </div>
  );
}
