# Every finding this tool can emit

Generated from `src/catalogue.mjs` by `npm run docs`. Do not edit by hand.

53 catalogued findings, 3 open families and
11 manual checks.

The right-hand column is the part worth reading. "Driven in a test" means
`test/catalogue.test.mjs` produces that exact finding from a real call into a
real check module, and CI fails if it stops doing so. A check nobody has
watched fire is indistinguishable from a check that does not work, so the
repository refuses to ship one quietly.

## Accessibility

| Finding | What it means | Driven in a test |
|---|---|---|
| `run/accessibility-did-not-run` | The accessibility module never executed on this page, which is not the same as finding nothing. | yes |

## Performance

| Finding | What it means | Driven in a test |
|---|---|---|
| `run/performance-did-not-run` | The performance module never executed on this page, which is not the same as finding nothing. | yes |
| `run/console-errors` | A script threw during load, so whatever that script was responsible for did not happen. | no, Collected from a live page through a Chrome console listener. |
| `perf/lcp` | Largest Contentful Paint is over budget in the lab. | yes |
| `perf/cls` | Cumulative Layout Shift is over budget. | yes |
| `perf/tbt` | Total Blocking Time is over budget, the lab proxy for a bad INP. | yes |
| `perf/ttfb` | Time to First Byte is over 800ms, which no front-end change will move. | yes |
| `perf/weight` | Transfer size on a cold load is over budget. | yes |
| `perf/render-blocking` | Resources in head delay the first paint. | yes |
| `perf/oversized-images` | Images are far larger than the box they are drawn in. | yes |
| `perf/third-party` | More than 40 per cent of page weight comes from third parties. | yes |

## Technical SEO

| Finding | What it means | Driven in a test |
|---|---|---|
| `seo/noindex` | The page excludes itself from search results. | yes |
| `seo/robots-conflict` | The meta robots tag and the X-Robots-Tag header disagree. | yes |
| `seo/nofollow-page` | Every link on the page is discounted by a page-level nofollow. | yes |
| `seo/canonical-missing` | No canonical link, so every parameter variant competes with the original. | yes |
| `seo/canonical-multiple` | More than one canonical link, which search engines discard when they conflict. | yes |
| `seo/canonical-invalid` | The canonical href does not parse as a URL and is ignored silently. | yes |
| `seo/canonical-cross-origin` | The canonical points at a different origin. | yes |
| `seo/canonical-mismatch` | The canonical does not match the URL that served the page. | yes |
| `seo/title-missing` | The page has no title element, or an empty one. | yes |
| `seo/title-long` | The title is long enough to be cut in most result layouts. | yes |
| `seo/title-multiple` | More than one title element in head. | yes |
| `seo/description-missing` | No meta description, so the engine picks the snippet itself. | yes |
| `seo/h1-missing` | No h1, which is a search finding and an accessibility finding at once. | yes |
| `seo/h1-multiple` | More than one h1 in a single flat outline. | yes |
| `seo/heading-skip` | A heading level is skipped, which reads as a missing section. | yes |
| `seo/jsonld-absent` | No JSON-LD on the page. Context, not a defect. | yes |
| `seo/open-graph` | Open Graph tags are missing, so shares render as bare links. | yes |
| `seo/redirect-chain` | Two or more redirects stand in front of the page. | yes |
| `seo/temporary-redirect` | A 302 or 307 sits in front of a page that has moved permanently. | yes |
| `seo/img-alt-attribute` | One or more images carry no alt attribute at all. | yes |
| `seo/lazy-first-image` | The first image on the page is lazy-loaded, delaying the likely LCP request. | yes |
| `seo/robots-missing` | The origin serves no robots.txt. | yes |
| `seo/robots-disallow-all` | robots.txt disallows crawling of the whole site. | yes |
| `seo/robots-no-sitemap` | robots.txt declares no sitemap. | yes |

## Security

| Finding | What it means | Driven in a test |
|---|---|---|
| `run/unreachable` | The URL could not be fetched at all, so nothing was audited against it. | yes |
| `sec/no-https` | The page is served over plain HTTP. | yes |
| `sec/non-ok-status` | The server answered with something other than a 2xx status. | yes |
| `sec/hsts-missing` | No Strict-Transport-Security header on an HTTPS page. | yes |
| `sec/hsts-short` | Strict-Transport-Security max-age is under six months, or is zero. | yes |
| `sec/hsts-no-subdomains` | Strict-Transport-Security omits includeSubDomains. | yes |
| `sec/csp-missing` | No Content-Security-Policy on an HTML response. | yes |
| `sec/csp-report-only` | A policy exists but is measured rather than enforced. | yes |
| `sec/csp-unsafeinline` | The script source list allows 'unsafe-inline'. | yes |
| `sec/csp-unsafeeval` | The script source list allows 'unsafe-eval'. | yes |
| `sec/csp-wildcard-script` | The script source list allows every origin. | yes |
| `sec/csp-no-frame-ancestors` | The policy sets no frame-ancestors directive. | yes |
| `sec/csp-no-object-src` | The policy does not set object-src 'none'. | yes |
| `sec/no-sniff` | X-Content-Type-Options is absent or is not nosniff. | yes |
| `sec/referrer-policy` | Referrer-Policy is absent or permissive enough to leak full URLs. | yes |
| `sec/permissions-policy` | No Permissions-Policy header. | yes |
| `sec/version-disclosure` | Response headers publish exact software versions. | yes |
| `sec/mixed-content` | An HTTPS page requests a subresource over HTTP. | yes |

## Open families

Three identifiers carry a value that comes from the page rather than from this
repository, so they are patterns rather than fixed ids.

| Pattern | What it means | Example |
|---|---|---|
| `a11y/*` | One axe-core rule violation. The suffix is the axe rule id. | `a11y/image-alt` |
| `sec/cookie-*` | One cookie missing Secure, HttpOnly or SameSite. The suffix is the cookie name. | `sec/cookie-session` |
| `seo/jsonld-invalid-*` | One JSON-LD block that does not parse. The suffix is its index on the page. | `seo/jsonld-invalid-0` |

## Manual checks

These are not defects found by the tool. They are the checks it cannot make,
emitted as `info` so they appear in the report rather than being left to
memory. They never count against a budget: failing a build for something no
machine can verify trains people to delete the check.

| Check | Criterion |
|---|---|
| `manual/1.4.10` | Reflow at 320 CSS pixels |
| `manual/1.4.11` | Non-text contrast |
| `manual/2.1.1` | Keyboard operability |
| `manual/2.1.2` | No keyboard trap |
| `manual/2.4.3` | Focus order |
| `manual/2.4.7` | Focus visible |
| `manual/2.4.11` | Focus not obscured |
| `manual/1.1.1-quality` | Whether alternative text is any good |
| `manual/1.3.5` | Identify input purpose |
| `manual/3.2.2` | On input |
| `manual/screen-reader` | Screen reader pass |
