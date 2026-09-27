import { forwardRef } from 'react';
import { BadgeCheck, Check, Medal, PenLine, Trophy, X } from 'lucide-react';
import { FORMATS, ICONS, formatDay } from './card';

// The shareable Kotka achievement certificate. Rendered at its real pixel
// size (1080 or 1600 wide) so the exported image is exactly this element;
// previews scale it down with CSS. Inline styles keep the export faithful.
const C = {
  bg: '#070706',
  gold: '#E4C078',
  goldBright: '#F4D48E',
  goldDeep: '#B58637',
  bronze: '#936E33',
  champagne: '#EDD4A0',
  ivory: '#FBF3E4',
  muted: 'rgba(237, 212, 160, 0.62)',
  faint: 'rgba(237, 212, 160, 0.38)',
  line: 'rgba(228, 192, 120, 0.38)',
};
const SANS = '"Geist Variable", Geist, ui-sans-serif, system-ui, sans-serif';
const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace';

const LAYOUT = {
  '1:1': { pad: 88, frame: 30, headline: 90, hero: 150, stats: 4, statCols: 4, gap: 1, t: 1 },
  '4:5': { pad: 92, frame: 32, headline: 98, hero: 176, stats: 4, statCols: 2, gap: 1.2, t: 1.1 },
  '9:16': { pad: 100, frame: 34, headline: 124, hero: 250, stats: 6, statCols: 2, gap: 1.6, t: 1.3 },
  '16:9': { pad: 84, frame: 30, headline: 86, hero: 150, stats: 4, statCols: 2, gap: 1, t: 1 },
};

const fit = (text, base) => {
  const n = String(text ?? '').length;
  return Math.round(base * (n <= 16 ? 1 : n <= 26 ? 0.8 : n <= 40 ? 0.66 : 0.54));
};

function Rule({ style }) {
  return <div style={{ height: 1.5, background: `linear-gradient(90deg, transparent, ${C.goldBright}, ${C.goldDeep}, ${C.goldBright}, transparent)`, opacity: 0.85, ...style }} />;
}

function Corners({ inset }) {
  const s = 26;
  const b = `2px solid ${C.gold}`;
  const at = [
    { top: inset, left: inset, borderTop: b, borderLeft: b },
    { top: inset, right: inset, borderTop: b, borderRight: b },
    { bottom: inset, left: inset, borderBottom: b, borderLeft: b },
    { bottom: inset, right: inset, borderBottom: b, borderRight: b },
  ];
  return at.map((pos, i) => <div key={i} style={{ position: 'absolute', width: s, height: s, ...pos }} />);
}

function Verification({ value, t = 1 }) {
  const verified = value === 'verified';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 * t, padding: `${10 * t}px ${18 * t}px`, borderRadius: 999, border: `1.5px solid ${verified ? C.gold : 'rgba(228,192,120,0.45)'}`, background: verified ? C.gold : 'transparent', color: verified ? C.bg : C.champagne, fontSize: 17 * t, fontWeight: 600, letterSpacing: '0.2em' }}>
      {verified ? <BadgeCheck size={20 * t} strokeWidth={2.25} /> : <PenLine size={18 * t} strokeWidth={2} />}
      {verified ? 'VERIFIED' : 'SELF-REPORTED'}
    </div>
  );
}

const numeric = (v) => /^[\d\s.,%+\-−·→$€£¥]+$/.test(String(v));

function Stat({ f, t = 1 }) {
  const long = String(f.value).length > 34;
  const mono = numeric(f.value);
  return (
    <div style={{ padding: `${18 * t}px ${22 * t}px`, borderLeft: `1.5px solid ${C.line}`, gridColumn: long ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 16 * t, letterSpacing: '0.2em', color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{String(f.label).replace(/-/g, '\u2011')}</div>
      <div style={{ marginTop: 8 * t, fontSize: (long ? 24 : mono ? 40 : 34) * t, lineHeight: 1.2, color: C.ivory, fontWeight: long ? 400 : 600, fontFamily: mono && !long ? MONO : SANS, letterSpacing: long ? 0 : '-0.02em' }}>{f.value}</div>
    </div>
  );
}

function Checks({ items, scale = 1 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 * scale }}>
      {items.map((c) => (
        <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 32 * scale, color: c.ok ? C.ivory : C.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44 * scale, height: 44 * scale, borderRadius: 999, border: `2px solid ${c.ok ? C.gold : C.faint}`, color: c.ok ? C.goldBright : C.faint }}>
            {c.ok ? <Check size={26 * scale} strokeWidth={2.5} /> : <X size={24 * scale} strokeWidth={2.5} />}
          </span>
          {c.label}
        </div>
      ))}
    </div>
  );
}

