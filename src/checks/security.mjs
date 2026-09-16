import { finding, truncate } from '../util/severity.mjs';

/**
 * Response-header security, judged on what the header actually does rather
 * than on whether it is present.
 *
 * The distinction matters. A Content-Security-Policy containing
 * `script-src 'unsafe-inline' 'unsafe-eval' *` passes every "do you have a
 * CSP" checker on the internet and blocks nothing at all. Scoring presence
 * rewards the header that was added to make a scanner quiet.
 */
export function auditSecurity({ finalUrl, status, headers, setCookie = [], body = '', isHtml = false }) {
  const findings = [];
  const url = new URL(finalUrl);
  const https = url.protocol === 'https:';

  if (!https) {
    findings.push(
      finding({
        id: 'sec/no-https',
        module: 'security',
        severity: 'critical',
        title: 'Page is served over plain HTTP',
        detail:
          'Everything on this page, including anything typed into a form, travels in clear text and can be read or rewritten in transit. Every other header on this list is advisory until this is fixed.',
        evidence: finalUrl,
        help: 'Install a certificate, redirect HTTP to HTTPS with a 301, then add HSTS.',
      }),
    );
  }

  findings.push(...checkHsts(headers, https));
  findings.push(...checkCsp(headers, isHtml));
  findings.push(...checkSimpleHeaders(headers, isHtml));
  findings.push(...checkCookies(setCookie, https));
  findings.push(...checkDisclosure(headers));
  if (isHtml && https) findings.push(...checkMixedContent(body));
  findings.push(...checkStatus(status, finalUrl));

  return findings;
}

function checkStatus(status, finalUrl) {
  if (status >= 200 && status < 300) return [];
  return [
    finding({
      id: 'sec/non-ok-status',
      module: 'security',
      severity: status >= 500 ? 'critical' : 'serious',
      title: `Page answered ${status}`,
      detail:
        'Every other check on this page ran against whatever the server returned instead of the page. Treat the rest of this report as provisional until the status is 200.',
      evidence: finalUrl,
    }),
  ];
}

function checkHsts(headers, https) {
  if (!https) return [];
  const raw = headers['strict-transport-security'];
  if (!raw) {
    return [
      finding({
        id: 'sec/hsts-missing',
        module: 'security',
        severity: 'serious',
        title: 'No Strict-Transport-Security header',
        detail:
          'The first request a returning visitor makes can still be plain HTTP, which is the request an attacker on the same network wants. HSTS removes that window.',
        help: "Start with 'max-age=300' to confirm nothing breaks, then raise it to 31536000 and add includeSubDomains.",
      }),
    ];
  }
  const maxAge = Number((raw.match(/max-age\s*=\s*(\d+)/i) || [])[1] || 0);
  const out = [];
  if (maxAge < 15552180) {
    out.push(
      finding({
        id: 'sec/hsts-short',
        module: 'security',
        severity: maxAge === 0 ? 'serious' : 'minor',
        title: `Strict-Transport-Security max-age is ${maxAge} seconds`,
        detail:
          maxAge === 0
            ? 'A max-age of zero instructs browsers to forget the policy. This header is currently doing the opposite of its job.'
            : 'Under six months, so the policy lapses for anyone who does not return often. Preload lists will not accept it either.',
        evidence: truncate(raw, 120),
      }),
    );
  }
  if (!/includeSubDomains/i.test(raw)) {
    out.push(
      finding({
        id: 'sec/hsts-no-subdomains',
        module: 'security',
        severity: 'minor',
        title: 'Strict-Transport-Security omits includeSubDomains',
        detail:
          'A forgotten staging or mail subdomain served over HTTP can be used to set a cookie the main host will read. Add the directive once you are sure every subdomain has a certificate.',
        evidence: truncate(raw, 120),
      }),
    );
  }
  return out;
}

