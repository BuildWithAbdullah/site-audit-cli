/**
 * Severity is deliberately a small, fixed vocabulary shared by every module.
 *
 * It borrows axe-core's four levels rather than inventing a fifth, so an
 * accessibility finding and a security finding can sit in the same table and
 * mean the same thing by "serious". `info` is not a defect; it carries context
 * a human needs in order to judge something a machine cannot.
 */
export const SEVERITIES = ['critical', 'serious', 'moderate', 'minor', 'info'];

const RANK = new Map(SEVERITIES.map((s, i) => [s, i]));

export function rank(severity) {
  const r = RANK.get(severity);
  return r === undefined ? SEVERITIES.length : r;
}

export function bySeverity(a, b) {
  const d = rank(a.severity) - rank(b.severity);
  return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) {
    if (counts[f.severity] === undefined) counts[f.severity] = 0;
    counts[f.severity] += 1;
  }
  return counts;
}

/**
 * A finding is the only shape the reporters understand.
 *
 * `evidence` is a short, already-truncated string. Reporters never truncate,
 * because a reporter that silently cuts a selector in half produces a report
 * nobody can act on.
 */
export function finding({
  id,
  module,
  severity,
  title,
  detail,
  evidence = null,
  wcag = [],
  help = null,
  count = 1,
}) {
  if (!SEVERITIES.includes(severity)) {
    throw new TypeError(`unknown severity "${severity}" on finding ${id}`);
  }
  return { id, module, severity, title, detail, evidence, wcag, help, count };
}

export function truncate(text, max = 160) {
  if (typeof text !== 'string') return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
