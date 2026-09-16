import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixtureServer } from './fixtures/server.mjs';
import { runAudit } from '../src/audit.mjs';

/**
 * The whole pipeline against two fixture sites served locally.
 *
 * The clean fixture matters more than the broken one. Any tool can report
 * something; the useful property is that it stays quiet when the page is
 * right, because a tool that cries wolf gets its findings ignored wholesale.
 */
let fixture;

test.before(async () => {
  fixture = await startFixtureServer();
});

test.after(async () => {
  await fixture?.close();
});

test('the broken fixture produces findings in every module', async () => {
  const report = await runAudit(fixture.brokenUrl, { timeoutMs: 30000 });
  const ids = report.pages[0].findings.map((f) => f.id);

  assert.ok(ids.includes('seo/noindex'), 'noindex should be found');
  assert.ok(ids.includes('seo/title-multiple'), 'duplicate titles should be found');
  assert.ok(ids.includes('seo/canonical-multiple'), 'duplicate canonicals should be found');
  assert.ok(ids.some((id) => id.startsWith('seo/jsonld-invalid')), 'invalid JSON-LD should be found');
  assert.ok(ids.includes('sec/csp-wildcard-script'), 'wildcard CSP should be found');
  assert.ok(ids.includes('sec/version-disclosure'), 'version headers should be found');
  assert.ok(ids.some((id) => id.startsWith('a11y/')), 'axe should report at least one violation');
  assert.ok(report.summary.bySeverity.critical > 0 || report.summary.bySeverity.serious > 0);
});

test('the clean fixture produces no automated accessibility violations', async () => {
  const report = await runAudit(fixture.cleanUrl, { modules: ['accessibility'], timeoutMs: 30000 });
  const axeFindings = report.pages[0].findings.filter((f) => f.id.startsWith('a11y/'));
  assert.deepEqual(
    axeFindings.map((f) => `${f.id}: ${f.evidence}`),
    [],
    'the clean fixture should be clean',
  );
});

test('the manual register is emitted even when nothing automated is wrong', async () => {
  const report = await runAudit(fixture.cleanUrl, { modules: ['accessibility'], timeoutMs: 30000 });
  const manual = report.pages[0].findings.filter((f) => f.kind === 'manual');
  assert.ok(manual.length >= 10, 'every manual criterion should be listed');
  assert.equal(report.summary.manualChecksOutstanding, manual.length);
  assert.ok(manual.every((m) => m.help && m.help.length > 40), 'each needs a testing procedure');
});

test('a clean page passes its budgets and a broken one does not', async () => {
  // The fixture server speaks plain HTTP on a loopback port, and the security
  // module is right to call that critical. Rather than teach it to make an
  // exception for localhost, which would be an exception that eventually ships,
  // the budget for this run allows exactly that one finding and the test
  // asserts it is the only one.
  const clean = await runAudit(fixture.cleanUrl, {
    modules: ['accessibility', 'security'],
    budgets: { security: { critical: 1 } },
    timeoutMs: 30000,
  });
  assert.deepEqual(
    clean.pages[0].findings.filter((f) => f.severity === 'critical').map((f) => f.id),
    ['sec/no-https'],
  );
  assert.equal(clean.budget.passed, true, JSON.stringify(clean.budget.results, null, 2));

  const broken = await runAudit(fixture.brokenUrl, {
    modules: ['accessibility', 'security'],
    budgets: { security: { critical: 1 } },
    timeoutMs: 30000,
  });
  assert.equal(broken.budget.passed, false);
});

test('crawling follows same-origin links up to the limit', async () => {
  const report = await runAudit(fixture.brokenUrl, {
    modules: ['seo'],
    crawl: { maxPages: 2 },
    timeoutMs: 30000,
  });
  assert.equal(report.pages.length, 2);
  assert.ok(report.pages[1].url.endsWith('second.html'));
});

test('an unreachable page becomes a finding rather than a crash', async () => {
  const report = await runAudit('http://127.0.0.1:1/', { modules: ['security'], timeoutMs: 3000 });
  assert.equal(report.pages[0].ok, false);
  assert.equal(report.pages[0].findings[0].id, 'run/unreachable');
});
