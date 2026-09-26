// Stage 5: explain. The narrative is the only part of a report a language
// model touches, and it is fenced in:
//   - the model sees only the verified evidence pack and the rule-based scores;
//   - every number it writes must exist in that pack, or the field is rejected;
//   - trade-signal language is rejected;
//   - each statement is labeled FACT / SOURCE ASSESSMENT / KOTKA INTERPRETATION;
//   - any rejected or missing field falls back to deterministic rules text.

import { prisma } from '../prisma.js';
import { nvidiaChatCompletion } from '../nvidia.js';
import { VETTED_MODELS, connection, withModelFallback } from '../aiModels.js';

const KINDS = ['FACT', 'SOURCE ASSESSMENT', 'KOTKA INTERPRETATION'];

// First vetted narrative model; admins can prefer another in research settings,
// and a retired model falls through the chain in aiModels.js.
export const RESEARCH_DEFAULT_MODEL = VETTED_MODELS.narrative[0];
const NARRATIVE_BUDGET_MS = 100000;
const TRADE_LANGUAGE = /\b(buy|buying|sell|selling|go long|go short|long position|short position|going long|going short|entry point|enter a (?:long|short)|take[- ]profit|stop[- ]loss|price target|bullish|bearish|trade idea|should trade|appreciat\w*|depreciat\w*)\b/i;

// ── Consistency with the rule-based scores ────────────────────────────────
// Numbers can be checked mechanically; direction can too, approximately. A
// clause that credits a currency with a factor the scores say favours the
// other currency (or blames it for one it scores positively on) is rejected.
const CURRENCY_ALIASES = {
  USD: /\b(USD|dollar|U\.?S\.?|United States|Fed|Federal Reserve|American)\b/i,
  EUR: /\b(EUR|euro|euro area|eurozone|ECB)\b/i,
  GBP: /\b(GBP|pound|sterling|UK|U\.K\.|United Kingdom|British|BoE|Bank of England)\b/i,
  JPY: /\b(JPY|yen|Japan|Japanese|BoJ|Bank of Japan)\b/i,
  CHF: /\b(CHF|franc|Swiss|Switzerland|SNB)\b/i,
  CAD: /\b(CAD|Canadian|Canada|loonie|BoC)\b/i,
  AUD: /\b(AUD|Australian|Australia|aussie|RBA)\b/i,
  NZD: /\b(NZD|New Zealand|kiwi|RBNZ)\b/i,
};
const FACTOR_WORDS = {
  fiscal: /\b(fiscal|deficits?|debt)\b/i,
  growth: /\bgrowth\b|(?<!of )\bGDP\b/i, // "% of GDP" is a unit, not a growth claim
  external: /\b(current account|external position|external balance)\b/i,
  reserves: /\breserves?\b(?![- ]currency status)/i,
  inflation: /\binflation\b/i,
  financial_stability: /\b(financial stress|systemic stress|financial stability|CISS)\b/i,
};
const POSITIVE = /\b(support\w*|favou?r\w*|benefit\w*|advantage\w*|edge|strength\w*|stronger|backed|bolster\w*|helps?|underpin\w*|superior)\b/i;
const NEGATIVE = /\b(weigh\w*|drag|headwinds?|weak\w*|pressure\w*|vulnerab\w*|burden\w*|hurt\w*|undermin\w*)\b/i;
const CONCESSION = /^\s*(despite|although|though|even though|while|whereas|but|however|tempered|offset)\b/i;

const COMPARISON = /\b(than|versus|vs\.?|compared (?:to|with)|relative to)\b/i;

function clauses(text) {
  return String(text)
    .split(/(?<=[.;:])\s+/)
    .flatMap((sentence) => {
      // "While X, Y" / "Despite X, Y": X is a concession, Y is the claim.
      const lead = sentence.match(/^\s*(despite|although|though|even though|while|whereas)\b[^,]*,\s*/i);
      const parts = lead ? [lead[0], sentence.slice(lead[0].length)] : [sentence];
      return parts.flatMap((part) => part.split(/,?\s+(?=(?:despite|although|though|even though|whereas|but|however)\b)/i));
    });
}

