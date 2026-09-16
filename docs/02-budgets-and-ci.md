# Budgets and CI

A budget turns a report into an answer. Without one, a scan in a pipeline is a
wall of text that everybody stops reading by the third sprint.

## The three exit codes

| Code | Meaning |
|---|---|
| 0 | Every budget was met |
| 1 | A budget was exceeded |
| 2 | The audit could not run |

Code 2 exists because "the site is fine" and "we never checked" are different
facts, and a pipeline that collapses them into one is worse than no pipeline.
A DNS failure, an unparseable config or a URL that never resolved all produce
2, and 2 is not a budget failure. Decide separately whether it should stop the
build. It usually should.

## Counting

Severity budgets count across the whole run rather than per page. A deploy that
breaks colour contrast on one template out of forty has broken contrast, and a
per-page threshold of "one serious allowed" would wave forty of them through.

Performance budgets take the worst page rather than the average, for the same
reason. An average hides the product template behind thirty fast blog posts.

Manual register entries are `info`, are never counted, and never fail a budget.

## A module that did not run

If the browser cannot open a page, the accessibility and performance modules
report **did not run** at severity serious rather than reporting nothing.

This matters more than it looks. The default failure mode of every audit tool
in CI is that a timeout, a redirect to a login page, or a bot wall produces
zero findings, the budget passes, and the build goes green on a page nobody
looked at. A module that did not run is not a module that found nothing.

## Suggested starting budgets

Start where the site is, not where it should be, then ratchet. A budget the
team cannot pass on day one is a budget somebody deletes in week two.

```jsonc
{
  "budgets": {
    // Day one: stop the bleeding. No new criticals.
    "accessibility": { "critical": 0 },
    "seo": { "critical": 0 },
    "security": { "critical": 0 }
  }
}
```

Once that holds for a fortnight, add `"serious": <current count>` and lower it
by one each sprint. The number in the file should always be a number the team
just cleared, not an aspiration.

## GitHub Actions

```yaml
name: site-audit
on:
  pull_request:
  schedule:
    - cron: '0 6 * * 1'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '22'
      - run: npx github:BuildWithAbdullah/site-audit-cli ${{ vars.SITE_URL }} --crawl 15 --md audit.md --html audit.html
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: audit
          path: |
            audit.md
            audit.html
```

`--md` is the format worth posting as a pull request comment. `--html` is the
one worth keeping as an artefact, because it is the file you forward to whoever
asks what changed.

## Auditing a staging site behind basic auth

Put the credentials in the URL for the fetch, and be aware that this is a
staging convenience rather than a pattern for anything else:

```bash
site-audit https://user:pass@staging.example.com/
```

Never commit that command. Pass it through a secret.

## Scheduling against production

A weekly scheduled run against production catches the class of regression that
never goes through a pull request: a marketing tag added through a tag manager,
a plugin that auto-updated, a CDN configuration change, an expired certificate.
Those are the ones that reach customers, and none of them are visible in a
diff.
