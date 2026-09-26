import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Turns @mentions, instrument codes ($EURUSD or EUR/USD) and links into
// clickable elements. External links open in a new tab with a hover note.
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'XAUUSD', 'XAGUSD', 'BTCUSD', 'ETHUSD', 'NAS100', 'SPX500', 'US30'];
const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(^|\s)(@[a-z0-9_]{3,20})\b|(\$[A-Za-z0-9]{3,8})\b|\b([A-Z]{3}\/[A-Z]{3})\b/g;

export default function RichText({ text, className }) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index + (m[2] ? m[2].length : 0);
    if (start > last) parts.push(text.slice(last, start));
    if (m[1]) {
      let host = '';
      try {
        host = new URL(m[1]).hostname.replace(/^www\./, '');
      } catch {
        host = m[1];
      }
      parts.push(
        <a key={start} href={m[1]} target="_blank" rel="noopener noreferrer nofollow ugc" title={`External link to ${host}. Kotka staff will never ask you to log in or pay through a link.`} className="text-accent-700 underline decoration-accent-500/40 underline-offset-2 hover:decoration-accent-500 dark:text-accent-300">
          {host}
          {m[1].length > host.length + 12 ? '/…' : ''}
        </a>,
      );
    } else if (m[3]) {
      parts.push(<Link key={start} to={`/app/community/u/${m[3].slice(1).toLowerCase()}`} className="font-medium text-accent-700 hover:underline dark:text-accent-300">{m[3]}</Link>);
    } else {
      const raw = (m[4] ?? m[5]).replace(/[$/]/g, '').toUpperCase();
      if (SYMBOLS.includes(raw)) parts.push(<Link key={start} to={`/app/community/markets/${raw}`} className="font-mono text-[0.95em] font-medium text-accent-700 hover:underline dark:text-accent-300">{m[4] ?? m[5]}</Link>);
      else parts.push(m[0].trim());
    }
    last = start + (m[1] ?? m[3] ?? m[4] ?? m[5]).length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className ?? 'whitespace-pre-wrap break-words'}>{parts.map((p, i) => (typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : p))}</span>;
}
