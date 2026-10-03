// Low-level fetch helpers shared by every research source adapter.
// Some official sites (IMF, BLS) block spoofed browser user agents, so we
// identify honestly and let Node's fetch send its default headers otherwise.

const USER_AGENT = 'KotkaResearch/1.0 (+https://www.kotkafinance.online)';

export async function fetchText(url, { timeoutMs = 20000, headers = {}, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
        err.status = res.status;
        // 4xx other than 429 won't improve on retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err;
        lastErr = err;
        continue;
      }
      return text;
    } catch (err) {
      lastErr = err;
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${new URL(url).host}`);
  }
}

// Minimal RFC-4180 CSV parser (quoted fields may contain commas/newlines).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&nbsp;': ' ', '&#160;': ' ', '&ndash;': '–', '&mdash;': '—' };

export function decodeEntities(s) {
  return s
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? (m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) : m));
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function toNumber(v) {
  if (v === undefined || v === null || v === '' || v === '.' || v === 'NaN') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
