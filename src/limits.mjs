/**
 * What this tool cannot tell you, written down as data so it can be asserted.
 *
 * Every repository on this account states its limits in prose. Prose is a
 * claim. These are the same statements with an `assertedBy` field, and
 * `test/limits.test.mjs` is required to carry a test of that name for every
 * entry here, in both directions: the case where the limit bites, and the
 * case where it does not, so the limit is shown to be about what it says it
 * is about and not merely true by accident.
 *
 * `notEvidenceAbout` is the part that matters. A finding is evidence about
 * one thing. The usual way a scanner misleads people is that a reader takes
 * it as evidence about a neighbouring thing, and the neighbouring thing is
 * named here for each one.
 */
export const LIMITS = [
  {
    id: 'limit/axe-subset',
    claim:
      'An accessibility pass with no violations is not a conformant page. Automated rules cover a minority of WCAG 2.2 A and AA, and the eleven criteria in the manual register are not among them.',
    notEvidenceAbout: 'the eleven criteria a person has to decide',
    assertedBy: 'the axe verdict is independent of the manual register in all four combinations',
  },
  {
    id: 'limit/lab-not-field',
    claim:
      'Performance findings are a lab measurement on one machine on one network against a budget this repository chose. They are not what your visitors experienced.',
    notEvidenceAbout: 'field performance, and the pass or fail is a function of the budget',
    assertedBy: 'the same metrics pass and fail depending only on the budget they are read against',
  },
  {
    id: 'limit/one-response-per-url',
    claim:
      'The header checks read what the server sent for the one URL that was audited. Headers are routinely set per path, per vhost and per cache state.',
    notEvidenceAbout: 'any other URL on the same origin',
    assertedBy: 'two URLs on one origin produce different header findings',
  },
  {
    id: 'limit/markup-not-content',
    claim:
      'Every SEO finding here is about crawlability and presentation. Nothing in this tool reads the page for whether it is any good, and nothing in it is about ranking.',
    notEvidenceAbout: 'content quality or ranking',
    assertedBy: 'the SEO finding set does not move when the prose changes',
  },
  {
    id: 'limit/server-html-only',
    claim:
      'The SEO and security modules read the response body. A page that builds its content in the browser is audited as the server sent it, which is also how a crawler that does not execute scripts sees it.',
    notEvidenceAbout: 'what the page looks like after its scripts have run',
    assertedBy: 'the same page reports differently depending only on whether the markup is in the response',
  },
  {
    id: 'limit/crawl-is-a-sample',
    claim:
      'A crawl of n pages is a sample. The budget verdict is a statement about the pages that were audited, and severity budgets are counted across the whole run, so one bad template fails the run and forty good ones do not rescue it.',
    notEvidenceAbout: 'the pages that were not audited',
    assertedBy: 'the budget verdict changes with the sample while the pages do not change',
  },
];

export const LIMIT_IDS = LIMITS.map((l) => l.id);
