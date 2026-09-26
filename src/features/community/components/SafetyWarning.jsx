import { ShieldAlert } from 'lucide-react';

// Shown on content that automatic screening flagged. The content stays
// visible; readers are told why to be careful.
export default function SafetyWarning({ warnings, compact = false }) {
  if (!warnings?.length) return null;
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'}`}>
      <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Be careful: this {warnings.join(', ')}. Kotka never guarantees returns, manages accounts or asks for payment in Community.
      </span>
    </div>
  );
}