function Timeline({ items, scale = 1 }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 42 }}>
      <div style={{ position: 'absolute', left: 13, top: 14, bottom: 14, width: 2, background: `linear-gradient(${C.goldDeep}, ${C.gold})`, opacity: 0.6 }} />
      {items.map((e, i) => {
        const Icon = e.final ? Trophy : ICONS[e.icon] ?? Medal;
        return (
          <div key={`${e.date}-${i}`} style={{ position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 22 * scale }}>
            <span style={{ position: 'absolute', left: -42, top: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: e.final ? C.gold : C.bg, border: `2px solid ${C.gold}`, color: e.final ? C.bg : C.gold }}>
              <Icon size={15} strokeWidth={2.25} />
            </span>
            <div style={{ fontFamily: MONO, fontSize: 18 * scale, color: C.muted, letterSpacing: '0.04em' }}>{formatDay(e.date, { day: 'numeric', month: 'short' })}</div>
            <div style={{ fontSize: 28 * scale, color: e.final ? C.goldBright : C.ivory, fontWeight: e.final ? 600 : 500, marginTop: 2 }}>{e.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function Badges({ names, t = 1 }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 * t }}>
      {names.map((n) => (
        <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${10 * t}px ${20 * t}px`, borderRadius: 999, border: `1.5px solid rgba(228,192,120,0.55)`, color: C.champagne, fontSize: 22 * t, fontWeight: 500 }}>
          <Medal size={20 * t} strokeWidth={2} color={C.gold} /> {n}
        </span>
      ))}
    </div>
  );
}

const AchievementCard = forwardRef(function AchievementCard({ snap, format = '1:1' }, ref) {
  const size = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
  const L = LAYOUT[format] ?? LAYOUT['1:1'];
  const wide = format === '16:9';
  const Icon = ICONS[snap.icon] ?? Medal;
  const pick = (kind) => snap.fields.filter((f) => f.kind === kind);
  const hero = pick('hero')[0];
  const period = pick('period')[0];
  const badges = pick('badges')[0];
  const checks = pick('checks')[0];
  const timeline = pick('timeline')[0];
  const note = pick('note')[0];
  const stats = snap.fields.filter((f) => f.kind === 'stat').slice(0, L.stats);
  const who = snap.identity?.username ? `@${snap.identity.username}` : snap.identity?.name ?? 'A Kotka trader';
  const g = L.gap;

  const heading = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 62 * L.t, height: 62 * L.t, borderRadius: 999, border: `1.5px solid ${C.gold}`, color: C.goldBright, background: 'rgba(228,192,120,0.06)' }}>
          <Icon size={30 * L.t} strokeWidth={1.75} />
        </span>
        <span style={{ fontSize: 25 * L.t, letterSpacing: '0.34em', fontWeight: 600, color: C.gold }}>{snap.eyebrow}</span>
      </div>
      <div style={{ marginTop: 30 * g, fontSize: fit(snap.headline, L.headline), fontWeight: 600, lineHeight: 1.04, letterSpacing: '-0.025em', color: C.ivory }}>{snap.headline}</div>
      {period || snap.subline ? <div style={{ marginTop: 16 * L.t, fontSize: 28 * L.t, color: C.muted, letterSpacing: '0.02em' }}>{[snap.subline, period?.value].filter(Boolean).join(' · ')}</div> : null}
      {hero ? (
        <div style={{ marginTop: 34 * g }}>
          {numeric(hero.value) ? (
            <div style={{ fontFamily: MONO, fontSize: String(hero.value).length > 9 ? L.hero * 0.55 : String(hero.value).length > 5 ? L.hero * 0.7 : L.hero, lineHeight: 0.95, fontWeight: 500, letterSpacing: '-0.045em', color: C.goldBright }}>{hero.value}</div>
          ) : (
            // A status in words ("GOALS COMPLETED"): set like a title, not a number.
            <div style={{ fontFamily: SANS, fontSize: Math.round(L.hero * (String(hero.value).length > 16 ? 0.34 : 0.42)), lineHeight: 1.05, fontWeight: 600, letterSpacing: '0.04em', color: C.goldBright }}>{hero.value}</div>
          )}
          <div style={{ marginTop: 12 * L.t, fontSize: 19 * L.t, letterSpacing: '0.3em', color: C.muted, fontWeight: 600 }}>{hero.unit}</div>
        </div>
      ) : null}
    </div>
  );

  const detail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 * g }}>
      {checks ? <Checks items={checks.value} scale={{ '9:16': 1.5, '4:5': 1.2 }[format] ?? 1} /> : null}
      {timeline ? <Timeline items={timeline.value.slice(0, format === '9:16' ? 8 : wide || format === '1:1' ? 5 : 6)} scale={{ '9:16': 1.35, '4:5': 1.1 }[format] ?? 0.95} /> : null}
      {stats.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(L.statCols, stats.length)}, minmax(0, 1fr))`, rowGap: 18, marginLeft: -2 }}>
          {stats.map((f) => <Stat key={f.key} f={f} t={L.t} />)}
        </div>
      ) : null}
      {badges ? <Badges names={badges.value} t={L.t} /> : null}
      {note ? <div style={{ fontSize: 24 * L.t, lineHeight: 1.45, color: C.champagne, fontStyle: 'italic', borderLeft: `2px solid ${C.gold}`, paddingLeft: 20 }}>“{note.value}”</div> : null}
    </div>
  );

  return (
    <div
      ref={ref}
      style={{
        width: size.width,
        height: size.height,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: SANS,
        color: C.champagne,
        background: `radial-gradient(ellipse 70% 55% at 12% 0%, rgba(209,168,91,0.17), transparent 60%), radial-gradient(ellipse 65% 55% at 100% 100%, rgba(101,79,47,0.38), transparent 62%), ${C.bg}`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0 2px, transparent 2px 7px)' }} />
      <div style={{ position: 'absolute', inset: L.frame, border: `1.5px solid ${C.line}`, borderRadius: 6 }} />
      <div style={{ position: 'absolute', inset: L.frame + 10, border: '1px solid rgba(228,192,120,0.12)', borderRadius: 4 }} />
      <Corners inset={L.frame + 10} />

      <div style={{ position: 'absolute', inset: L.pad, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/brand/kotka-mark-128.png" alt="" width={54 * L.t} height={54 * L.t} style={{ width: 54 * L.t, height: 54 * L.t }} />
            <span style={{ fontSize: 27 * L.t, letterSpacing: '0.46em', fontWeight: 600, color: C.champagne }}>KOTKA</span>
          </div>
          <Verification value={snap.verification} t={L.t} />
        </div>

        {wide ? (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 64, alignItems: 'center', minHeight: 0 }}>
            {heading}
            {detail}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44 * g, minHeight: 0 }}>
            {heading}
            {detail}
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <Rule style={{ flex: 1 }} />
            <span style={{ fontSize: 19 * L.t, letterSpacing: '0.38em', fontWeight: 600, color: C.gold, whiteSpace: 'nowrap' }}>{snap.motto}</span>
            <Rule style={{ flex: 1 }} />
          </div>
          <div style={{ marginTop: 22 * L.t, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 22 * L.t }}>
            <span style={{ color: C.ivory, fontWeight: 500 }}>{who}</span>
            <span style={{ fontFamily: MONO, color: C.muted, fontSize: 19 * L.t }}>{formatDay(snap.date)}</span>
            <span style={{ letterSpacing: '0.3em', color: C.gold, fontSize: 18 * L.t, fontWeight: 600 }}>KOTKA TRADING</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AchievementCard;

// Scaled-down live preview of a card.
export function CardPreview({ snap, format, maxWidth = 420, maxHeight = 560, className }) {
  const size = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
  return (
    <div className={className} style={{ width: size.width * scale, height: size.height * scale, overflow: 'hidden', borderRadius: 12, boxShadow: '0 20px 50px rgba(5,5,4,0.35)' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: size.width, height: size.height }}>
        <AchievementCard snap={snap} format={format} />
      </div>
    </div>
  );
}
