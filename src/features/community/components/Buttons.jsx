import { useState } from 'react';
import clsx from 'clsx';
import { Bookmark, BookmarkCheck, Check, Plus } from 'lucide-react';
import { api } from '../../../lib/api';
import { confirmDialog, promptDialog, toast } from '../../../lib/dialogs';

export function FollowButton({ targetType, targetId, following: initial, onChange, size = 'sm', className, labels = ['Follow', 'Following'] }) {
  const [following, setFollowing] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (following) await api.delete('/community/follow', { targetType, targetId });
      else await api.post('/community/follow', { targetType, targetId });
      setFollowing(!following);
      onChange?.(!following);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        following ? 'border border-ink-200 text-ink-700 hover:border-loss-400 hover:text-loss-600 dark:border-ink-700 dark:text-ink-200' : 'bg-ink-900 text-white hover:bg-ink-800 dark:bg-accent-500 dark:text-ink-950 dark:hover:bg-accent-400',
        className,
      )}
    >
      {following ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {following ? labels[1] : labels[0]}
    </button>
  );
}

export function SaveButton({ itemType, itemId, saved: initial, className }) {
  const [saved, setSaved] = useState(!!initial);
  const toggle = async () => {
    try {
      if (saved) await api.delete('/community/saved', { itemType, itemId });
      else await api.post('/community/saved', { itemType, itemId });
      setSaved(!saved);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save'} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors', saved ? 'text-accent-700 dark:text-accent-300' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100', className)}>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}
