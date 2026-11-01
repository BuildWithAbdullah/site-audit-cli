import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../src/limits.mjs';
import { judgeAccessibility } from '../src/checks/accessibility.mjs';
import { judgePerformance } from '../src/checks/performance.mjs';
import { auditSecurity } from '../src/checks/security.mjs';
import { auditSeo } from '../src/checks/seo.mjs';
import { evaluateBudgets, DEFAULT_BUDGETS } from '../src/budgets.mjs';
import { manualRegisterAsFindings, MANUAL_REGISTER } from '../src/manual-register.mjs';

/**
 * The declared limits, asserted rather than stated.
 *
 * Each entry in `src/limits.mjs` says that a verdict is not evidence about
 * some neighbouring thing. A test here is required to carry the name in that
 * entry's `assertedBy` field, and to argue it in both directions: the case
 * where the limit bites and the case where it does not. One direction only
 * would be satisfied by a check that always says the same thing.
 */

const names = new Set();
const limitTest = (id, name, fn) => {
  names.add(`${id}::${name}`);
  test(`${id}: ${name}`, fn);
};

const axeResults = (violations) => ({ violations, passes: [], incomplete: [], inapplicable: [] });
const violation = (id, impact = 'serious') => ({
  id,
  impact,
  help: `${id} help`,
  description: `${id} description`,
  helpUrl: `https://example.test/${id}`,
  tags: ['wcag2a', 'wcag111'],
  nodes: [{ target: ['img'] }],
});

// --------------------------------------------------------- limit/axe-subset

limitTest(
  'limit/axe-subset',
  'the axe verdict is independent of the manual register in all four combinations',
  () => {
    // All four combinations of {axe found something, axe found nothing} by
    // {the manual register is read, the manual register is compared}. The
    // claim is that the automated verdict carries no information about the
    // eleven criteria, so the register must come out identical either way
    // and must never be empty.
    const clean = judgeAccessibility(axeResults([]));
    const dirty = judgeAccessibility(axeResults([violation('image-alt', 'critical')]));
    const automated = (r) => r.findings.filter((f) => f.kind !== 'manual');
    const manual = (r) => r.findings.filter((f) => f.kind === 'manual').map((f) => f.id);

    assert.deepEqual(automated(clean), [], 'no violations means no automated findings');
    assert.equal(automated(dirty).length, 1, 'one violation means one automated finding');

    // The two corners that carry the claim: the manual register comes out
    // identical in both, so the automated verdict holds no information about
    // it, and it is never empty, so a clean automated pass is never a clean
    // page.
    assert.deepEqual(manual(clean), MANUAL_REGISTER.map((e) => e.id));
    assert.deepEqual(manual(clean), manual(dirty), 'the register is not a function of what axe found');
    assert.ok(manual(clean).length >= 11, 'the register is the whole point of this limit');
    assert.deepEqual(
      manualRegisterAsFindings().map((f) => f.id),
      manual(dirty),
      'and the register a report prints is the register the module emits',
    );
  },
);

// ----------------------------------------------------- limit/lab-not-field

const metrics = (over) => ({
  lcpMs: over ? 7200 : 1200,
  lcpElement: null,
  lcpPhases: null,
  cls: over ? 0.4 : 0.01,
  largestShiftSource: null,
  tbtMs: over ? 900 : 30,
  longestTaskMs: 20,
  ttfbMs: over ? 2100 : 90,
  totalBytes: over ? 6_000_000 : 400_000,
  bytesByType: { script: 200_000 },
  renderBlocking: [],
  oversizedImages: [],
  thirdPartyBytes: 0,
  thirdPartyHosts: [],
});

limitTest(
  'limit/lab-not-field',
  'the same metrics pass and fail depending only on the budget they are read against',
  () => {
    const fast = metrics(false);
    // Four combinations: a fast page and a slow page, each read against a
    // generous budget and a strict one. The verdict moves with the budget on
    // identical numbers, so "no performance findings" is a statement about
    // this repository's thresholds and not about a visitor.
    const strict = { lcpMs: 500, clsScore: 0.001, tbtMs: 10, ttfbMs: 10, totalBytes: 100_000 };
    const generous = { lcpMs: 20_000, clsScore: 5, tbtMs: 10_000, ttfbMs: 30_000, totalBytes: 100_000_000 };

    assert.deepEqual(judgePerformance(fast, DEFAULT_BUDGETS.performance), []);
    assert.ok(
      judgePerformance(fast, strict).length > 0,
      'the same fast page fails a strict budget, so passing is not a property of the page',
    );

    const slow = metrics(true);
    assert.ok(judgePerformance(slow, DEFAULT_BUDGETS.performance).length > 0);
    assert.deepEqual(
      judgePerformance(slow, generous),
      [],
      'the same slow page passes a generous budget, so failing is not a property of the page either',
    );
  },
);

// ---------------------------------------------- limit/one-response-per-url

