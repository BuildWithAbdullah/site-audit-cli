import { countBySeverity } from './util/severity.mjs';

export const DEFAULT_BUDGETS = {
  accessibility: { critical: 0, serious: 0 },
  performance: { lcpMs: 2500, clsScore: 0.1, tbtMs: 200, totalBytes: 2_000_000 },
  seo: { critical: 0, serious: 1 },
  security: { critical: 0, serious: 3 },
};

/**
 * Budgets exist so this tool can sit in a pipeline and answer yes or no.
 *
 * Severity budgets are counted across the whole run, not per page, because a
 * build that breaks contrast on one template out of forty has still broken
 * contrast. Manual-check entries are `info` and never count against a budget:
 * failing a build for something no machine can verify would train people to
 * delete the check.
 */
export function evaluateBudgets(pages, budgets = DEFAULT_BUDGETS) {
  const results = [];
  const allFindings = pages.flatMap((p) => p.findings).filter((f) => f.kind !== 'manual');

  for (const module of ['accessibility', 'seo', 'security']) {
    const limits = budgets[module];
    if (!limits) continue;
    const counts = countBySeverity(allFindings.filter((f) => f.module === module));
    for (const [severity, limit] of Object.entries(limits)) {
      const actual = counts[severity] ?? 0;
      results.push({
        module,
        metric: severity,
        limit,
        actual,
        passed: actual <= limit,
        unit: 'findings',
      });
    }
  }

  const perf = budgets.performance;
  if (perf) {
    const metricPages = pages.filter((p) => p.metrics);
    const worst = (pick) =>
      metricPages.reduce((max, p) => Math.max(max, Number(pick(p.metrics)) || 0), 0);
    const map = [
      ['lcpMs', worst((m) => m.lcpMs), 'ms'],
      ['clsScore', worst((m) => m.cls), 'score'],
      ['tbtMs', worst((m) => m.tbtMs), 'ms'],
      ['totalBytes', worst((m) => m.totalBytes), 'bytes'],
    ];
    for (const [metric, actual, unit] of map) {
      if (perf[metric] === undefined || metricPages.length === 0) continue;
      results.push({
        module: 'performance',
        metric,
        limit: perf[metric],
        actual: Number(actual.toFixed(3)),
        passed: actual <= perf[metric],
        unit,
      });
    }
  }

  return { results, passed: results.every((r) => r.passed) };
}

export function mergeBudgets(base, override = {}) {
  const out = structuredClone(base);
  for (const [module, limits] of Object.entries(override)) {
    out[module] = { ...(out[module] || {}), ...limits };
  }
  return out;
}
