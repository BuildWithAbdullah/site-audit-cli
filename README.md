# site-audit-cli

One command. Accessibility, Core Web Vitals, technical SEO and response-header
security against the same page, in the same run, in one report.

The part that makes it different is the part that reports what it could not
check. Every scanner tells you what it found. None of them tell you what they
are structurally unable to look for, and that gap is how a site collects a
clean automated report and a demand letter in the same quarter.

```bash
npx github:BuildWithAbdullah/site-audit-cli https://example.com
```

```
site-audit  https://example.com/
1 page(s) | accessibility, performance, seo, security | 4.1s

  2 critical   7 serious   12 moderate   9 minor

    critical Elements must meet minimum colour contrast ratio thresholds x14
             .hero p | .btn | footer a
    critical Page is marked noindex
             meta robots: noindex, nofollow
    serious  Content-Security-Policy allows scripts from any origin
             * 'unsafe-inline' 'unsafe-eval'
    serious  Largest Contentful Paint is 4180ms in the lab
             Roughly 62 per cent of that time was spent before the first byte
             arrived, so the largest share of this metric belongs to the server
    LCP 4180ms | CLS 0.184 | TBT 610ms | TTFB 2590ms | 3.41MB in 94 requests

  11 checks no scanner can make
    - Reflow at 320 CSS pixels                      1.4.10
    - Non-text contrast                             1.4.11
    - Keyboard operability                          2.1.1
    - No keyboard trap                              2.1.2
    ...
    Run with --manual to print how to test each one.

  Budgets
    FAIL  accessibility.critical       2 / 0
    FAIL  seo.critical                 1 / 0
    pass  security.serious             2 / 3
    FAIL  performance.lcpMs            4180ms / 2500ms

  Budget exceeded. Exit code 1.
```

## Why the four modules are in one tool

Because on a real site they are one problem.

A hero image lazy-loaded below its own fold is a Largest Contentful Paint
finding. The same image with `alt="DSC_0041.jpg"` is an accessibility finding.
Served from a host with no `Strict-Transport-Security` it is a security
finding, and if the page carries `noindex` from a staging config nobody removed,
none of the other three matter this quarter.

Running four tools produces four reports with four vocabularies and four
severity scales, and then somebody spends an afternoon merging them into
something a client can read. This produces that document directly.

## Install

```bash
# no install
npx github:BuildWithAbdullah/site-audit-cli https://example.com

# or clone
git clone https://github.com/BuildWithAbdullah/site-audit-cli
cd site-audit-cli
npm install
node bin/site-audit.mjs https://example.com
```

Node 20.11 or newer. The first run downloads a Chrome build for Puppeteer. Set
`PUPPETEER_EXECUTABLE_PATH` to reuse a Chrome you already have.

## Usage

```bash
site-audit <url> [options]
```

| Option | What it does |
|---|---|
| `--only <list>` | Run some of `accessibility, performance, seo, security` |
| `--crawl <n>` | Audit up to n same-origin pages discovered from the start URL |
| `--exclude <list>` | Regular expressions; matching paths are skipped while crawling |
| `--config <path>` | JSON config. CLI flags override it |
| `--html <path>` | Self-contained HTML report, no CDN, no build step |
| `--json <path>` | Full result as JSON. `-` writes to stdout |
| `--md <path>` | Markdown, for a pull request comment or a ticket |
| `--manual` | Print how to perform each check a scanner cannot make |
| `--mobile` | Audit at 390x844 instead of 1366x768 |
| `--no-budget` | Report everything, always exit 0 |
| `--quiet` | Suppress the terminal report |

Exit code is 0 when every budget is met, 1 when one is not, and 2 when the
audit could not run at all. That third code exists so a pipeline can tell
"the site is fine" apart from "we never checked".

## What each module does

**Accessibility.** axe-core against the rendered page, tagged for WCAG 2.0,
2.1 and 2.2 at Levels A and AA. The tag filter includes `best-practice`
deliberately: axe classifies the landmark rules as best practice rather than as
WCAG rules, so a scan filtered to WCAG tags alone returns nothing at all on a
page with no landmarks, no headings and no skip link. Filtering them out
produces a clean report on a page that is plainly unusable.

**Performance.** Largest Contentful Paint, Cumulative Layout Shift, Total
Blocking Time, Time to First Byte and First Contentful Paint, measured in the
page rather than inferred from the markup, plus transfer size by resource type,
render-blocking resources in head, images served far larger than the box they
are drawn into, and third-party share of total weight. The Largest Contentful
Paint finding says which phase owns the time, because preloading an image does
nothing for a page that spent 2.6 seconds waiting for its server.

**Technical SEO.** Crawlability and indexation first: `meta robots` against
`X-Robots-Tag`, and what happens when the two disagree. Then canonical
correctness, title and description, heading outline, JSON-LD that parses, Open
Graph, redirect chains, temporary redirects left in place after a permanent
move, and `robots.txt`.

