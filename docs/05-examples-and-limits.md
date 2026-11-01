# The examples, and what this tool cannot tell you

Two parts of this repository exist to stop it from overstating itself. One is
`examples/`, which is 15 pairs of pages. The other is `src/limits.mjs`, which
is 6 statements about what a verdict is not evidence about. Both are asserted
rather than described, and this document explains the shape so the assertions
read as deliberate rather than as decoration.

## Why every example is a pair

A corrected page on its own proves nothing. A reader cannot tell, from a page
that passes, whether the tool would have said anything about the version that
was wrong, which means a repository of corrected examples is a repository of
claims about a tool rather than evidence about one.

So each example is the same page twice: `examples/<pair>.before.html` carries
the defect and `examples/<pair>.after.html` does not. Everything else about a
side lives on the side itself in `tools/pairs.mjs`: the response status, the
headers, the cookies, the redirect chain, and the exact findings it produces
as a map from finding id to severity. They are declared together because they
are read together, and because the status and the headers are as much a part
of the example as the markup is.

`test/pairs.test.mjs` drives both sides through the real check modules and
compares with `deepEqual`, so an extra finding fails exactly as loudly as a
missing one.

Declaring severity rather than a bare list of ids is what makes
`examples/server-error` expressible at all. Correcting a 500 to a 404 removes
no finding: `sec/non-ok-status` is reported on both sides, and the only thing
that changes is its severity, from critical to serious. A bare id list would
record that pair as a correction that did nothing.

## The residual, and the one pair that trades down

Most corrected sides clear what their broken side reported. Some do not, and
those are the honest ones. `examples/title-too-long` keeps nothing, because a
title long enough to be cut is a judgement about a result layout rather than a
defect. `examples/indexability` keeps `seo/jsonld-absent`, which is `info` and
is context rather than a problem.

`examples/canonical-elsewhere` is the one pair that trades one finding for
another. Pointing a canonical back at its own origin stops the page being
handed to another host, and the canonical still points at the wrong path, so
one serious finding becomes one minor one. The pair declares itself partial
and says what it trades. The suite asserts that no other pair introduces a
finding on its corrected side, and that exactly one pair declares itself
partial, so this cannot become a convenient category.

## Fifteen pages cannot reach fifty four findings

They reach 40, and the number is asserted so it cannot drift. The rest are
reached by constructed cases in the module test files.

This matters because a catalogue is one entry per **reason**, not one per
check, and the entries no example reaches are where defects hide. Writing
cases for the reasons the pairs never touch is how the two SEO defects in this
release were found: a canonical check that only ever examined the first of
several tags, so the finding set moved when the source order of two unordered
tags moved, and a `Strict-Transport-Security` header with no `max-age`
directive being reported as a deliberate `max-age` of zero.

## The same pairs, run a second time over real HTTP

The first pass hands the check modules a response object this repository
built. That tests the checks and nothing else, so each side is served by
`tools/pair-server.mjs` and fetched again with the code the binary
uses.

The served result is compared against a set **derived** from the declared one.
A page served over plain HTTP from a loopback address reports `sec/no-https`,
and the harness answers 404 for `robots.txt`, so it reports
`seo/robots-missing` too. The four HSTS findings and mixed content are not
judged at all, because neither means anything on a page that is not using TLS:
where there is no certificate, every subresource is insecure and singling one
out would say nothing.

Those two adjustments are applied as code in `tools/pairs.mjs`, for every
pair. No pair may add an entry to its own manifest to cover a difference,
because a manifest that can be corrected to match the result is not a
manifest. The suite also asserts each adjustment is actually needed, so an
adjustment nobody uses cannot sit there as an excuse.

One consequence is worth stating plainly: because the harness serves over
plain HTTP, every security pair exits 1 even on its corrected side. The
transport alone breaches the critical budget. That is the tool making its own
argument about itself.

## The exit code of every example is derived

`npm run exit-codes` runs the real binary over all 30 sides. The expected code
comes from the pair's declared id to severity map, the served adjustments, the
severity table in `src/catalogue.mjs` and `DEFAULT_BUDGETS`. Nothing in that
tool keeps a list of expected codes, because a tool with its own table agrees
with itself and proves nothing.

The chain is therefore: the catalogue is asserted against the modules by the
test suite, the manifest is asserted against the modules by the pairs test,
and the exit code tool derives from the manifest and the catalogue. Every link
is checked by something other than itself.

## The six limits

Each entry in `src/limits.mjs` names what a verdict is **not** evidence about,
and records the name of the test that argues it. The verifier fails if a
declared limit has no test of that name, and the test file is required to
argue each one in both directions, because one direction would be satisfied by
a check that always says the same thing.

| Limit | The verdict | Is not evidence about |
|---|---|---|
| `limit/axe-subset` | an automated accessibility pass | the eleven criteria in the manual register |
| `limit/lab-not-field` | a performance pass or fail | field performance, and it is a function of the budget |
| `limit/one-response-per-url` | a header check | any other URL on the same origin |
| `limit/markup-not-content` | every SEO finding here | content quality, or ranking |
| `limit/server-html-only` | the SEO and security modules | the page after its scripts have run |
| `limit/crawl-is-a-sample` | a budget verdict | the pages that were not audited |

Two of them carry all four combinations rather than two.

`limit/axe-subset` shows the automated verdict and the manual register are
independent: the register comes out identical whether axe reported a critical
violation or nothing at all, and it is never empty. So an automated pass with
no violations is never a conformant page, and the shape of the assertion is
what says so.

`limit/lab-not-field` shows the same fast page failing a strict budget and the
same slow page passing a generous one. Neither the pass nor the failure is a
property of the page: both are properties of the thresholds this repository
chose, and the four corners are what make that checkable rather than
arguable.
