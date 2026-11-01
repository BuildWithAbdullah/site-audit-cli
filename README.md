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

Node 22.12 or newer. That floor is not a preference. Puppeteer 25 declares
`>=22.12.0` and cheerio declares `>=20.18.1`, so any lower range would be a
range this package cannot actually install on. `npm run verify` reads the
engines field of every installed dependency and fails if the number advertised
here ever drifts below the strictest one in the tree.

The first run downloads a Chrome build for Puppeteer. Set
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

## Every finding, listed and driven

`src/catalogue.mjs` lists every finding this tool can emit: 54 catalogued findings,
plus 3 open families for the ids that carry a value read from the page,
plus the 11 manual checks, read from the register rather than copied beside it.

Every entry also declares the complete set of severities it can be emitted at,
and that is asserted in both directions. A severity a real finding carries and
the entry does not declare is a failure; a severity an entry declares that no
test has ever produced is a failure too. The second direction is the one that
earns its keep. Ten entries choose their severity from the value they found,
and until the set was declared only one side of each of those ten had ever
run. Driving the other side is where `sec/hsts-invalid` came from: a
`Strict-Transport-Security` header with no `max-age` directive parsed as a
`max-age` of zero, so the most broken form of the header was reported as a
deliberate decision to switch the policy off, with the subdomain coverage
reported as fine.

A list is decoration unless something holds it against the code, so
`test/catalogue.test.mjs` drives the catalogue out of real calls into the real
modules and asserts the collected set covers it exactly, in both directions.
One finding, `run/console-errors`, is catalogued as not driven, with the reason
written next to it rather than left for a reader to work out.

`docs/04-every-finding.md` is generated from the catalogue by `npm run docs`,
and CI runs `npm run docs -- --check`, so the document cannot quietly fall
behind the code it documents.

## The examples, as pairs

`examples/` holds 15 example pairs, as `<pair>.before.html` and
`<pair>.after.html`. Each one is the same page twice, with the defect and
without it, because a corrected page on its own proves nothing: a reader
cannot tell whether the tool would have said anything about the version that
was wrong.

Everything else about a side is declared on the side itself in
`tools/pairs.mjs`: the response status, the headers, the cookies, the redirect
chain, and the findings it produces as a map from id to severity. Both sides
are compared with `deepEqual`, so an extra finding fails exactly as loudly as
a missing one.
Declaring the severity rather than a bare id list is what makes
`examples/server-error` possible: correcting a 500 to a 404 removes no finding
at all and changes one severity from critical to serious, which is what a
responder needs to see and what a pass or fail flag hides.

One pair, `examples/canonical-elsewhere`, is a deliberately partial
correction, and says so in the manifest: it trades one serious finding for one
minor one. Every other pair either clears what it reports or keeps it
unchanged, and the test asserts that a corrected side never introduces a
finding the broken side did not have unless the pair declares itself partial
and says what it trades.

Fifteen pages cannot reach fifty four findings, and a repository that pretends
otherwise is hiding where its coverage comes from: the pairs reach 40 of them,
and the rest are reached by constructed cases in the module test files. The
number is asserted, so it cannot drift quietly.

Each side is then run a second time over real HTTP, served by
`tools/pair-server.mjs` and fetched with the code the binary uses. The
served result is compared against a set derived from the declared one by
applying two adjustments as code, not per pair: a page served over plain HTTP
reports `sec/no-https` and, because the harness answers 404 for robots.txt,
`seo/robots-missing`, while the four HSTS findings and mixed content are not
judged at all, since on a page with no TLS every subresource is insecure and
singling one out would say nothing. No pair may add an entry to its own
manifest to cover a difference, and the suite asserts each adjustment is
actually needed.

## What this tool cannot tell you

6 declared limits, in `src/limits.mjs`, each naming what the verdict is **not**
evidence about, and each asserted in both directions by a test of the name the
limit itself records:

| Limit | Not evidence about |
|---|---|
| An automated accessibility pass with no violations | the eleven criteria a person has to decide |
| A performance verdict | field performance, and the pass is a function of the budget |
| A header check | any other URL on the same origin |
| Every SEO finding here | content quality, or ranking |
| The SEO and security modules | what the page looks like after its scripts have run |
| A crawl of n pages | the pages that were not audited |

Two of them carry all four combinations. The accessibility one shows the
automated verdict and the manual register are independent: the register comes
out identical whether axe found a critical violation or nothing at all, and it
is never empty, so a clean automated pass is never a clean page. The
performance one shows the same fast page failing a strict budget and the same
slow page passing a generous one, so neither passing nor failing is a property
of the page.

