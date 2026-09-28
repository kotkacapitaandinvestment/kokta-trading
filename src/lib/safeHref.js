// Links that come from data (news feeds, research sources, event calendars)
// are only rendered when they are ordinary web links, never javascript:,
// data: or anything else a browser might run.
export function safeHref(url) {
  if (typeof url !== 'string' || !url) return undefined;
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
