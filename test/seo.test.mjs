import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSeo } from '../src/checks/seo.mjs';

const page = (body, extra = {}) => ({
  finalUrl: 'https://example.com/page',
  headers: {},
  body,
  isHtml: true,
  redirectChain: [],
  ...extra,
});

const ids = async (input) => (await auditSeo(input, { fetchRobots: false })).map((f) => f.id);

test('noindex is critical wherever it is set', async () => {
  const fromMeta = await ids(page('<head><meta name="robots" content="noindex"></head>'));
  assert.ok(fromMeta.includes('seo/noindex'));

  const fromHeader = await ids(page('<head></head>', { headers: { 'x-robots-tag': 'noindex' } }));
  assert.ok(fromHeader.includes('seo/noindex'));
});

test('a header and a meta tag that disagree are reported as a conflict', async () => {
  const found = await ids(
    page('<head><meta name="robots" content="index"></head>', {
      headers: { 'x-robots-tag': 'noindex' },
    }),
  );
  assert.ok(found.includes('seo/robots-conflict'));
});

test('invalid JSON-LD is serious because it fails silently', async () => {
  const found = await ids(
    page('<head><script type="application/ld+json">{"a": 1,}</script></head>'),
  );
  assert.ok(found.includes('seo/jsonld-invalid-0'));
});

test('valid JSON-LD produces no finding', async () => {
  const found = await ids(
    page('<head><script type="application/ld+json">{"a": 1}</script></head>'),
  );
  assert.equal(found.filter((id) => id.startsWith('seo/jsonld-invalid')).length, 0);
});

test('a cross-origin canonical is separated from a mismatched one', async () => {
  const cross = await ids(page('<head><link rel="canonical" href="https://other.example/"></head>'));
  assert.ok(cross.includes('seo/canonical-cross-origin'));

  const mismatch = await ids(page('<head><link rel="canonical" href="/elsewhere"></head>'));
  assert.ok(mismatch.includes('seo/canonical-mismatch'));
  assert.ok(!mismatch.includes('seo/canonical-cross-origin'));
});

test('a heading level skip is found once, not once per heading', async () => {
  const found = await ids(page('<body><h1>a</h1><h3>b</h3><h5>c</h5></body>'));
  assert.equal(found.filter((id) => id === 'seo/heading-skip').length, 1);
});

test('a redirect chain and a temporary redirect are separate findings', async () => {
  const found = await ids(
    page('<head></head>', {
      redirectChain: [
        { url: 'http://example.com', status: 301 },
        { url: 'https://example.com', status: 302 },
        { url: 'https://example.com/page', status: 200 },
      ],
    }),
  );
  assert.ok(found.includes('seo/redirect-chain'));
  assert.ok(found.includes('seo/temporary-redirect'));
});

test('a lazy-loaded first image is reported as an LCP risk', async () => {
  const found = await ids(page('<body><img src="/hero.jpg" alt="" loading="lazy"></body>'));
  assert.ok(found.includes('seo/lazy-first-image'));
});

test('non-html responses are skipped entirely', async () => {
  assert.deepEqual(await auditSeo(page('', { isHtml: false }), { fetchRobots: false }), []);
});
