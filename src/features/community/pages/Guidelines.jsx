import { ShieldCheck } from 'lucide-react';

const RULES = [
  ['Debate ideas, not people', 'Challenge the reasoning, the data or the risk. Personal attacks, harassment and bullying are removed.'],
  ['No scams or fake offers', 'No investment schemes, "account management", offers to pass prop-firm challenges for you or requests for money. Kotka never asks you to pay or send crypto in Community.'],
  ['No guaranteed-return claims', 'Nobody knows the future. Posts promising certain profits, "100% win rates" or risk-free returns are removed.'],
  ['No impersonation', 'Only accounts with the Kotka team badge speak for Kotka. Pretending to be staff, a broker or another trader leads to a ban.'],
  ['No market manipulation', 'No coordinated pumping, spreading false information to move prices, or undisclosed promotion.'],
  ['No spam or signal-selling', "Don't advertise paid groups, signal channels or off-platform contact. Trade ideas here are for discussion."],
  ['Respect disagreement', 'Different views are the point. Explain why you disagree and what would change your mind.'],
  ['Keep private things private', 'Never share passwords, login codes, seed phrases or anyone’s personal details.'],
];

export default function Guidelines() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-400"><ShieldCheck className="h-4 w-4" /> Community Guidelines</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">A place to understand the market, not to be sold to.</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">Kotka Community is for traders to discuss, challenge and document what is happening in the markets. Everything here is opinion, not investment advice. These rules keep it useful and safe.</p>
      </header>
      <ol className="space-y-3">
        {RULES.map(([t, d], i) => (
          <li key={t} className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <span className="font-mono text-sm font-semibold text-accent-600 dark:text-accent-400">{String(i + 1).padStart(2, '0')}</span>
            <span><span className="block font-semibold text-ink-900 dark:text-ink-50">{t}</span><span className="mt-1 block text-sm leading-relaxed text-ink-600 dark:text-ink-300">{d}</span></span>
          </li>
        ))}
      </ol>
      <section className="rounded-2xl border border-ink-100 bg-white p-6 text-sm leading-relaxed text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300">
        <h2 className="font-semibold text-ink-900 dark:text-ink-50">How moderation works</h2>
        <p className="mt-2">Report anything that breaks these rules from its menu. Messages that look like scams are flagged automatically and shown with a warning. Moderators can remove content, pause someone's posting, and administrators can suspend or ban accounts. Every action is logged.</p>
        <p className="mt-2">You can mute or block any trader from their profile. Blocking stops them messaging you and hides their content.</p>
      </section>
    </div>
  );
}
