import { AxePuppeteer } from '@axe-core/puppeteer';
import { finding, truncate } from '../util/severity.mjs';
import { MANUAL_REGISTER, manualRegisterAsFindings } from '../manual-register.mjs';

/**
 * axe-core against the rendered page, plus the register of what axe cannot
 * reach.
 *
 * One deliberate departure from the defaults: the tag filter includes
 * `best-practice`. axe classifies the landmark rules as best practice rather
 * than as WCAG rules, so a scan filtered to WCAG tags alone returns nothing at
 * all on a page with no landmarks, no headings and no skip link. Filtering
 * them out produces a clean report on a page that is plainly unusable.
 */
const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const IMPACT_TO_SEVERITY = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

export async function auditAccessibility(page, { tags = DEFAULT_TAGS } = {}) {
  const results = await new AxePuppeteer(page).withTags(tags).analyze();

  const findings = results.violations.map((violation) =>
    finding({
      id: `a11y/${violation.id}`,
      module: 'accessibility',
      severity: IMPACT_TO_SEVERITY[violation.impact] || 'moderate',
      title: violation.help,
      detail: violation.description,
      evidence: truncate(
        violation.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | '),
        200,
      ),
      wcag: wcagFromTags(violation.tags),
      help: violation.helpUrl,
      count: violation.nodes.length,
    }),
  );

  return {
    findings: [...findings, ...manualRegisterAsFindings()],
    automated: {
      violations: results.violations.length,
      instances: results.violations.reduce((n, v) => n + v.nodes.length, 0),
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      manualChecks: MANUAL_REGISTER.length,
      tags,
    },
  };
}

/** axe tags look like `wcag143`; WCAG numbering is `1.4.3`. */
function wcagFromTags(tags) {
  return tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => t.slice(4).split('').join('.'));
}

export { DEFAULT_TAGS };
