import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

// Inline formatting Kotka uses: **bold**, and in-app paths (/app/...) as links.
function Inline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\/app\/[A-Za-z0-9/_?=&%.-]+[A-Za-z0-9/_=&%-])/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-ink-900 dark:text-ink-50">{p.slice(2, -2)}</strong>;
    if (p.startsWith('/app/')) return <Link key={i} to={p} className="font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300">{p}</Link>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

// Paragraphs and "- " / "1. " lists; anything else stays plain text.
function Formatted({ content }) {
  const blocks = [];
  for (const raw of content.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '');
    const bullet = /^\s*(?:[-*•])\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const item = bullet ? bullet[1] : numbered[2];
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ kind: 'gap' });
    } else if (last?.kind === 'p') {
      last.lines.push(line);
    } else {
      blocks.push({ kind: 'p', lines: [line] });
    }
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.kind === 'ul' || b.kind === 'ol') {
          const List = b.kind;
          return (
            <List key={i} className={clsx('space-y-1 pl-4', b.kind === 'ul' ? 'list-disc marker:text-accent-500' : 'list-decimal marker:text-ink-400')}>
              {b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}
            </List>
          );
        }
        if (b.kind === 'p') return <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j ? <br /> : null}<Inline text={l} /></Fragment>)}</p>;
        return null;
      })}
    </div>
  );
}

export default function ChatMessage({ role, content, image }) {
  const { user } = useAuth();
  const isUser = role === 'user';

  return (
    <div className={clsx('flex gap-3', isUser && 'flex-row-reverse')}>
      {isUser && user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <div
          className={clsx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            isUser ? 'bg-accent-500 text-ink-950' : 'bg-ink-900 text-white dark:bg-white dark:text-ink-900',
          )}
        >
          {isUser ? (user?.initials ?? 'U') : <Sparkles className="h-4 w-4" />}
        </div>
      )}
      <div className={clsx('min-w-0 max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%]', isUser
        ? 'whitespace-pre-wrap border-l-2 border-accent-500 bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100'
        : 'bg-ink-50 text-ink-700 dark:bg-ink-800 dark:text-ink-200')}
      >
        {image ? (
          <img src={image} alt="Uploaded chart" className="mb-2 max-h-56 w-full rounded-lg object-cover" />
        ) : null}
        {isUser ? content : <Formatted content={content} />}
      </div>
    </div>
  );
}
