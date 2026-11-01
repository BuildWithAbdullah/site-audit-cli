import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { auditSecurity } from '../src/checks/security.mjs';
import { auditSeo } from '../src/checks/seo.mjs';
import { judgePerformance } from '../src/checks/performance.mjs';
import { judgeAccessibility } from '../src/checks/accessibility.mjs';
import { runAudit } from '../src/audit.mjs';
import {
  CATALOGUE,
  OPEN_FAMILIES,
  REACHABLE_IDS,
  isCatalogued,
  severitiesFor,
} from '../src/catalogue.mjs';

/**
 * Reachability. The point of this file is not that each check is correct,
 * which is what the per-module test files argue. It is that every finding
 * this tool claims it can emit has actually been seen to come out of it.
 *
 * A check nobody has watched fire is indistinguishable from a check that does
 * not work, and a catalogue nobody asserts against is a list of intentions.
 * Everything below drives the real modules with real inputs and collects what
 * comes back, so the coverage assertion at the bottom is earned rather than
 * declared.
 */

const produced = new Set();
const severitiesSeen = new Map();
const record = (findings) => {
  for (const f of findings) {
    produced.add(f.id);
    if (!severitiesSeen.has(f.id)) severitiesSeen.set(f.id, new Set());
    severitiesSeen.get(f.id).add(f.severity);
  }
  return findings.map((f) => f.id);
};

const page = (body, extra = {}) => ({
  finalUrl: 'https://example.com/page',
  headers: {},
  body,
  isHtml: true,
  redirectChain: [],
  ...extra,
});

const response = (extra = {}) => ({
  finalUrl: 'https://example.com/page',
  status: 200,
  headers: {},
  setCookie: [],
  body: '',
  isHtml: true,
  ...extra,
});

test('security findings are reachable', () => {
  record(auditSecurity(response({ finalUrl: 'http://example.com/page' })));
  record(auditSecurity(response({ status: 503 })));
  record(auditSecurity(response()));
  record(auditSecurity(response({ headers: { 'strict-transport-security': 'max-age=100' } })));
  record(
    auditSecurity(
      response({ headers: { 'strict-transport-security': 'max-age=31536000' } }),
    ),
  );
  record(
    auditSecurity(
      response({ headers: { 'content-security-policy-report-only': "default-src 'self'" } }),
    ),
  );
  // One deliberately useless policy: present, enforced, and restricting
  // nothing. It carries five of the seven CSP findings at once.
  record(
    auditSecurity(
      response({
        headers: { 'content-security-policy': "script-src 'unsafe-inline' 'unsafe-eval' *" },
      }),
    ),
  );
  record(auditSecurity(response({ headers: { server: 'Apache/2.4.29' } })));
  record(
    auditSecurity(
      response({ body: '<script src="http://cdn.example.net/a.js"></script>' }),
    ),
  );
  record(auditSecurity(response({ setCookie: ['session=abc; Path=/'] })));

  assert.ok(produced.has('sec/no-https'));
  assert.ok(produced.has('sec/csp-unsafeinline'));
  assert.ok(produced.has('sec/mixed-content'));
  assert.ok([...produced].some((id) => id.startsWith('sec/cookie-')));
});

test('technical SEO findings are reachable', async () => {
  const seo = async (input, options = { fetchRobots: false }) =>
    record(await auditSeo(input, options));

  await seo(page('<head><meta name="robots" content="noindex"></head>'));
  await seo(
    page('<head><meta name="robots" content="index"></head>', {
      headers: { 'x-robots-tag': 'noindex' },
    }),
  );
  await seo(page('<head><meta name="robots" content="nofollow"></head>'));
  await seo(page('<head><title>A title</title></head><body><h1>One</h1></body>'));
  await seo(
    page(
      '<head><link rel="canonical" href="https://example.com/page"><link rel="canonical" href="https://example.com/other"></head>',
    ),
  );
  await seo(page('<head><link rel="canonical" href="http://%"></head>'));
  await seo(page('<head><link rel="canonical" href="https://other.test/page"></head>'));
  await seo(page('<head><link rel="canonical" href="https://example.com/elsewhere"></head>'));
  await seo(page(`<head><title>${'x'.repeat(80)}</title></head>`));
  await seo(page('<head><title>One</title><title>Two</title></head>'));
  await seo(page('<body><h1>One</h1><h1>Two</h1></body>'));
  await seo(page('<body><h1>One</h1><h4>Jumped</h4></body>'));
  await seo(
    page('<head><script type="application/ld+json">{"a":,}</script></head>'),
  );
  await seo(page('<body><img src="a.png"></body>'));
  await seo(page('<body><img src="a.png" alt="" loading="lazy"></body>'));
  await seo(
    page('<head></head>', {
      redirectChain: [
        { status: 301, url: 'https://example.com/a' },
        { status: 302, url: 'https://example.com/b' },
      ],
    }),
  );

  assert.ok(produced.has('seo/noindex'));
  assert.ok(produced.has('seo/robots-conflict'));
  assert.ok(produced.has('seo/canonical-invalid'));
  assert.ok([...produced].some((id) => id.startsWith('seo/jsonld-invalid-')));
});

