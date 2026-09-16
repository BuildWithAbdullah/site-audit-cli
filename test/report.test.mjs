import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/report/html.mjs';
import { renderMarkdown } from '../src/report/markdown.mjs';
import { renderTerminal } from '../src/report/terminal.mjs';
import { parseArgs } from '../bin/site-audit.mjs';

const report = {
  tool: { name: 'site-audit-cli', version: '1.0.0' },
  target: 'https://example.com/',
  startedAt: new Date(0).toISOString(),
  durationMs: 1234,
  modules: ['accessibility', 'security'],
  pages: [
    {
      url: 'https://example.com/',
      ok: true,
      findings: [
        {
          id: 'a11y/color-contrast',
          module: 'accessibility',
          severity: 'serious',
          title: 'Elements must have sufficient colour contrast',
          detail: 'Text <script>alert(1)</script> & "quoted"',
          evidence: 'div > p',
          wcag: ['1.4.3'],
          help: 'https://example.com/help',
          count: 4,
        },
        {
          id: 'manual/2.1.1',
          module: 'accessibility',
          severity: 'info',
          kind: 'manual',
          title: 'Manual check required: Keyboard operability',
          detail: 'why',
          help: 'how',
          wcag: ['2.1.1'],
          count: 1,
        },
      ],
      metrics: { lcpMs: 1200, cls: 0.02, tbtMs: 30, ttfbMs: 200, fcpMs: 800, totalBytes: 500000, requestCount: 20 },
    },
  ],
  summary: {
    pagesAudited: 1,
    totalFindings: 1,
    bySeverity: { critical: 0, serious: 1, moderate: 0, minor: 0, info: 0 },
    byModule: { accessibility: 1, performance: 0, seo: 0, security: 0 },
    manualChecksOutstanding: 1,
  },
  budget: {
    passed: false,
    results: [{ module: 'accessibility', metric: 'serious', limit: 0, actual: 1, passed: false, unit: 'findings' }],
  },
};

test('html report escapes finding text rather than rendering it', () => {
  const html = renderHtml(report);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('html report has exactly one h1 and a skip link', () => {
  const html = renderHtml(report);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.ok(html.includes('class="skip"'));
  assert.ok(html.includes('lang="en"'));
});

test('html report carries severity in text, not colour alone', () => {
  const html = renderHtml(report);
  assert.ok(html.includes('<span class="sev-tag">serious</span>'));
});

test('manual checks are excluded from the findings count in every reporter', () => {
  const md = renderMarkdown(report);
  assert.ok(md.includes('Checks no scanner can make'));
  assert.ok(!md.includes('### INFO - Manual check required'));

  const terminal = renderTerminal(report);
  assert.ok(terminal.includes('1 checks no scanner can make'));
});

test('a failed budget is stated in words in the terminal output', () => {
  assert.match(renderTerminal(report), /Budget exceeded/);
});

test('argument parsing handles lists, flags and a bare url', () => {
  const args = parseArgs(['https://example.com', '--only', 'seo, security', '--crawl', '5', '--mobile']);
  assert.equal(args.url, 'https://example.com');
  assert.deepEqual(args.only, ['seo', 'security']);
  assert.equal(args.crawl, 5);
  assert.equal(args.mobile, true);
});

test('an unknown flag falls back to help rather than guessing', () => {
  assert.equal(parseArgs(['https://example.com', '--nope']).help, true);
});

test('scrollable evidence blocks in the html report are keyboard reachable', () => {
  const html = renderHtml(report);
  assert.ok(html.includes('<pre tabindex="0"'), 'a scroll container must take focus');
});