const CSP_UNSAFE = [
  ["'unsafe-inline'", 'allows any inline script or style on the page, which is the payload almost every injection delivers'],
  ["'unsafe-eval'", 'allows eval and Function, which turns any string an attacker controls into code'],
];

function checkCsp(headers, isHtml) {
  if (!isHtml) return [];
  const raw = headers['content-security-policy'];
  const reportOnly = headers['content-security-policy-report-only'];

  if (!raw && reportOnly) {
    return [
      finding({
        id: 'sec/csp-report-only',
        module: 'security',
        severity: 'moderate',
        title: 'Content-Security-Policy is report-only',
        detail:
          'The policy is being measured, not enforced. That is the correct first step, and it is worth saying out loud that nothing is currently blocked.',
        evidence: truncate(reportOnly, 140),
      }),
    ];
  }

  if (!raw) {
    return [
      finding({
        id: 'sec/csp-missing',
        module: 'security',
        severity: 'serious',
        title: 'No Content-Security-Policy',
        detail:
          'Any script an attacker gets onto the page, through a compromised plugin, a hijacked third-party tag or a stored cross-site scripting hole, runs with full access to the page and its cookies.',
        help:
          'Deploy in report-only first and read the violation reports for a week. A CSP written blind will break a payment widget or an analytics tag on the day it ships.',
      }),
    ];
  }

  const out = [];
  const directives = parseCsp(raw);
  const scriptSrc = directives.get('script-src') || directives.get('default-src') || [];

  for (const [token, why] of CSP_UNSAFE) {
    if (scriptSrc.includes(token)) {
      out.push(
        finding({
          id: `sec/csp-${token.replace(/'/g, '').replace(/-/g, '')}`,
          module: 'security',
          severity: 'moderate',
          title: `Content-Security-Policy script source contains ${token}`,
          detail: `The header is present but ${why}.`,
          evidence: truncate(scriptSrc.join(' '), 140),
        }),
      );
    }
  }

  if (scriptSrc.includes('*')) {
    out.push(
      finding({
        id: 'sec/csp-wildcard-script',
        module: 'security',
        severity: 'serious',
        title: 'Content-Security-Policy allows scripts from any origin',
        detail:
          'A wildcard script source permits every host on the internet. The header is present, it is enforced, and it restricts nothing.',
        evidence: truncate(scriptSrc.join(' '), 140),
      }),
    );
  }

  if (!directives.has('frame-ancestors')) {
    out.push(
      finding({
        id: 'sec/csp-no-frame-ancestors',
        module: 'security',
        severity: headers['x-frame-options'] ? 'minor' : 'moderate',
        title: 'Content-Security-Policy has no frame-ancestors directive',
        detail: headers['x-frame-options']
          ? 'X-Frame-Options covers this for now, but it is obsolete and frame-ancestors is what modern browsers consult first.'
          : 'Nothing stops another site loading this page in an invisible frame and collecting the clicks a visitor believes they are giving you.',
      }),
    );
  }

  if (!directives.has('object-src')) {
    out.push(
      finding({
        id: 'sec/csp-no-object-src',
        module: 'security',
        severity: 'minor',
        title: "Content-Security-Policy does not set object-src 'none'",
        detail:
          'Plugin content is a bypass route for several published CSP evasions and no modern site needs it. This is a one-word addition.',
      }),
    );
  }

  return out;
}

