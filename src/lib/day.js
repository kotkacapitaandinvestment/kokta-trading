// The trader's own calendar day as YYYY-MM-DD. Not UTC: just after midnight
// in Lagos it is still yesterday in UTC.
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
