import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AtSign, Bell, CalendarClock, CheckCheck, CornerDownRight, Heart, Landmark, LineChart, ListChecks, Megaphone, MessageSquare, NotebookPen, ShieldAlert, ShieldCheck, Sparkles, TrendingUp, Trophy, UserPlus, Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import PushNudge from '../../components/PushNudge';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { usePersistedState } from '../../lib/usePersistedState';
import { api } from '../../lib/api';
import { useCommunity } from '../community/CommunityContext';
import { useRealtime } from '../community/realtime';
import { Avatar } from '../community/components/Identity';

const ICON = {
  checklist: ListChecks, journal: NotebookPen, risk: ShieldAlert, announcement: Megaphone,
  message: MessageSquare, mention: AtSign, reply: CornerDownRight, follow: UserPlus, reaction: Heart, comment: MessageSquare,
  challenge: ShieldCheck, idea: TrendingUp, event: CalendarClock, market: LineChart, news: Landmark, moderation: ShieldAlert, group: Users, achievement: Trophy,
};
const GROUPS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['community', 'Community'],
  ['messages', 'Messages'],
  ['markets', 'Markets'],
  ['reminders', 'Reminders'],
];
const GROUP_OF = { message: 'messages', group: 'messages', mention: 'community', reply: 'community', follow: 'community', reaction: 'community', comment: 'community', challenge: 'community', idea: 'community', moderation: 'community', event: 'markets', market: 'markets', news: 'markets', checklist: 'reminders', journal: 'reminders', risk: 'reminders', announcement: 'reminders', achievement: 'community' };

function ago( at ) {
  if ( !/^\d{4}-\d{2}-\d{2}T/.test( at ?? '' ) ) return at;
  const m = Math.round( ( Date.now() - new Date( at ).getTime() ) / 60000 );
  if ( m < 1 ) return 'now';
  if ( m < 60 ) return `${m}m ago`;
  if ( m < 1440 ) return `${Math.round( m / 60 )}h ago`;
  return new Date( at ).toLocaleDateString( undefined, { day: 'numeric', month: 'short' } );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { setUnread } = useCommunity();
  const [items, setItems] = useState( null );
  const [readIds, setReadIds] = usePersistedState( 'notifications.readIds', [] );
  const [filter, setFilter] = useState( 'all' );

  const load = async () => {
    const [reminders, community] = await Promise.all( [
      api.get( '/me/notifications' ).then( ( r ) => r.notifications ).catch( () => [] ),
      api.get( '/community/notifications?limit=60' ).then( ( r ) => r.notifications ).catch( () => [] ),
    ] );
    const merged = [
      ...community.map( ( n ) => ( { ...n, source: 'community', time: n.at } ) ),
      // Computed reminders are per day; their read state stays on this device.
      ...reminders.map( ( n ) => ( { ...n, source: 'reminder', read: readIds.includes( n.id ) } ) ),
    ].sort( ( a, b ) => ( /T/.test( b.time ?? '' ) ? new Date( b.time ) : Date.now() ) - ( /T/.test( a.time ?? '' ) ? new Date( a.time ) : Date.now() ) );
    setItems( merged );
  };
  useEffect( () => { load(); }, [] ); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime( 'notification', () => load() );

  const syncUnread = ( list ) => setUnread( { notifications: list.filter( ( n ) => n.source === 'community' && !n.read ).length } );

  const markAllRead = async () => {
    await api.post( '/community/notifications/read', { all: true } ).catch( () => { } );
    setReadIds( ( prev ) => [...new Set( [...prev, ...( items ?? [] ).filter( ( n ) => n.source === 'reminder' ).map( ( n ) => n.id )] )] );
    const next = ( items ?? [] ).map( ( n ) => ( { ...n, read: true } ) );
    setItems( next );
    syncUnread( next );
  };

  const open = async ( n ) => {
    if ( n.source === 'community' ) {
      if ( !n.read ) await api.post( '/community/notifications/read', { ids: [n.id] } ).catch( () => { } );
    } else setReadIds( ( prev ) => ( prev.includes( n.id ) ? prev : [...prev, n.id] ) );
    const next = items.map( ( x ) => ( x.id === n.id ? { ...x, read: true } : x ) );
    setItems( next );
    syncUnread( next );
    if ( n.link ) navigate( n.link );
  };

  const filtered = ( items ?? [] ).filter( ( n ) => filter === 'all' || ( filter === 'unread' ? !n.read : GROUP_OF[n.type] === filter ) );

  return (
    <div>
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Mentions, replies and follows from Community, market moves and events you follow, announcements, and today's discipline reminders."
        actions={<Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAllRead}>Mark all read</Button>}
      />
      <PushNudge className="mb-4" />
      <div className="mb-4 flex flex-wrap gap-2">
        {GROUPS.map( ( [v, l] ) => (
          <button key={v} type="button" onClick={() => setFilter( v )} className={clsx( 'rounded-full px-3 py-1.5 text-xs font-medium transition-colors', filter === v ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300' )}>{l}</button>
        ) )}
        <button type="button" onClick={() => navigate( '/app/settings?section=notifications' )} className="ml-auto text-xs font-medium text-accent-700 hover:underline dark:text-accent-300">Notification settings</button>
      </div>
      {!items ? <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-ink-900" /> : !filtered.length ? (
        <EmptyState icon={Sparkles} title="You're all caught up" description="No notifications match this filter." />
      ) : (
        <Card className="divide-y divide-ink-100 dark:divide-ink-800/60">
          {filtered.map( ( n ) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <button key={`${n.source}-${n.id}`} type="button" onClick={() => open( n )} className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/40">
                {n.actor ? (
                  <span className="relative"><Avatar user={n.actor} size={36} /><span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-ink-100 dark:bg-ink-900 dark:ring-ink-700"><Icon className="h-2.5 w-2.5 text-accent-600" /></span></span>
                ) : (
                  <span className={clsx( 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-ink-50 dark:bg-ink-800' : 'bg-accent-50 dark:bg-accent-900/20' )}><Icon className={clsx( 'h-4 w-4', n.read ? 'text-ink-400' : 'text-accent-600 dark:text-accent-400' )} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={clsx( 'text-sm', n.read ? 'text-ink-600 dark:text-ink-300' : 'font-medium text-ink-900 dark:text-ink-50' )}>{n.title}{n.count > 1 ? <span className="ml-1 text-xs font-normal text-ink-400">and {n.count - 1} more</span> : null}</span>
                    <span className="shrink-0 text-xs text-ink-400">{ago( n.time )}</span>
                  </span>
                  {n.body ? <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-xs leading-relaxed text-ink-500 dark:text-ink-400">{n.body}</span> : null}
                </span>
                {!n.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-label="Unread" /> : null}
              </button>
            );
          } )}
        </Card>
      )}
    </div>
  );
}
