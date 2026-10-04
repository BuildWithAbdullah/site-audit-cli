import { MANUAL_REGISTER } from './manual-register.mjs';

/**
 * Every finding this tool can emit, in one list.
 *
 * The argument for the file is narrow and practical. Finding ids were spread
 * across four check modules and two run-level handlers, so there was no way to
 * answer two questions a reader of this repository is entitled to ask: what
 * can this tool actually tell me, and has each of those checks ever been seen
 * to fire? A scattered set of ids answers neither, and a check that has never
 * fired in a test is a check that may not work.
 *
 * So the catalogue is not documentation that sits beside the code. It is
 * asserted against the code in both directions by `tools/verify.mjs`, and
 * every entry marked `reachable` is required by `test/catalogue.test.mjs` to
 * be produced by a real call into a real check module. An id that the source
 * can emit and the catalogue does not list fails CI. An id the catalogue
 * lists and no test can produce fails CI as well.
 */

/**
 * `reachable: false` marks a finding that cannot be produced without a
 * browser or a network failure. It is still catalogued, and the reason it
 * cannot be driven from a unit test is recorded here rather than left as a
 * gap somebody has to rediscover.
 */
export const CATALOGUE = [
  // Run-level. These describe the audit rather than the page.
  {
    id: 'run/unreachable',
    module: 'security',
    means: 'The URL could not be fetched at all, so nothing was audited against it.',
    reachable: true,
  },
  {
    id: 'run/accessibility-did-not-run',
    module: 'accessibility',
    means: 'The accessibility module never executed on this page, which is not the same as finding nothing.',
    reachable: true,
  },
  {
    id: 'run/performance-did-not-run',
    module: 'performance',
    means: 'The performance module never executed on this page, which is not the same as finding nothing.',
    reachable: true,
  },
  {
    id: 'run/console-errors',
    module: 'performance',
    means: 'A script threw during load, so whatever that script was responsible for did not happen.',
    reachable: false,
    why: 'Collected from a live page through a Chrome console listener.',
  },

  // Security.
  { id: 'sec/no-https', module: 'security', means: 'The page is served over plain HTTP.', reachable: true },
  { id: 'sec/non-ok-status', module: 'security', means: 'The server answered with something other than a 2xx status.', reachable: true },
  { id: 'sec/hsts-missing', module: 'security', means: 'No Strict-Transport-Security header on an HTTPS page.', reachable: true },
  { id: 'sec/hsts-short', module: 'security', means: 'Strict-Transport-Security max-age is under six months, or is zero.', reachable: true },
  { id: 'sec/hsts-no-subdomains', module: 'security', means: 'Strict-Transport-Security omits includeSubDomains.', reachable: true },
  { id: 'sec/csp-missing', module: 'security', means: 'No Content-Security-Policy on an HTML response.', reachable: true },
  { id: 'sec/csp-report-only', module: 'security', means: 'A policy exists but is measured rather than enforced.', reachable: true },
  { id: 'sec/csp-unsafeinline', module: 'security', means: "The script source list allows 'unsafe-inline'.", reachable: true },
  { id: 'sec/csp-unsafeeval', module: 'security', means: "The script source list allows 'unsafe-eval'.", reachable: true },
  { id: 'sec/csp-wildcard-script', module: 'security', means: 'The script source list allows every origin.', reachable: true },
  { id: 'sec/csp-no-frame-ancestors', module: 'security', means: 'The policy sets no frame-ancestors directive.', reachable: true },
  { id: 'sec/csp-no-object-src', module: 'security', means: "The policy does not set object-src 'none'.", reachable: true },
  { id: 'sec/no-sniff', module: 'security', means: 'X-Content-Type-Options is absent or is not nosniff.', reachable: true },
  { id: 'sec/referrer-policy', module: 'security', means: 'Referrer-Policy is absent or permissive enough to leak full URLs.', reachable: true },
  { id: 'sec/permissions-policy', module: 'security', means: 'No Permissions-Policy header.', reachable: true },
  { id: 'sec/version-disclosure', module: 'security', means: 'Response headers publish exact software versions.', reachable: true },
  { id: 'sec/mixed-content', module: 'security', means: 'An HTTPS page requests a subresource over HTTP.', reachable: true },

  // Technical SEO.
  { id: 'seo/noindex', module: 'seo', means: 'The page excludes itself from search results.', reachable: true },
  { id: 'seo/robots-conflict', module: 'seo', means: 'The meta robots tag and the X-Robots-Tag header disagree.', reachable: true },
  { id: 'seo/nofollow-page', module: 'seo', means: 'Every link on the page is discounted by a page-level nofollow.', reachable: true },
  { id: 'seo/canonical-missing', module: 'seo', means: 'No canonical link, so every parameter variant competes with the original.', reachable: true },
  { id: 'seo/canonical-multiple', module: 'seo', means: 'More than one canonical link, which search engines discard when they conflict.', reachable: true },
  { id: 'seo/canonical-invalid', module: 'seo', means: 'The canonical href does not parse as a URL and is ignored silently.', reachable: true },
  { id: 'seo/canonical-cross-origin', module: 'seo', means: 'The canonical points at a different origin.', reachable: true },
  { id: 'seo/canonical-mismatch', module: 'seo', means: 'The canonical does not match the URL that served the page.', reachable: true },
  { id: 'seo/title-missing', module: 'seo', means: 'The page has no title element, or an empty one.', reachable: true },
  { id: 'seo/title-long', module: 'seo', means: 'The title is long enough to be cut in most result layouts.', reachable: true },
  { id: 'seo/title-multiple', module: 'seo', means: 'More than one title element in head.', reachable: true },
  { id: 'seo/description-missing', module: 'seo', means: 'No meta description, so the engine picks the snippet itself.', reachable: true },
  { id: 'seo/h1-missing', module: 'seo', means: 'No h1, which is a search finding and an accessibility finding at once.', reachable: true },
  { id: 'seo/h1-multiple', module: 'seo', means: 'More than one h1 in a single flat outline.', reachable: true },
  { id: 'seo/heading-skip', module: 'seo', means: 'A heading level is skipped, which reads as a missing section.', reachable: true },
  { id: 'seo/jsonld-absent', module: 'seo', means: 'No JSON-LD on the page. Context, not a defect.', reachable: true },
  { id: 'seo/open-graph', module: 'seo', means: 'Open Graph tags are missing, so shares render as bare links.', reachable: true },
  { id: 'seo/redirect-chain', module: 'seo', means: 'Two or more redirects stand in front of the page.', reachable: true },
  { id: 'seo/temporary-redirect', module: 'seo', means: 'A 302 or 307 sits in front of a page that has moved permanently.', reachable: true },
  { id: 'seo/img-alt-attribute', module: 'seo', means: 'One or more images carry no alt attribute at all.', reachable: true },
  { id: 'seo/lazy-first-image', module: 'seo', means: 'The first image on the page is lazy-loaded, delaying the likely LCP request.', reachable: true },
  { id: 'seo/robots-missing', module: 'seo', means: 'The origin serves no robots.txt.', reachable: true },
  { id: 'seo/robots-disallow-all', module: 'seo', means: 'robots.txt disallows crawling of the whole site.', reachable: true },
  { id: 'seo/robots-no-sitemap', module: 'seo', means: 'robots.txt declares no sitemap.', reachable: true },

  // Performance. Collection needs Chrome; judgement does not, and these are
  // driven in tests through `judgePerformance` against recorded metrics.
  { id: 'perf/lcp', module: 'performance', means: 'Largest Contentful Paint is over budget in the lab.', reachable: true },
  { id: 'perf/cls', module: 'performance', means: 'Cumulative Layout Shift is over budget.', reachable: true },
  { id: 'perf/tbt', module: 'performance', means: 'Total Blocking Time is over budget, the lab proxy for a bad INP.', reachable: true },
  { id: 'perf/ttfb', module: 'performance', means: 'Time to First Byte is over 800ms, which no front-end change will move.', reachable: true },
  { id: 'perf/weight', module: 'performance', means: 'Transfer size on a cold load is over budget.', reachable: true },
  { id: 'perf/render-blocking', module: 'performance', means: 'Resources in head delay the first paint.', reachable: true },
  { id: 'perf/oversized-images', module: 'performance', means: 'Images are far larger than the box they are drawn in.', reachable: true },
  { id: 'perf/third-party', module: 'performance', means: 'More than 40 per cent of page weight comes from third parties.', reachable: true },
];