limitTest(
  'limit/one-response-per-url',
  'two URLs on one origin produce different header findings',
  () => {
    const hardened = {
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'content-security-policy': "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin',
      'permissions-policy': 'geolocation=()',
    };
    const base = { status: 200, setCookie: [], body: '', isHtml: true };
    const home = auditSecurity({ ...base, finalUrl: 'https://example.test/', headers: hardened });
    const admin = auditSecurity({ ...base, finalUrl: 'https://example.test/admin', headers: {} });

    assert.deepEqual(home, [], 'the audited URL is clean');
    assert.ok(admin.length > 0, 'another path on the same origin is not');
    // The other direction: the same path audited twice gives the same answer,
    // so the difference above is the URL and not noise in the check.
    assert.deepEqual(
      auditSecurity({ ...base, finalUrl: 'https://example.test/', headers: hardened }),
      home,
    );
  },
);

// -------------------------------------------- limit/markup-not-content

const seoPage = (head, body) => ({
  finalUrl: 'https://example.test/pricing',
  headers: {},
  body: `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`,
  isHtml: true,
  redirectChain: [],
});
const ids = async (input) => (await auditSeo(input, { fetchRobots: false })).map((f) => f.id).sort();

const GOOD_HEAD =
  '<title>Pricing</title><meta name="description" content="What the three plans cost and what each one includes.">' +
  '<link rel="canonical" href="/pricing"><meta property="og:title" content="Pricing">';

limitTest('limit/markup-not-content', 'the SEO finding set does not move when the prose changes', async () => {
  const excellent =
    '<h1>Pricing</h1><p>Three plans. Starter is for one person, Team is for up to twelve, and Scale removes the seat limit entirely. Every plan carries the same support commitment.</p>';
  const worthless = '<h1>Pricing</h1><p>asdf asdf asdf.</p>';

  assert.deepEqual(
    await ids(seoPage(GOOD_HEAD, excellent)),
    await ids(seoPage(GOOD_HEAD, worthless)),
    'nothing in this tool reads the page for whether it is any good',
  );

  // The other direction: excellent prose in broken markup still reports, so
  // the silence above is not the tool being unable to report anything.
  const broken = await ids(seoPage('', excellent));
  assert.ok(broken.length > 0, 'good content does not buy a clean report');
  assert.ok(broken.includes('seo/title-missing'));
});

// ------------------------------------------- limit/server-html-only

limitTest(
  'limit/server-html-only',
  'the same page reports differently depending only on whether the markup is in the response',
  async () => {
    const clientRendered = seoPage(
      GOOD_HEAD,
      '<div id="root"></div><script>document.getElementById("root").innerHTML = "<h1>Pricing</h1>";</script>',
    );
    const serverRendered = seoPage(GOOD_HEAD, '<h1>Pricing</h1><p>Three plans.</p>');

    assert.ok(
      (await ids(clientRendered)).includes('seo/h1-missing'),
      'an h1 a script will add later is not an h1 in the response',
    );
    assert.ok(
      !(await ids(serverRendered)).includes('seo/h1-missing'),
      'and the same page with the heading in the markup is clean, so the finding is about the response',
    );
  },
);

// --------------------------------------------- limit/crawl-is-a-sample

limitTest(
  'limit/crawl-is-a-sample',
  'the budget verdict changes with the sample while the pages do not change',
  () => {
    const clean = { url: 'https://example.test/a', findings: [], metrics: null };
    const bad = {
      url: 'https://example.test/b',
      findings: [
        { id: 'seo/title-missing', module: 'seo', severity: 'serious', kind: undefined },
        { id: 'seo/canonical-invalid', module: 'seo', severity: 'serious', kind: undefined },
      ],
      metrics: null,
    };

    assert.equal(evaluateBudgets([clean], DEFAULT_BUDGETS).passed, true);
    assert.equal(
      evaluateBudgets([clean, bad], DEFAULT_BUDGETS).passed,
      false,
      'adding a page to the sample fails the run without changing any page',
    );
    assert.equal(
      evaluateBudgets([bad], DEFAULT_BUDGETS).passed,
      false,
      'and the bad page alone fails, so the sample size is what moved, not the pages',
    );
    // Counted across the run, not per page: forty clean pages do not rescue one.
    const many = [...Array(40)].map((_, i) => ({ ...clean, url: `https://example.test/${i}` }));
    assert.equal(evaluateBudgets([...many, bad], DEFAULT_BUDGETS).passed, false);
  },
);

// ---------------------------------------------------------------- coverage

test('every declared limit has a test of the name it claims', () => {
  for (const limit of LIMITS) {
    assert.ok(
      names.has(`${limit.id}::${limit.assertedBy}`),
      `${limit.id} says it is asserted by "${limit.assertedBy}" and no test of that name exists`,
    );
  }
  assert.equal(names.size, LIMITS.length, 'a limit test exists that no limit declares');
  for (const limit of LIMITS) {
    assert.ok(limit.claim.length > 80, `${limit.id} needs a claim somebody can disagree with`);
    assert.ok(limit.notEvidenceAbout.length > 10, `${limit.id} must name what it is not evidence about`);
  }
});
