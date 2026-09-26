export class ApiError extends Error {
  constructor(message, { status, code, fields, data } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.data = data;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The server gates app features until identity details are submitted;
    // the app shell listens for this and routes to the verification form.
    if (data?.code === 'kyc_required') window.dispatchEvent(new CustomEvent('kotka:kyc-required'));
    throw new ApiError(data?.error || `Request failed (${res.status})`, { status: res.status, code: data?.code, fields: data?.fields, data });
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