// The currency a clause is about: the only one named, or in a comparison
// ("X is stronger than Y") the one named first.
function clauseSubject(clause, codes, isPair) {
  const hits = codes
    .map((c) => ({ c, i: clause.search(CURRENCY_ALIASES[c] ?? /$^/) }))
    .filter((h) => h.i >= 0)
    .sort((a, b) => a.i - b.i);
  if (hits.length === 1) return hits[0].c;
  if (hits.length > 1 && COMPARISON.test(clause)) return hits[0].c;
  if (!hits.length && !isPair) return codes[0];
  return null;
}

export function consistencyProblem(text, report) {
  const codes = Object.keys(report.currencies);
  const isPair = report.kind === 'pair';
  const favours = isPair ? Object.fromEntries(report.pair.factors.filter((f) => f.available).map((f) => [f.key, f.favors])) : {};
  for (const clause of clauses(text)) {
    if (CONCESSION.test(clause)) continue;
    const subject = clauseSubject(clause, codes, isPair);
    if (!subject) continue;
    const positive = POSITIVE.test(clause);
    const negative = NEGATIVE.test(clause);
    if (positive === negative) continue; // no clear direction
    const other = codes.find((c) => c !== subject);
    for (const [factor, words] of Object.entries(FACTOR_WORDS)) {
      if (!words.test(clause)) continue;
      const own = report.currencies[subject].factors[factor];
      if (!own?.available) continue;
      if (positive) {
        if (isPair && favours[factor] === other) return `credits ${subject} with ${factor.replace('_', ' ')}, which the scores favour ${other} on`;
        if (!isPair && own.score < 0) return `describes ${factor.replace('_', ' ')} as supportive although it scores ${own.score}`;
      }
      if (negative && own.score > 0) return `describes ${subject} ${factor.replace('_', ' ')} as a weakness although it scores +${own.score}`;
    }
  }
  return null;
}

const sign = (s) => (s > 0 ? `+${s}` : `${s}`);

// ── Evidence pack (what the model is allowed to know) ─────────────────────
export function buildEvidencePack(report) {
  const currencies = Object.values(report.currencies).map((c) => ({
    currency: c.code,
    name: c.name,
    fundamentalScore: c.score,
    band: c.band,
    condition: c.condition,
    confidence: c.confidence,
    direction: report.directions?.[c.code]?.label ?? null,
    centralBank: c.centralBank.name,
    inflationTarget: c.centralBank.targetText,
    policy: c.policy ? { rate: c.policy.display, stance: c.policy.stance, realRate: c.policy.realRate, changeOver6MonthsBp: c.policy.cum6m, lastChange: c.policy.lastChange } : null,
    marketExpectations: c.marketExpectations?.summary ?? null,
    factors: Object.values(c.factors).map((f) => ({
      key: f.key,
      label: f.label,
      score: f.available ? f.score : null,
      classification: f.classification,
      evidenceSummary: f.available ? f.rationale : f.unavailableReason,
    })),
    imfRevisions: c.revisions.slice(0, 8).map((r) => ({ indicator: r.label, year: r.year, previous: r.previous, current: r.current, revision: r.revision, previousVintage: r.previousVintage, currentVintage: r.currentVintage, kind: r.kind })),
    observations: Object.values(c.observations)
      .filter((o) => o.value !== null && o.value !== undefined)
      .map((o) => ({ id: o.id, label: o.label, value: o.value, unit: o.unit, period: o.periodLabel, dataType: o.dataType, source: o.source?.name })),
    centralBankStatement: report.centralBanks?.[c.code]?.statement
      ? { institution: c.centralBank.name, published: report.centralBanks[c.code].statement.publishedAt?.slice(0, 10), verbatimKeySentences: report.centralBanks[c.code].statement.keySentences }
      : null,
  }));
  return {
    subject: report.subject,
    kind: report.kind,
    currencies,
    pair: report.pair
      ? {
          relativeScore: report.pair.relativeScore,
          condition: report.pair.condition,
          confidence: report.pair.confidence,
          direction: report.directions?.[report.subject]?.label ?? null,
          factorComparison: report.pair.factors.map((f) => ({ key: f.key, label: f.label, [report.pair.base]: f.base, [report.pair.quote]: f.quote, favours: f.favors })),
          differentials: report.pair.differentials,
          marketExpectations: report.pair.market?.summary ?? null,
          spotPerformance: report.pair.marketPrice?.available ? { change1mPct: report.pair.marketPrice.change1m, change3mPct: report.pair.marketPrice.change3m } : null,
        }
      : null,
    upcomingCatalysts: report.catalysts.items.filter((c) => c.date).slice(0, 5).map((c) => ({ date: c.date.slice(0, 10), currency: c.currency, event: c.event })),
    invalidation: report.invalidation.map((i) => i.text),
  };
}