A limit stated in a paragraph is a claim. A limit stated in an assertion is a
fact, and the verifier fails if a declared limit has no test of the name it
claims.

## Verifying

```bash
npm install
npm test
npm run verify
npm run exit-codes
npm run entry-thin
npm run count-tests
```

114 tests. Two fixture sites are served locally and audited end to end: one
built wrong on purpose, and one built correctly, which is the more useful of
the two. A tool that reports something on every page is easy to write and gets
its findings ignored wholesale. The clean fixture asserts the audit stays quiet
when the page is right.

The suite also covers the cases that are easy to get wrong: a present but
useless CSP, a header and a meta tag that disagree about indexing, a heading
skip reported once rather than once per heading, HTML escaped rather than
rendered in the report, and a module that failed to run failing the budget
instead of passing it.

`npm run verify` asks a different question. Instead of auditing a page it makes
1024 repository assertions: that every file in `test/` is named in the test
script, so a new test cannot be added and silently never run; that the Node
version below is one the dependency tree can install on and that CI pins it
exactly rather than naming its major line; that the thresholds and the counts
quoted in this README are the ones the code holds; that every declared limit
has a test; and that the catalogue, the severity table, the pairs and the
modules all agree.

Each count this README states is matched as a whole line, and the check fails
unless exactly one line matches. Matching a number with a pattern against the
whole file is not a check: a number that wraps across two lines is never
matched and silently passes, and a number that appears twice is checked once.

`npm run exit-codes` runs the real binary over all 30 example sides and
compares the exit code with one derived from the pair manifest, the severity
table and the default budgets. Nothing in that tool keeps its own list of
expected codes, because a tool with its own table agrees with itself.

`npm run entry-thin` fails the build if a decision moves back into
`bin/site-audit.mjs`, which is the one file here no test can drive, since
importing it runs it. Everything it used to decide is in `src/cli.mjs`, which
takes its streams, its filesystem and its audit function as arguments and is
driven with stubs.

`npm run count-tests` is where the test count above comes from. It runs the
files the `test` script names through a counting reporter, because every other
way of getting this number has been wrong on some Node version in the
supported range: the same suite prints `# tests 114` on one line of Node and
`info tests 114` on another.

## Scope, honestly

One cold load, from one location, on one connection, with an empty cache.

That says whether the page is **built** well. It does not say what real
visitors experience, which is what Chrome UX Report field data is for.
Interaction to Next Paint cannot be measured without an interaction, so Total
Blocking Time is collected in its place and labelled as the proxy it is.

The crawler is breadth-first, same-origin and HTML only. It exists so an audit
covers the handful of templates a site actually has rather than the homepage
alone. It is not a site crawler and does not pretend to be one.

Four defects were found in this repository while the work above was being
done, and all four had shipped. The worst of them was in the entry point: npm
installs a `bin` as a symlink, Node resolves a module path to its real path,
and the guard deciding whether the file was being run directly compared the
two as strings. They never matched, so the installed `site-audit` command
printed nothing and exited 0 for every user who installed this package the
documented way, while every test passed. The others were a canonical check
that only ever read the first of several tags, so the finding set moved when
the source order moved; the HSTS header described above; and a `ttfbMs` budget
that a config file could set, that `mergeBudgets` merged, and that nothing
ever read.

## The documents

- `docs/01-what-a-scanner-cannot-see.md` - the argument behind the manual register
- `docs/02-budgets-and-ci.md` - putting the exit code in a pipeline
- `docs/03-report-anatomy.md` - what each part of the report is for
- `docs/04-every-finding.md` - generated from the catalogue, checked in CI
- `docs/05-examples-and-limits.md` - how the pairs and the declared limits are asserted

## Related

- [wcag-fix-library](https://github.com/BuildWithAbdullah/wcag-fix-library) - failing and corrected markup for 16 WCAG 2.2 criteria, verified in CI
- [core-web-vitals-checklist](https://github.com/BuildWithAbdullah/core-web-vitals-checklist) - the diagnosis order behind the performance findings
- [technical-seo-toolkit](https://github.com/BuildWithAbdullah/technical-seo-toolkit) - failing and corrected artefacts for the SEO patterns
- [wordpress-security-hardening](https://github.com/BuildWithAbdullah/wordpress-security-hardening) - the fixes for most of what the security module reports

## Licence

MIT. Use it, ship it, put it in your pipeline, no attribution required.
