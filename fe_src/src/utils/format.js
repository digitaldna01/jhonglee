export const pad2 = (n) => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-09-27" → "Sep 2024"; falls back to the raw string for non-ISO dates */
export function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