test('the three robots.txt findings are reachable', async () => {
  // checkRobots always asks the origin root, so the three outcomes need a
  // server that answers differently rather than three crafted strings.
  let mode = 'missing';
  const server = createServer((req, res) => {
    if (req.url !== '/robots.txt') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>no</title>');
      return;
    }
    if (mode === 'missing') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not here');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('User-agent: *\nDisallow: /\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  try {
    record(await auditSeo(page('<head></head>', { finalUrl: `${origin}/page` })));
    mode = 'disallow';
    record(await auditSeo(page('<head></head>', { finalUrl: `${origin}/page` })));
  } finally {
    await new Promise((r) => server.close(r));
  }

  assert.ok(produced.has('seo/robots-missing'));
  assert.ok(produced.has('seo/robots-disallow-all'));
  assert.ok(produced.has('seo/robots-no-sitemap'));
});

test('performance findings are reachable from recorded metrics', () => {
  // Every number here is over its default budget. This is the test that could
  // not exist while judgement and collection were one function.
  record(
    judgePerformance({
      lcpMs: 7200,
      lcpElement: 'img.hero',
      lcpPhases: null,
      cls: 0.42,
      largestShiftSource: 'div.banner',
      tbtMs: 1400,
      longestTaskMs: 620,
      ttfbMs: 2100,
      totalBytes: 6_000_000,
      bytesByType: { script: 3_000_000, image: 3_000_000 },
      renderBlocking: ['/a.css', '/b.css', '/c.css', '/d.css', '/e.js'],
      oversizedImages: ['img.hero 4000x3000 drawn at 400x300'],
      thirdPartyBytes: 4_000_000,
      thirdPartyHosts: ['cdn.example.net', 'tag.example.org'],
    }),
  );

  for (const id of ['perf/lcp', 'perf/cls', 'perf/tbt', 'perf/ttfb', 'perf/weight',
    'perf/render-blocking', 'perf/oversized-images', 'perf/third-party']) {
    assert.ok(produced.has(id), `${id} should be reachable`);
  }
});

test('a page within every budget produces no performance finding', () => {
  const findings = judgePerformance({
    lcpMs: 1800,
    lcpElement: null,
    lcpPhases: null,
    cls: 0.01,
    largestShiftSource: null,
    tbtMs: 40,
    longestTaskMs: 30,
    ttfbMs: 210,
    totalBytes: 800_000,
    bytesByType: { script: 400_000 },
    renderBlocking: [],
    oversizedImages: [],
    thirdPartyBytes: 10_000,
    thirdPartyHosts: [],
  });
  assert.deepEqual(findings, [], 'a page that is within budget should be silent');
});

test('the accessibility judgement maps axe impact without a browser', () => {
  const { findings, automated } = judgeAccessibility({
    violations: [
      {
        id: 'image-alt',
        impact: 'critical',
        help: 'Images must have alternate text',
        description: 'Ensures img elements have alternate text',
        tags: ['wcag2a', 'wcag111'],
        nodes: [{ target: ['img.hero'] }, { target: ['img.logo'] }],
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/image-alt',
      },
      {
        id: 'region',
        impact: undefined,
        help: 'All content should be contained by landmarks',
        description: 'Ensures all content is contained by a landmark',
        tags: ['best-practice'],
        nodes: [{ target: ['div'] }],
        helpUrl: 'https://example.invalid/region',
      },
    ],
    passes: [{ id: 'html-lang' }],
    incomplete: [],
  });

  const violations = findings.filter((f) => f.module === 'accessibility');
  assert.equal(violations[0].id, 'a11y/image-alt');
  assert.equal(violations[0].severity, 'critical');
  assert.deepEqual(violations[0].wcag, ['1.1.1']);
  assert.equal(violations[0].count, 2);
  // An axe violation with no impact must not vanish and must not be invented
  // as critical. Moderate is the documented fallback.
  assert.equal(violations[1].severity, 'moderate');
  assert.equal(automated.instances, 3);
  record(violations);
});

test('an unreachable URL is a finding rather than a crash', async () => {
  // Port 1 refuses on every platform CI runs on.
  const report = await runAudit('http://127.0.0.1:1/', { modules: ['security', 'seo'] });
  record(report.pages[0].findings);
  assert.equal(report.pages[0].ok, false);
  assert.ok(produced.has('run/unreachable'));
});

test('a browser that cannot start is reported per module, not thrown', async () => {
  // The regression test for the defect this release fixes. Before it, a
  // machine without Chrome lost the whole report, including the two modules
  // that never needed a browser.
  const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
  process.env.PUPPETEER_EXECUTABLE_PATH = '/nonexistent/chrome-for-this-test';
  try {
    const report = await runAudit('http://127.0.0.1:1/x', {
      modules: ['accessibility', 'performance', 'security'],
    });
    assert.equal(report.pages.length, 1, 'the run must still produce a report');
  } finally {
    if (previous === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = previous;
  }
});

test('the browser-free modules still report when Chrome is missing', async () => {
  const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
  process.env.PUPPETEER_EXECUTABLE_PATH = '/nonexistent/chrome-for-this-test';
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="en"><head></head><body><p>hi</p></body></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  try {
    const report = await runAudit(`http://127.0.0.1:${port}/page`, {
      modules: ['accessibility', 'performance', 'security', 'seo'],
    });
    const ids = record(report.pages[0].findings);

    assert.ok(ids.includes('run/accessibility-did-not-run'));
    assert.ok(ids.includes('run/performance-did-not-run'));
    assert.ok(
      ids.some((id) => id.startsWith('sec/')),
      'security findings must survive a missing browser',
    );
    assert.ok(
      ids.some((id) => id.startsWith('seo/')),
      'SEO findings must survive a missing browser',
    );
    assert.equal(
      report.budget.passed,
      false,
      'a run with two modules unaudited must not pass its budget',
    );
    assert.ok(
      report.budget.results.some(
        (r) => r.module === 'performance' && r.metric === 'pagesUnmeasured' && !r.passed,
      ),
      'the performance budget must fail on pages it never measured',
    );
  } finally {
    await new Promise((r) => server.close(r));
    if (previous === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = previous;
  }
});

test('every severity branch is driven, not only the one that was convenient', () => {
  /**
   * Ten findings choose their severity from the value they found, and before
   * the catalogue declared the severities each id can carry, only one side of
   * each of those ten had ever run. Declaring the set and asserting it in
   * both directions is what forces the other side, and the other side is
   * where `sec/hsts-invalid` came from: a header with no max-age directive
   * parsed as a max-age of zero, so the most broken form of the header was
   * reported as a deliberate decision to switch the policy off.
   */
  const resp = (extra = {}) => ({
    finalUrl: 'https://example.com/page',
    status: 200,
    headers: {},
    setCookie: [],
    body: '',
    isHtml: true,
    ...extra,
  });

  // sec/non-ok-status: critical on a server error, serious on a client one.
  record(auditSecurity(resp({ status: 404 })));

  // sec/hsts-short: serious when the policy is explicitly switched off.
  record(auditSecurity(resp({ headers: { 'strict-transport-security': 'max-age=0' } })));

  // sec/hsts-invalid: present, and discarded in full, because max-age is the
  // only required directive.
  record(auditSecurity(resp({ headers: { 'strict-transport-security': 'includeSubDomains' } })));

  // sec/csp-no-frame-ancestors: minor when X-Frame-Options still protects the
  // page, moderate when nothing does.
  record(
    auditSecurity(
      resp({
        headers: {
          'content-security-policy': "default-src 'self'",
          'x-frame-options': 'DENY',
        },
      }),
    ),
  );

  // sec/cookie-: minor when HttpOnly is there and something else is not.
  record(auditSecurity(resp({ setCookie: ['prefs=dark; Path=/; Secure; HttpOnly'] })));

  // Every performance finding that chooses between two severities, driven at
  // both ends: just over its budget, and far over it.
  const metrics = (over = {}) => ({
    lcpMs: 0,
    lcpElement: null,
    lcpPhases: null,
    cls: 0,
    largestShiftSource: null,
    tbtMs: 0,
    longestTaskMs: 0,
    ttfbMs: 0,
    totalBytes: 0,
    bytesByType: {},
    renderBlocking: [],
    oversizedImages: [],
    thirdPartyBytes: 0,
    thirdPartyHosts: [],
    ...over,
  });
  const budgets = { lcpMs: 2500, clsScore: 0.1, tbtMs: 200, ttfbMs: 800, totalBytes: 2_000_000 };
  for (const over of [
    { lcpMs: 2600 },
    { lcpMs: 9000 },
    { cls: 0.11 },
    { cls: 0.4 },
    { tbtMs: 210 },
    { tbtMs: 900 },
    { ttfbMs: 810 },
    { ttfbMs: 5000 },
    { totalBytes: 2_100_000, bytesByType: { script: 2_100_000 } },
    { totalBytes: 9_000_000, bytesByType: { script: 9_000_000 } },
    { renderBlocking: ['/a.css'] },
    { renderBlocking: ['/a.css', '/b.css', '/c.css', '/d.css', '/e.js', '/f.js'] },
  ]) {
    record(judgePerformance(metrics(over), budgets));
  }

  // The accessibility family takes its severity from the axe impact, so all
  // four are driven from four violations in one pass.
  const axe = (impact) => ({
    id: `rule-${impact}`,
    impact,
    help: 'help',
    description: 'description',
    helpUrl: 'https://example.test/rule',
    tags: ['wcag2a'],
    nodes: [{ target: ['div'] }],
  });
  record(
    judgeAccessibility({
      violations: ['critical', 'serious', 'moderate', 'minor'].map(axe),
      passes: [],
      incomplete: [],
      inapplicable: [],
    }).findings,
  );
});

test('the canonical finding set does not depend on the source order of the tags', async () => {
  // The regression test for a defect that shipped. Only the first canonical
  // link was ever examined, so a page with a usable first canonical and a
  // broken second one reported nothing about the broken one, and the same two
  // tags in the other order reported it. No engine treats these as ordered.
  const page = (head) => ({
    finalUrl: 'https://example.com/page',
    headers: {},
    body: `<head>${head}</head>`,
    isHtml: true,
    redirectChain: [],
  });
  const good = '<link rel="canonical" href="https://example.com/page">';
  const broken = '<link rel="canonical" href="http://%">';
  const ids = async (head) =>
    record(await auditSeo(page(head), { fetchRobots: false }))
      .slice()
      .sort();

  const forwards = await ids(good + broken);
  const backwards = await ids(broken + good);
  assert.deepEqual(forwards, backwards);
  assert.ok(forwards.includes('seo/canonical-invalid'));
  assert.ok(forwards.includes('seo/canonical-multiple'));

  // And with two canonicals there is no canonical, so no claim is made about
  // where it points. Reporting the first tag's destination on such a page
  // stated something about the page that was not true of it.
  const two = await ids(
    '<link rel="canonical" href="https://elsewhere.test/x"><link rel="canonical" href="https://example.com/page">',
  );
  assert.ok(!two.includes('seo/canonical-cross-origin'));
  assert.ok(!two.includes('seo/canonical-mismatch'));

  // One canonical, and the claim is made.
  const one = await ids('<link rel="canonical" href="https://elsewhere.test/x">');
  assert.ok(one.includes('seo/canonical-cross-origin'));
});

test('every severity a finding was emitted at is declared, and every declared severity was emitted', () => {
  const problems = [];
  for (const id of [...severitiesSeen.keys()].sort()) {
    const declared = severitiesFor(id);
    if (!declared) {
      problems.push(`${id} was emitted and is not catalogued at all`);
      continue;
    }
    for (const severity of severitiesSeen.get(id)) {
      if (!declared.includes(severity)) {
        problems.push(`${id} was emitted at ${severity}, which the catalogue does not list`);
      }
    }
  }
  // The direction that forces the work: a declared severity nobody has ever
  // produced is as much a claim as an undeclared one, and the open families
  // are exempt only because their suffix comes from the page.
  for (const entry of CATALOGUE) {
    if (!entry.reachable) continue;
    const seen = severitiesSeen.get(entry.id);
    if (!seen) {
      problems.push(`${entry.id} is catalogued as reachable and no test produced it`);
      continue;
    }
    for (const severity of entry.severities) {
      if (!seen.has(severity)) {
        problems.push(
          `${entry.id} declares it can be ${severity} and no test has ever produced that`,
        );
      }
    }
  }
  assert.deepEqual(problems, []);
});

// This runs last on purpose: it reads what every test above produced.
test('every catalogued finding has been seen to fire', () => {
  const missing = REACHABLE_IDS.filter((id) => !produced.has(id));
  assert.deepEqual(
    missing,
    [],
    `catalogued as reachable but never produced by any test: ${missing.join(', ')}`,
  );
});

test('every finding produced is in the catalogue', () => {
  const uncatalogued = [...produced].filter((id) => !isCatalogued(id));
  assert.deepEqual(
    uncatalogued,
    [],
    `produced but not catalogued: ${uncatalogued.join(', ')}`,
  );
});

test('the catalogue has no duplicate entries and every open family has an example', () => {
  const ids = CATALOGUE.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id in the catalogue');
  for (const entry of CATALOGUE) {
    assert.ok(entry.means && entry.means.length > 20, `${entry.id} needs a plain statement`);
    assert.ok(entry.reachable || entry.why, `${entry.id} is unreachable and must say why`);
  }
  for (const family of OPEN_FAMILIES) {
    assert.ok(family.example.startsWith(family.prefix));
    assert.ok(isCatalogued(family.example));
    assert.equal(isCatalogued(family.prefix), false, 'a bare prefix is not an id');
  }
});