function parseCsp(raw) {
  const map = new Map();
  for (const part of raw.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    map.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return map;
}

const SIMPLE = [
  {
    header: 'x-content-type-options',
    expect: (v) => /nosniff/i.test(v),
    id: 'sec/no-sniff',
    severity: 'moderate',
    title: 'X-Content-Type-Options is not set to nosniff',
    detail:
      'Without it a browser may decide an uploaded file is a script regardless of the content type you sent. Any site that accepts uploads wants this header.',
  },
  {
    header: 'referrer-policy',
    expect: (v) => /no-referrer|same-origin|strict-origin/i.test(v),
    id: 'sec/referrer-policy',
    severity: 'minor',
    title: 'Referrer-Policy is missing or permissive',
    detail:
      'Full URLs leak to every third party the page loads. On a members area or a checkout, the path alone can identify an order or an account.',
    help: 'strict-origin-when-cross-origin keeps analytics working while sending only the origin off-site.',
  },
  {
    header: 'permissions-policy',
    expect: (v) => v.trim().length > 0,
    id: 'sec/permissions-policy',
    severity: 'minor',
    title: 'No Permissions-Policy header',
    detail:
      'Every embedded frame inherits the right to ask for camera, microphone, geolocation and payment. Denying what you do not use costs one header.',
  },
];

function checkSimpleHeaders(headers, isHtml) {
  if (!isHtml) return [];
  const out = [];
  for (const rule of SIMPLE) {
    const value = headers[rule.header];
    if (!value || !rule.expect(value)) {
      out.push(
        finding({
          id: rule.id,
          module: 'security',
          severity: rule.severity,
          title: rule.title,
          detail: rule.detail,
          evidence: value ? truncate(`${rule.header}: ${value}`, 140) : null,
          help: rule.help || null,
        }),
      );
    }
  }
  return out;
}

function checkCookies(setCookie, https) {
  const out = [];
  for (const raw of setCookie) {
    const name = raw.split('=')[0].trim();
    const attrs = raw.toLowerCase();
    const missing = [];
    if (https && !attrs.includes('secure')) missing.push('Secure');
    if (!attrs.includes('httponly')) missing.push('HttpOnly');
    if (!/samesite=(lax|strict|none)/.test(attrs)) missing.push('SameSite');
    if (missing.length === 0) continue;
    out.push(
      finding({
        id: `sec/cookie-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        module: 'security',
        severity: missing.includes('HttpOnly') ? 'moderate' : 'minor',
        title: `Cookie "${name}" is missing ${missing.join(', ')}`,
        detail:
          'A cookie without HttpOnly can be read by any script on the page, which is what a cross-site scripting payload goes looking for. Without SameSite it is also attached to cross-site requests.',
        evidence: truncate(raw, 140),
      }),
    );
  }
  return out;
}

const DISCLOSURE = ['server', 'x-powered-by', 'x-generator', 'x-aspnet-version', 'x-drupal-cache'];
const VERSIONED = /\d+\.\d+/;

function checkDisclosure(headers) {
  const leaks = DISCLOSURE.filter((h) => headers[h] && VERSIONED.test(headers[h])).map(
    (h) => `${h}: ${headers[h]}`,
  );
  if (leaks.length === 0) return [];
  return [
    finding({
      id: 'sec/version-disclosure',
      module: 'security',
      severity: 'minor',
      title: 'Response headers publish exact software versions',
      detail:
        'This is not a vulnerability by itself. It is what a mass scanner reads to decide whether your host is worth an hour of its time, and removing it is a configuration line.',
      evidence: truncate(leaks.join(' | '), 160),
    }),
  ];
}

const INSECURE_SUBRESOURCE = /<(?:script|img|iframe|link|source|video|audio)[^>]+(?:src|href)\s*=\s*["']http:\/\/[^"']+["']/gi;

function checkMixedContent(body) {
  const matches = body.match(INSECURE_SUBRESOURCE);
  if (!matches) return [];
  return [
    finding({
      id: 'sec/mixed-content',
      module: 'security',
      severity: 'serious',
      title: `${matches.length} subresource${matches.length === 1 ? '' : 's'} requested over HTTP on an HTTPS page`,
      detail:
        'Browsers block active mixed content outright, so a script or stylesheet loaded this way is simply not running for anybody. Images are upgraded or blocked depending on the browser.',
      evidence: truncate(matches[0], 160),
      count: matches.length,
    }),
  ];
}
