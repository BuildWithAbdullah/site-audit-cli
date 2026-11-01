import { auditSecurity } from './checks/security.mjs';
import { auditSeo } from './checks/seo.mjs';

/**
 * The one place a pair side is turned into findings.
 *
 * The tests, the verifier and `tools/exit-codes.mjs` all need the same
 * answer to the same question, and three copies of this would be three
 * chances to disagree. It takes the modules as an argument rather than
 * reading a manifest, so nothing in here knows what a pair is.
 */
export const PAIR_ORIGIN = 'https://example.test';

export function responseFor(pathname, { html, meta }) {
  return {
    finalUrl: `${PAIR_ORIGIN}${pathname}`,
    status: meta.status ?? 200,
    headers: meta.headers ?? {},
    setCookie: meta.setCookie ?? [],
    body: html,
    isHtml: true,
    redirectChain: meta.redirectChain ?? [],
  };
}

/** id to severity, exactly as the real modules produced it. */
export async function findingsFor(response, modules, { fetchRobots = false } = {}) {
  const findings = [];
  if (modules.includes('security')) findings.push(...auditSecurity(response));
  if (modules.includes('seo')) findings.push(...(await auditSeo(response, { fetchRobots })));
  return findings;
}

export function asMap(findings) {
  const out = {};
  for (const f of findings) out[f.id] = f.severity;
  return out;
}
