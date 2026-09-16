# Report anatomy

Four output formats, each for a different reader.

## Terminal

For the person who ran the command. Findings sorted by severity, evidence
under each one, the lab metrics line, the manual register, then the budget
table and a verdict in words.

Colour is an addition, never the carrier. Severity is spelled out, so the
output survives a CI log, a pipe into `grep`, and a reader who cannot
distinguish red from orange. `NO_COLOR` is honoured.

## JSON

For anything that stores results over time.

```bash
site-audit https://example.com --json - --quiet | jq '.summary'
```

The shape is stable:

```jsonc
{
  "tool": { "name": "site-audit-cli", "version": "1.0.0" },
  "target": "https://example.com/",
  "startedAt": "2026-09-16T04:12:29.000Z",
  "durationMs": 4183,
  "modules": ["accessibility", "performance", "seo", "security"],
  "pages": [
    {
      "url": "https://example.com/",
      "ok": true,
      "status": 200,
      "redirectChain": [ { "url": "...", "status": 301, "location": "..." } ],
      "findings": [
        {
          "id": "a11y/color-contrast",
          "module": "accessibility",
          "severity": "critical",
          "title": "...",
          "detail": "...",
          "evidence": ".hero p | .btn",
          "wcag": ["1.4.3"],
          "help": "https://dequeuniversity.com/...",
          "count": 14
        }
      ],
      "metrics": { "lcpMs": 4180, "cls": 0.184, "tbtMs": 610, "ttfbMs": 2590 },
      "automated": { "violations": 9, "instances": 41, "manualChecks": 11 },
      "errors": []
    }
  ],
  "summary": { "bySeverity": {}, "byModule": {}, "manualChecksOutstanding": 11 },
  "budget": { "passed": false, "results": [] }
}
```

Two fields are worth wiring into a dashboard before the rest.
`summary.manualChecksOutstanding` is the number that stops a green board being
mistaken for a conformant site. `pages[].errors` is how you find out a module
silently failed to run on one URL out of forty.

Finding `id` values are stable across versions. They are the key to diff two
runs and answer "what did this deploy break", which is the only accessibility
question a development team ever asks twice.

## Markdown

For a pull request comment, a ticket, or an email to somebody who will not open
an attachment. Same content, tables for the summary and budgets, one section
per page, manual register at the end.

## HTML

The client artefact. One self-contained file: no CDN, no build step, no
JavaScript at all. Light and dark through `prefers-color-scheme`, and it prints
with findings kept off page breaks.

It is held to the standard it measures. One `h1`, a heading outline with no
skipped levels, a skip link, focus visible on both colour schemes, severity
carried in text as well as colour, a caption on the budget table, and every
scrollable evidence block reachable by keyboard. The test suite runs the same
axe configuration against the generated report that the tool runs against
everything else, and the build fails if the report picks up a violation.

That check earned its place on the first run: the evidence blocks scroll
horizontally and were not focusable, which is a real WCAG 2.1.1 failure and
exactly the kind of thing that ships in a tool nobody points at itself.

### No score

There is no number out of 100 anywhere in any format.

A score is the single most requested feature in this category and it is the one
thing that reliably makes outcomes worse. It invites a client to negotiate
toward a threshold rather than toward a usable site, it lets a vendor bank
points on machine-checkable criteria while the operability failures go
untouched, and no honest percentage exists while most of the criteria can only
be judged by a person.

What replaces it: counts by severity, a budget table that says pass or fail per
check, and a count of the checks that have not been made yet.
