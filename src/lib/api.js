export class ApiError extends Error {
  constructor(message, { status, code, fields, data } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.data = data;
  }
}

// Messages people see when something fails. The server's own messages are
// already written for people; these cover the cases where it sends none, a
// generic one, or a code.
const FRIENDLY = {
  401: 'Your session has ended. Please sign in again.',
  403: 'You don’t have access to this.',
  404: 'We couldn’t find that. It may have been removed.',
  413: 'That file is too large. Try a smaller one.',
  429: 'You’re going a bit fast. Wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again in a minute.',
};
const GENERIC = new Set(['Internal server error', 'Not authenticated', 'Forbidden', 'Not found', 'Unauthorized', 'Bad request']);
const OFFLINE = 'Can’t reach Kotka. Check your connection and try again.';

export function friendlyMessage(status, message) {
  if (message && !GENERIC.has(message) && !/^[a-z0-9_]+$/.test(message)) return message;
  return FRIENDLY[status] ?? (status >= 500 ? FRIENDLY[500] : 'That didn’t work. Please try again.');
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new ApiError(OFFLINE, { status: 0, code: 'offline' });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The server gates app features until identity details are submitted;
    // the app shell listens for this and routes to the verification form.
    if (data?.code === 'kyc_required') window.dispatchEvent(new CustomEvent('kotka:kyc-required'));
    throw new ApiError(friendlyMessage(res.status, data?.error), { status: res.status, code: data?.code ?? (typeof data?.error === 'string' && /^[a-z0-9_]+$/.test(data.error) ? data.error : undefined), fields: data?.fields, data });
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path, body) => request(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) }),
};
