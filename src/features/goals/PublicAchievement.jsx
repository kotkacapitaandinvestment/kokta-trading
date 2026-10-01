import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Award, BadgeCheck, CalendarCheck, Flame, PenLine, Target, Trophy } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { CardPreview } from './AchievementCard';
import { formatDay } from './card';

// Public achievement page: /achievement/:slug. Shows only what the trader
// chose to share, and invites the visitor to build their own record.
export default function PublicAchievement() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));

  useEffect(() => {
    fetch(`/api/public/achievements/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 404 ? 'This link was removed or has expired.' : 'We couldn’t load this achievement. Please try again later.');
        setData(j);
      })
      .catch((err) => setError(err.message));
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [slug]);

  const snap = data?.snapshot;
  const stat = (key) => snap?.fields?.find((f) => f.key === key);
  const hero = snap?.fields?.find((f) => f.kind === 'hero');
  const facts = snap
    ? [
        ...(hero ? [{ icon: Trophy, label: hero.label, value: `${hero.value}${hero.unit && /^\d+$/.test(hero.value) ? ` ${hero.unit.toLowerCase()}` : ''}` }] : []),
        ...(snap.fields.find((f) => f.kind === 'badges')?.value ?? []).map((b) => ({ icon: BadgeCheck, label: 'Badge', value: b })),
        ...(['streak', 'monthStreak'].map(stat).filter(Boolean).map((f) => ({ icon: Flame, label: f.label, value: f.value }))),
        ...(['discipline', 'goalDiscipline', 'monthDiscipline'].map(stat).filter(Boolean).map((f) => ({ icon: Target, label: f.label, value: f.value }))),
        ...(stat('level') ? [{ icon: Award, label: 'Level', value: stat('level').value }] : []),
        { icon: CalendarCheck, label: 'Achievement date', value: formatDay(snap.date) },
      ]
    : [];

  return (
    <div className="on-dark min-h-[100dvh] bg-ink-950 text-ink-100" style={{ background: 'radial-gradient(ellipse 60% 40% at 20% 0%, rgba(209,168,91,0.12), transparent 60%), #050504' }}>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5"><BrandMark size={30} /><span className="text-sm font-semibold tracking-[0.3em] text-accent-100">KOTKA</span></Link>
        <Link to={user ? '/app/goals' : '/signup'} className="rounded-lg border border-accent-500/50 px-3 py-1.5 text-xs font-medium text-accent-100 hover:bg-white/5">{user ? 'Your Goal Room' : 'Join Kotka'}</Link>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:pt-10">
        {error ? (
          <div className="py-24 lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-400">Kotka achievement</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#FBF3E4]">{error}</h1>
            <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent-300 hover:underline">Visit Kotka <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : !snap ? (
          <div className="h-96 animate-pulse rounded-2xl bg-white/5 lg:col-span-2" />
        ) : (
          <>
            <div className="order-2 lg:order-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent-400">Kotka achievement</p>
              <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-[#FBF3E4] sm:text-4xl">{snap.sentence}</h1>
              <dl className="mt-8 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
                {facts.map((f, i) => (
                  <div key={`${f.label}-${i}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                    <div className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">{f.label}</dt>
                      <dd className="text-sm font-medium text-ink-100">{f.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
              <p className="mt-6 flex max-w-lg items-start gap-2 text-xs leading-relaxed text-ink-400">
                {snap.verification === 'verified' ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" /> : <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />}
                {snap.verification === 'verified'
                  ? 'Verified: confirmed through a connected broker account.'
                  : 'Self-reported: the trader logged this in Kotka through daily check-ins, goals and their journal. It has not been verified with a broker.'}
              </p>

              <div className="mt-10 max-w-lg rounded-2xl border border-accent-500/25 bg-white/[0.03] p-5">
                <p className="text-sm font-semibold text-[#FBF3E4]">Build a record you’re proud to show.</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-300">Kotka’s Goal Room is for traders who want discipline, not a lucky screenshot: set a goal, lock it, check in every trading day and let the streak speak.</p>
                <Link to={user ? '/app/goals' : '/signup'} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-400">
                  {user ? 'View your Goal Room' : 'Join Kotka and set your goal'} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="order-1 flex justify-center lg:order-2">
              <CardPreview snap={snap} format="4:5" maxWidth={Math.min(460, width - 40)} maxHeight={600} />
            </div>
          </>
        )}
      </main>
      <footer className="border-t border-white/5 px-5 py-6 text-center text-[11px] text-ink-500">Kotka Trading · Discipline is freedom. Achievements are the trader’s own record, not investment advice.</footer>
    </div>
  );
}
