import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSecurity } from '../src/checks/security.mjs';

const base = {
  finalUrl: 'https://example.com/',
  status: 200,
  headers: {},
  setCookie: [],
  body: '',
  isHtml: true,
};

const ids = (findings) => findings.map((f) => f.id);

test('a present but permissive CSP is reported, not credited', () => {
  const findings = auditSecurity({
    ...base,
    headers: { 'content-security-policy': "default-src * 'unsafe-inline' 'unsafe-eval'" },
  });
  assert.ok(!ids(findings).includes('sec/csp-missing'), 'should not claim the header is missing');
  assert.ok(ids(findings).includes('sec/csp-wildcard-script'));
  assert.ok(ids(findings).includes('sec/csp-unsafeinline'));
  assert.ok(ids(findings).includes('sec/csp-unsafeeval'));
});

test('a restrictive CSP produces no CSP findings', () => {
  const findings = auditSecurity({
    ...base,
    headers: {
      'content-security-policy':
        "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'",
    },
  });
  assert.equal(findings.filter((f) => f.id.startsWith('sec/csp')).length, 0);
});

test('report-only CSP is called out as not enforcing', () => {
  const findings = auditSecurity({
    ...base,
    headers: { 'content-security-policy-report-only': "default-src 'self'" },
  });
  assert.ok(ids(findings).includes('sec/csp-report-only'));
});

test('hsts max-age of zero is treated as serious, not as present', () => {
  const findings = auditSecurity({ ...base, headers: { 'strict-transport-security': 'max-age=0' } });
  const hsts = findings.find((f) => f.id === 'sec/hsts-short');
  assert.equal(hsts.severity, 'serious');
});

test('plain http is critical and outranks every header finding', () => {
  const findings = auditSecurity({ ...base, finalUrl: 'http://example.com/' });
  assert.equal(findings[0].id, 'sec/no-https');
  assert.equal(findings[0].severity, 'critical');
});

test('cookie attributes are judged per cookie', () => {
  const findings = auditSecurity({
    ...base,
    setCookie: ['a=1; Path=/', 'b=2; Path=/; Secure; HttpOnly; SameSite=Lax'],
  });
  const cookies = findings.filter((f) => f.id.startsWith('sec/cookie-'));
  assert.equal(cookies.length, 1);
  assert.match(cookies[0].title, /"a"/);
});

test('version disclosure needs an actual version, not just the header', () => {
  assert.equal(auditSecurity({ ...base, headers: { server: 'cloudflare' } }).filter((f) => f.id === 'sec/version-disclosure').length, 0);
  assert.equal(auditSecurity({ ...base, headers: { server: 'Apache/2.4.29' } }).filter((f) => f.id === 'sec/version-disclosure').length, 1);
});

test('mixed content is only reported on an https page', () => {
  const body = '<script src="http://cdn.example/a.js"></script>';
  assert.equal(auditSecurity({ ...base, body }).filter((f) => f.id === 'sec/mixed-content').length, 1);
  assert.equal(
    auditSecurity({ ...base, finalUrl: 'http://example.com/', body }).filter((f) => f.id === 'sec/mixed-content').length,
    0,
  );
});

test('non-html responses are not judged on html-only headers', () => {
  const findings = auditSecurity({ ...base, isHtml: false, headers: {} });
  assert.equal(findings.filter((f) => f.id === 'sec/csp-missing').length, 0);
  assert.equal(findings.filter((f) => f.id === 'sec/no-sniff').length, 0);
});
