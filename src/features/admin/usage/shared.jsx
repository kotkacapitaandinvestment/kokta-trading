import Badge from '../../../components/ui/Badge';

// Plain-language names for ledger statuses.
export const STATUS = {
  consumed: { label: 'Counted', tone: 'accent' },
  pending: { label: 'In progress', tone: 'neutral' },
  abandoned: { label: 'Interrupted (counted)', tone: 'warning' },
  released: { label: 'Not counted: no cost', tone: 'neutral' },
  failed: { label: 'Failed: not counted', tone: 'loss' },
  blocked: { label: 'Refused: limit reached', tone: 'warning' },
};

export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS[status]?.tone ?? 'neutral'} className="whitespace-nowrap">
    {STATUS[status]?.label ?? status}
  </Badge>
);

export const n = (v) => Number(v ?? 0).toLocaleString();
export const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
export const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const dateOnly = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
export const limitText = (v) => (v === null || v === undefined ? 'No limit' : n(v));
export const unit = (u, count) => (u ? u[count === 1 ? 0 : 1] : '');