// ── Validation ────────────────────────────────────────────────────────────
function allowedNumberSet(pack) {
  const set = new Set();
  const text = JSON.stringify(pack);
  for (const m of text.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Math.abs(Number(m[0]));
    if (!Number.isFinite(n)) continue;
    set.add(String(n));
    for (const dp of [0, 1, 2]) set.add(n.toFixed(dp));
    set.add(String(Math.round(n * 100))); // pts → bp
  }
  return set;
}

function numbersIn(text) {
  return [...String(text).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

function checkText(text, allowed, report) {
  if (typeof text !== 'string' || !text.trim()) return 'empty';
  if (TRADE_LANGUAGE.test(text)) return 'contains trade-signal language';
  const inconsistent = report ? consistencyProblem(text, report) : null;
  if (inconsistent) return `contradicts the scores: ${inconsistent}`;
  for (const raw of numbersIn(text)) {
    const n = Number(raw);
    const dp = raw.includes('.') ? raw.split('.')[1].length : 0;
    if (!allowed.has(raw) && !allowed.has(n.toFixed(Math.min(dp, 2))) && !allowed.has(String(n))) return `unverified number "${raw}"`;
  }
  return null;
}

function parseModelJson(content) {
  const trimmed = String(content ?? '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model output');
  return JSON.parse(trimmed.slice(start, end + 1));
}

// ── Deterministic fallback narrative ──────────────────────────────────────
export function rulesNarrative(report) {
  const cur = Object.values(report.currencies);
  const why = [];
  if (report.kind === 'pair') {
    const p = report.pair;
    const top = [...p.factors].filter((f) => f.available && f.diff !== 0).sort((a, b) => Math.abs(b.weight * b.diff) - Math.abs(a.weight * a.diff)).slice(0, 3);
    for (const f of top) {
      const fav = f.diff > 0 ? p.base : p.quote;
      const detail = f.key === 'policy_differential' ? f.rationale : `${p.base} ${f.base === null ? 'n/a' : sign(f.base)} vs ${p.quote} ${f.quote === null ? 'n/a' : sign(f.quote)} (${report.currencies[fav].factors[f.key]?.classification ?? ''})`;
      why.push({ kind: 'KOTKA INTERPRETATION', text: `${f.label} favours ${fav}: ${detail}.`.replace('..', '.'), evidence: [] });
    }
  } else {
    for (const d of cur[0].drivers.slice(0, 3)) why.push({ kind: 'KOTKA INTERPRETATION', text: `${d.label} (${d.effect.toLowerCase()}): ${d.rationale}`, evidence: d.evidence.slice(0, 3) });
  }

  let bottomLine;
  if (report.kind === 'pair') {
    const p = report.pair;
    const [b, q] = [report.currencies[p.base], report.currencies[p.quote]];
    const fb = p.favorsBase.map((k) => p.factors.find((f) => f.key === k)?.label.toLowerCase()).slice(0, 3);
    const fq = p.favorsQuote.map((k) => p.factors.find((f) => f.key === k)?.label.toLowerCase()).slice(0, 3);
    bottomLine = [
      `${p.base} fundamentals score ${b.score}/100 (${b.band}) against ${q.score}/100 (${q.band}) for ${p.quote}, giving a relative reading of ${p.relativeScore}/100 — ${p.condition.toLowerCase()}.`,
      fb.length ? `The evidence favouring ${p.base} is concentrated in ${fb.join(', ')}.` : `No factor currently favours ${p.base} on Kotka's rules.`,
      fq.length ? `${p.quote} is favoured on ${fq.join(', ')}.` : `No factor currently favours ${p.quote} on Kotka's rules.`,
      p.market?.available ? p.market.summary : null,
      'This is macroeconomic context, not a trade signal.',
    ]
      .filter(Boolean)
      .join(' ');
  } else {
    const c = cur[0];
    bottomLine = [
      `${c.code} fundamentals score ${c.score}/100 (${c.band}) with ${c.confidence}% confidence.`,
      c.strongestPositive ? `The strongest support comes from ${c.strongestPositive.label.toLowerCase()}.` : 'No factor currently scores positively.',
      c.strongestNegative ? `The main drag is ${c.strongestNegative.label.toLowerCase()}.` : 'No factor currently scores negatively.',
      c.marketExpectations?.available ? c.marketExpectations.summary : null,
      'This is macroeconomic context, not a trade signal.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const biggestRisk = report.invalidation[0]?.text ?? null;
  const relativeView =
    report.kind === 'pair'
      ? {
          favorsBase: describeFavors(report, report.pair.base, report.pair.favorsBase),
          favorsQuote: describeFavors(report, report.pair.quote, report.pair.favorsQuote),
        }
      : null;
  return { why, bottomLine, biggestRisk, relativeView, driverNotes: {} };
}

function describeFavors(report, code, keys) {
  if (!keys.length) return `No factor currently favours ${code} on Kotka's rules.`;
  return keys
    .slice(0, 4)
    .map((k) => {
      if (k === 'policy_differential') return report.pair.factors.find((f) => f.key === k)?.rationale;
      const f = report.currencies[code].factors[k];
      return `${f.label}: ${f.classification ?? ''} (${sign(f.score)}).`;
    })
    .filter(Boolean)
    .join(' ');
}

// ── Model call ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Kotka Research, writing the narrative layer of an institutional macroeconomic research report inside the Kotka Trading platform.

You receive an evidence pack. Every number in it was retrieved from official sources (IMF, central banks, national statistics offices, BIS) and every score was produced by Kotka's deterministic rules. Your job is to explain, not to research or score.

Non-negotiable rules:
1. Use ONLY facts, numbers, dates and institutional statements present in the evidence pack. Never introduce any number, date, forecast, decision or institutional opinion that is not in the pack. If something is not in the pack, do not mention it.
2. Treat scores and classifications as given. Do not recompute or contradict them.
3. Label every statement with exactly one kind:
   - "FACT": verified data from the pack.
   - "SOURCE ASSESSMENT": what an institution explicitly projected or stated (IMF projections, central-bank statements) — always attribute it.
   - "KOTKA INTERPRETATION": your analytical reading of the evidence.
4. Never give trading advice. Do not use the words buy, sell, long, short, bullish, bearish, entry, stop-loss, take-profit or price target. Fundamentals are context, not a trade signal.
5. Institutional tone: precise, concise, no filler, no disclaimers. Do not use em-dashes or en-dashes; use commas, colons or full stops.

Respond with a single JSON object only — no prose before or after it.`;

function userPrompt(pack) {
  const schema = {
    why: [{ kind: 'FACT | SOURCE ASSESSMENT | KOTKA INTERPRETATION', text: 'one sentence', evidence: ['observation ids from the pack'] }],
    bottomLine: '3 to 5 sentences summarising the current fundamental environment (Kotka interpretation, no trade advice)',
    biggestRisk: 'one sentence naming the single development most likely to change this assessment, drawn from the invalidation list',
    driverNotes: { '<CURRENCY>.<factorKey>': 'one sentence on why this factor matters for the currency right now' },
    ...(pack.pair ? { relativeView: { favorsBase: '1-2 sentences: forces favouring the base currency', favorsQuote: '1-2 sentences: forces favouring the quote currency' } } : {}),
  };
  return `Evidence pack:\n${JSON.stringify(pack)}\n\nWrite the narrative for ${pack.subject}. "why" must contain exactly 3 items — the three most important reasons behind the ${pack.pair ? 'relative condition' : 'fundamental condition'}. Provide driverNotes for the 3-5 highest-impact factors only.\n\nJSON schema:\n${JSON.stringify(schema, null, 2)}`;
}

export async function getNarrativeModel(settings) {
  const integration = await prisma.integration.findUnique({ where: { provider: 'nvidia' } }).catch(() => null);
  if (!settings.aiNarrative) return { available: false, reason: 'AI narrative disabled by an administrator.' };
  if (!integration || !integration.enabled || !integration.secretCipher) return { available: false, reason: 'AI integration not configured.' };
  return { available: true, integration, preferred: settings.model?.trim() || undefined };
}

export async function generateNarrative(report, settings) {
  const fallback = rulesNarrative(report);
  const model = await getNarrativeModel(settings);
  if (!model.available) return { ...fallback, source: 'rules', model: null, validation: { accepted: [], rejected: [], note: model.reason } };


  const pack = buildEvidencePack(report);
  const allowed = allowedNumberSet(pack);
  let parsed;
  let usedModel = model.preferred ?? RESEARCH_DEFAULT_MODEL;
  const started = Date.now();
  // Hard budget so a run always finishes inside the 300s serverless limit,
  // however many models time out; past it, the rules narrative is used.
  const deadline = started + NARRATIVE_BUDGET_MS;
  const conn = connection(model.integration);
  const call = () =>
    withModelFallback(
      'narrative',
      model.integration,
      (m, settings) => {
        const remaining = deadline - Date.now();
        if (remaining < 5000) throw new Error('Narrative time budget exhausted');
        return nvidiaChatCompletion({
          ...conn,
          model: m,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt(pack) },
          ],
          maxTokens: 1600,
          temperature: 0.2,
          topP: settings.topP,
          extraBody: settings.extraBody,
          timeoutMs: Math.min(60000, remaining),
        });
      },
      { preferred: model.preferred },
    );

  // Retired or unavailable models fall through the chain inside
  // withModelFallback; a model that answers with no usable JSON gets one retry.
  let lastError = null;
  for (let attempt = 0; attempt < 2 && !parsed && Date.now() < deadline - 5000; attempt++) {
    try {
      const { result, model: m } = await call();
      usedModel = m;
      parsed = parseModelJson(result);
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, /\((429|503)\)/.test(err.message) ? 4000 : 500));
    }
  }
  if (!parsed) {
    return { ...fallback, source: 'rules', model: usedModel, validation: { accepted: [], rejected: [{ field: 'all', reason: `Model call failed: ${String(lastError?.message).slice(0, 160)}` }] }, latencyMs: Date.now() - started };
  }

  const accepted = [];
  const rejected = [];
  const out = { ...fallback, driverNotes: {} };
  const obsIds = new Set(Object.values(report.currencies).flatMap((c) => Object.keys(c.observations)));

  // why: need exactly 3 valid items, otherwise keep the rules version.
  if (Array.isArray(parsed.why)) {
    const items = parsed.why
      .map((w) => ({ kind: KINDS.includes(String(w?.kind).toUpperCase()) ? String(w.kind).toUpperCase() : null, text: w?.text, evidence: Array.isArray(w?.evidence) ? w.evidence.filter((id) => obsIds.has(id)) : [] }))
      .map((w) => ({ ...w, problem: w.kind ? checkText(w.text, allowed, report) : 'missing or invalid statement kind' }));
    const bad = items.filter((w) => w.problem);
    if (items.length >= 3 && !bad.length) {
      out.why = items.slice(0, 3).map(({ problem, ...w }) => w);
      accepted.push('why');
    } else {
      rejected.push({ field: 'why', reason: bad[0]?.problem ?? 'expected 3 items' });
    }
  }

  for (const field of ['bottomLine', 'biggestRisk']) {
    const problem = checkText(parsed[field], allowed, report);
    if (!problem) {
      out[field] = parsed[field].trim();
      accepted.push(field);
    } else rejected.push({ field, reason: problem });
  }

  if (parsed.driverNotes && typeof parsed.driverNotes === 'object') {
    for (const [k, v] of Object.entries(parsed.driverNotes)) {
      const problem = checkText(v, allowed, report);
      if (!problem) out.driverNotes[k] = v.trim();
      else rejected.push({ field: `driverNotes.${k}`, reason: problem });
    }
    if (Object.keys(out.driverNotes).length) accepted.push('driverNotes');
  }

  if (report.kind === 'pair' && parsed.relativeView) {
    for (const side of ['favorsBase', 'favorsQuote']) {
      const problem = checkText(parsed.relativeView[side], allowed, report);
      if (!problem) {
        out.relativeView = { ...out.relativeView, [side]: parsed.relativeView[side].trim() };
        accepted.push(`relativeView.${side}`);
      } else rejected.push({ field: `relativeView.${side}`, reason: problem });
    }
  }

  return {
    ...out,
    source: accepted.length ? 'ai' : 'rules',
    model: usedModel,
    fieldSources: Object.fromEntries(['why', 'bottomLine', 'biggestRisk', 'driverNotes', 'relativeView.favorsBase', 'relativeView.favorsQuote'].map((f) => [f, accepted.includes(f) ? 'ai' : 'rules'])),
    validation: { accepted, rejected },
    latencyMs: Date.now() - started,
  };
}