/**
 * Three families are open-ended, because the identifier carries a value that
 * comes from the page rather than from this repository. They are listed as
 * patterns, and the verifier accepts any id matching one of them.
 */
export const OPEN_FAMILIES = [
  {
    prefix: 'a11y/',
    module: 'accessibility',
    means: 'One axe-core rule violation. The suffix is the axe rule id.',
    example: 'a11y/image-alt',
  },
  {
    prefix: 'sec/cookie-',
    module: 'security',
    means: 'One cookie missing Secure, HttpOnly or SameSite. The suffix is the cookie name.',
    example: 'sec/cookie-session',
  },
  {
    prefix: 'seo/jsonld-invalid-',
    module: 'seo',
    means: 'One JSON-LD block that does not parse. The suffix is its index on the page.',
    example: 'seo/jsonld-invalid-0',
  },
];

/** The manual register is already a list, so it is read rather than copied. */
export const MANUAL_IDS = MANUAL_REGISTER.map((entry) => entry.id);

const STATIC_IDS = new Set(CATALOGUE.map((entry) => entry.id));
const MANUAL_SET = new Set(MANUAL_IDS);

export function isCatalogued(id) {
  if (STATIC_IDS.has(id) || MANUAL_SET.has(id)) return true;
  return OPEN_FAMILIES.some((family) => id.startsWith(family.prefix) && id.length > family.prefix.length);
}

export const REACHABLE_IDS = CATALOGUE.filter((entry) => entry.reachable).map((entry) => entry.id);
