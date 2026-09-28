// Scam and abuse screening for anything a trader writes in Community.
//
// block: the text is refused (payment requests with wallet details,
//   requests for account credentials, pretending to be Kotka staff).
// flags: the text is allowed but carries a visible warning for readers and
//   is queued for moderators (guaranteed returns, account management,
//   off-platform contact, signal selling, suspicious links).

const APP_HOSTS = new Set(['kokta-trading.vercel.app', 'localhost']);

const RULES = [
  { flag: 'guaranteed_returns', re: /\b(guarantee(d|s)?|assured|certain)\s+(profits?|returns?|income|wins?|gains?)\b|\brisk[- ]?free\s+(profits?|returns?|trad\w*|income)\b|\b(100|9\d)\s?%\s+(win|accuracy|success|sure)\b|\bdouble\s+your\s+(money|account|capital|funds|investment)\b|\b\d{1,3}\s?%\s+(daily|weekly|per\s+(day|week))\s+(returns?|profits?|roi)\b|\bnever\s+lose\b/i },
  { flag: 'account_management', re: /\b(account|fund|portfolio)\s+manag(ement|er)\b|\bmanage\s+(your\s+)?(accounts?|funds|capital|money|portfolios?)\b|\b(pass|passing)\s+your\s+(prop|funded|challenge)\b|\btrade\s+(for|on)\s+your\s+behalf\b/i },
  { flag: 'off_platform', re: /\b(whats\s?app|telegram|t\.me\/|wa\.me\/|signal\s+app|dm\s+me\s+on|text\s+me\s+on|inbox\s+me\s+on)\b/i },
  { flag: 'signal_selling', re: /\b(vip|premium|paid|private)\s+(signals?|group|channel|room)\b|\b(selling|sell|buy|join)\s+(my\s+)?signals?\b|\bsignal\s+(service|group|channel|provider|subscription)\b|\bcopy\s+my\s+trades\s+for\b/i },
  // International format (+country code), or a long number next to contact words.
  { flag: 'phone_number', re: /\+\d[\d\s().-]{8,16}\d|\b0\d{9,11}\b/, test: (t, m) => m.startsWith('+') || /\b(call|text|whats\s?app|telegram|contact|reach|dm|message|phone|number)\b/i.test(t) },
];

const PAYMENT = /\b(send|pay|deposit|transfer|fund)\s+(me\s+)?(\$?\d[\d,.]*\s*[km]?\s*)?(\$|usd|usdt|usdc|btc|eth|money|funds|crypto|the\s+fee|a\s+fee)|\b(registration|activation|withdrawal|unlock)\s+fee\b/i;
const WALLET = /\b(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})\b/;
const CREDENTIALS = /\b(send|share|give|tell)\s+(me\s+)?(your\s+)?(password|login|log-?in details|mt[45]\s+(login|password|details)|seed\s+phrase|private\s+key|2fa|otp|verification\s+code)\b/i;
const IMPERSONATION = /\b(i\s+am|i'm|im|this\s+is|we\s+are|from)\s+(the\s+|a\s+|an\s+)?(kotka)\s+(team|admin|support|staff|moderator|official)\b|\bofficial\s+kotka\b/i;
const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rb\.gy|cutt\.ly|shorturl\.at|tiny\.cc)$/i;

// One sentence per flag, shown to readers under the content.
export const FLAG_LABELS = {
  guaranteed_returns: 'It promises guaranteed or risk-free profits. No one can promise that.',
  account_management: 'It offers to manage your account or trade for you.',
  off_platform: 'It asks you to continue the conversation outside Kotka.',
  signal_selling: 'It advertises paid signals or groups.',
  phone_number: 'It includes a phone number.',
  suspicious_link: 'It has a shortened or look-alike link. Check where a link goes before you tap it.',
  payment_request: 'It asks for money or shares a wallet address.',
};

function linkFlags(text) {
  const flags = [];
  for (const m of text.matchAll(/\bhttps?:\/\/([^\s/?#]+)[^\s]*/gi)) {
    const host = m[1].toLowerCase().replace(/^www\./, '');
    if (APP_HOSTS.has(host)) continue;
    if (SHORTENERS.test(host) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host) || /k[o0]tka/i.test(host) || /xn--/.test(host)) flags.push('suspicious_link');
  }
  return flags;
}

// Returns { blocked: reason | null, flags: string[] }.
export function screenText(text, { staff = false } = {}) {
  const t = String(text ?? '');
  if (!t.trim()) return { blocked: null, flags: [] };
  if (!staff && IMPERSONATION.test(t)) return { blocked: 'Only Kotka staff can speak for Kotka. Please reword your message.', flags: [] };
  if (CREDENTIALS.test(t)) return { blocked: 'For everyone’s safety, Kotka doesn’t allow asking for passwords, logins or security codes. Please edit your message.', flags: [] };
  if (PAYMENT.test(t) && WALLET.test(t)) return { blocked: 'For everyone’s safety, Kotka doesn’t allow asking for payment to a wallet address. Please edit your message.', flags: [] };
  const flags = new Set(linkFlags(t));
  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (m && (!rule.test || rule.test(t, m[0]))) flags.add(rule.flag);
  }
  if (PAYMENT.test(t) || WALLET.test(t)) flags.add('payment_request');
  return { blocked: null, flags: [...flags] };
}

// Flags that are worth a moderator's look (queued automatically).
export const REVIEW_FLAGS = new Set(['guaranteed_returns', 'account_management', 'signal_selling', 'suspicious_link', 'payment_request']);
