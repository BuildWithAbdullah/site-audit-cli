import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BUDGETS, evaluateBudgets, mergeBudgets } from '../src/budgets.mjs';

const f = (module, severity, kind) => ({ module, severity, kind, id: `${module}/${severity}` });

test('manual checks never count against a budget', () => {
  const pages = [
    { findings: [f('accessibility', 'critical', 'manual'), f('accessibility', 'info', 'manual')] },
  ];
  const { passed } = evaluateBudgets(pages, DEFAULT_BUDGETS);
  assert.equal(passed, true);
});

test('severity budgets are counted across every page, not per page', () => {
  const pages = [
    { findings: [f('seo', 'serious')] },
    { findings: [f('seo', 'serious')] },
  ];
  const { results } = evaluateBudgets(pages, { seo: { serious: 1 } });
  const seo = results.find((r) => r.metric === 'serious');
  assert.equal(seo.actual, 2);
  assert.equal(seo.passed, false);
});

test('performance budgets take the worst page, not the average', () => {
  const pages = [
    { findings: [], metrics: { lcpMs: 900, cls: 0, tbtMs: 0, totalBytes: 0 } },
    { findings: [], metrics: { lcpMs: 4200, cls: 0, tbtMs: 0, totalBytes: 0 } },
  ];
  const { results } = evaluateBudgets(pages, { performance: { lcpMs: 2500 } });
  const lcp = results.find((r) => r.metric === 'lcpMs');
  assert.equal(lcp.actual, 4200);
  assert.equal(lcp.passed, false);
});

test('performance budgets are skipped when no page produced metrics', () => {
  const { results } = evaluateBudgets([{ findings: [] }], { performance: { lcpMs: 2500 } });
  assert.equal(results.filter((r) => r.module === 'performance').length, 0);
});

test('merging an override leaves untouched modules intact', () => {
  const merged = mergeBudgets(DEFAULT_BUDGETS, { security: { serious: 0 } });
  assert.equal(merged.security.serious, 0);
  assert.equal(merged.security.critical, DEFAULT_BUDGETS.security.critical);
  assert.deepEqual(merged.accessibility, DEFAULT_BUDGETS.accessibility);
});

test('a module that could not run is a serious finding, not a silent pass', async () => {
  const { runAudit } = await import('../src/audit.mjs');
  const report = await runAudit('http://127.0.0.1:1/', {
    modules: ['accessibility', 'security'],
    timeoutMs: 2000,
  });
  assert.equal(report.budget.passed, false);
});