**Security.** Response headers judged on what they do rather than on whether
they exist. A `Content-Security-Policy` of `default-src * 'unsafe-inline'
'unsafe-eval'` passes every "do you have a CSP" checker on the internet and
blocks nothing, so it is reported, not credited. Same for
`Strict-Transport-Security: max-age=0`, which instructs browsers to forget the
policy. Plus cookie attributes per cookie, mixed content on HTTPS pages, and
version numbers published in response headers.

## The manual register

Roughly two thirds of the WCAG 2.2 Level A and AA criteria that fail on real
sites are not machine-detectable. A checkout drawer a keyboard user cannot
escape, a focus ring that vanishes on the dark footer, a sticky header covering
the link the user just tabbed to, a layout that needs sideways scrolling to
read a sentence: none of those produce a finding in any scanner on the market.

So every accessibility run prints the criteria that were not checked, why no
tool can check them, and the specific procedure that settles each one. It
prints on a clean page too, and it cannot be suppressed.

```
Keyboard operability  2.1.1
  Why a scanner cannot: A div with a click handler is indistinguishable
      from a decorative div in the DOM. Whether every control can actually
      be reached and operated is only answered by operating them.
  How to test: Unplug the mouse. Complete the primary task of the page:
      open the menu, filter a list, add to cart, submit the form. Note
      anything reachable by pointer that is not reachable by Tab.
```

Manual entries are never counted as findings and never fail a budget. Failing
a build for something no machine can verify teaches people to delete the check.

## Budgets and CI

```jsonc
// siteaudit.config.json
{
  "crawl": { "maxPages": 20, "exclude": ["/cart", "/checkout", "\\.pdf$"] },
  "budgets": {
    "accessibility": { "critical": 0, "serious": 0 },
    "performance": { "lcpMs": 2500, "clsScore": 0.1, "tbtMs": 200 },
    "seo": { "critical": 0, "serious": 1 },
    "security": { "critical": 0, "serious": 3 }
  }
}
```

Severity budgets count across the whole run rather than per page, because a
deploy that breaks contrast on one template out of forty has still broken
contrast. Performance budgets take the worst page, not the average, for the
same reason.

```yaml
- run: npx github:BuildWithAbdullah/site-audit-cli $DEPLOY_URL --crawl 15 --md report.md
```

A page the browser could not open reports the accessibility and performance
modules as **not run**, at severity serious, rather than as zero findings. A
module that did not run is not a module that found nothing, and a pipeline that
cannot tell the difference is worse than no pipeline.

## The reports

`--html` writes one self-contained file: no CDN, no build step, no JavaScript,
light and dark, and it prints. It is the artefact you hand a client.

It is also held to the standard it measures. One `h1`, a heading outline with
no skipped levels, a skip link, visible focus on both colour schemes, severity
carried in text as well as colour, and every scrollable evidence block
reachable by keyboard. The test suite audits the report with the same
axe configuration the tool uses on everything else. An accessibility report
that fails an accessibility audit is not an argument worth having with a
client.

There is no score out of 100 anywhere, and there will not be. A percentage
invites a client to chase the number rather than the failures, and no honest
percentage exists while most of the criteria can only be judged by a person.

## Verifying

```bash
npm install
npm test
```

38 tests. Two fixture sites are served locally and audited end to end: one built
wrong on purpose, and one built correctly, which is the more useful of the two.
A tool that reports something on every page is easy to write and gets its
findings ignored wholesale. The clean fixture asserts the audit stays quiet
when the page is right.

The suite also covers the cases that are easy to get wrong: a present but
useless CSP, a header and a meta tag that disagree about indexing, a heading
skip reported once rather than once per heading, HTML escaped rather than
rendered in the report, and a module that failed to run failing the budget
instead of passing it.

## Scope, honestly

One cold load, from one location, on one connection, with an empty cache.

That says whether the page is **built** well. It does not say what real
visitors experience, which is what Chrome UX Report field data is for.
Interaction to Next Paint cannot be measured without an interaction, so Total
Blocking Time is collected in its place and labelled as the proxy it is.

The crawler is breadth-first, same-origin and HTML only. It exists so an audit
covers the handful of templates a site actually has rather than the homepage
alone. It is not a site crawler and does not pretend to be one.

## Related

- [wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library) - failing and corrected markup for 16 WCAG 2.2 criteria, verified in CI
- [core-web-vitals-checklist](https://github.com/BuildWithAbdullah/core-web-vitals-checklist) - the diagnosis order behind the performance findings
- [technical-seo-toolkit](https://github.com/BuildWithAbdullah/technical-seo-toolkit) - failing and corrected artefacts for the SEO patterns
- [wordpress-security-hardening](https://github.com/BuildWithAbdullah/wordpress-security-hardening) - the fixes for most of what the security module reports

## Licence

MIT. Use it, ship it, put it in your pipeline, no attribution required.
