import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLES_DIR = join(ROOT, 'examples');

/**
 * Every example is a pair: the same page with the defect and without it.
 *
 * A corrected page on its own proves nothing, because a reader cannot tell
 * whether the tool would have said anything about the version that was wrong.
 * A pair makes the correction provable: the `before` side is required to
 * produce exactly the findings listed for it, and the `after` side is
 * required to produce exactly its residual set, which is usually empty but
 * is not always, and the places it is not empty are the honest part.
 *
 * Both sides are declared as id to severity, not as a bare id list, for two
 * reasons. The severity is asserted against the catalogue's own table, so a
 * pair cannot quietly disagree with it. And `tools/exit-codes.mjs` computes
 * the exit code the real binary should return from these severities and the
 * default budgets, so the expected exit code of every example is derived
 * rather than written down.
 */
export const PAIRS = [
  {
    name: 'security-headers',
    title: 'An HTTPS response with no security headers at all',
    demonstrates:
      'The commonest finding set on a site that was never hardened: nothing is misconfigured, everything is simply absent.',
    modules: ['security'],
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'sec/hsts-missing': 'serious',
        'sec/csp-missing': 'serious',
        'sec/no-sniff': 'moderate',
        'sec/referrer-policy': 'minor',
        'sec/permissions-policy': 'minor',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: {} },
  },
  {
    name: 'csp-permissive',
    title: 'A Content-Security-Policy that is present, enforced and restricts nothing',
    demonstrates:
      'The reason a header presence check is not a security check. This policy would satisfy any audit that asks whether a CSP exists.',
    modules: ['security'],
    before: {
      response: {
        status: 200,
        headers: {
          "content-security-policy": "script-src 'unsafe-inline' 'unsafe-eval' *",
        },
      },
      ids: {
        'sec/csp-unsafeinline': 'moderate',
        'sec/csp-unsafeeval': 'moderate',
        'sec/csp-wildcard-script': 'serious',
        'sec/csp-no-frame-ancestors': 'moderate',
        'sec/csp-no-object-src': 'minor',
        'sec/no-sniff': 'moderate',
        'sec/referrer-policy': 'minor',
        'sec/permissions-policy': 'minor',
        'sec/hsts-missing': 'serious',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: {} },
  },
  {
    name: 'hsts-and-xfo',
    title: 'A short HSTS max-age, and frame protection sent the old way',
    demonstrates:
      'Two findings that change severity rather than appearing or disappearing. The frame-ancestors finding drops to minor when X-Frame-Options is present, because the page is in fact protected in every browser that matters, and a zero max-age is a deliberate kill switch rather than an oversight, so it is serious where a short one is minor.',
    modules: ['security'],
    before: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=86400",
          "content-security-policy": "default-src 'self'; script-src 'self'",
          "x-frame-options": "DENY",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin",
        },
      },
      ids: {
        'sec/hsts-short': 'minor',
        'sec/hsts-no-subdomains': 'minor',
        'sec/csp-no-frame-ancestors': 'minor',
        'sec/csp-no-object-src': 'minor',
        'sec/permissions-policy': 'minor',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: {} },
  },
  {
    name: 'hsts-no-max-age',
    title: 'Strict-Transport-Security sent without a max-age',
    demonstrates:
      'The header is present, so every presence check passes, and it is discarded in full by every browser, so the site has no HSTS at all. This pair exists because the tool used to report it as a deliberate max-age of zero with good subdomain coverage.',
    modules: ['security'],
    before: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: { 'sec/hsts-invalid': 'serious' } },
    after: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: {} },
  },
  {
    name: 'cookie-flags',
    title: 'A session cookie with no flags on it',
    demonstrates:
      'An open family in the catalogue: one finding per cookie, named after the cookie, and the severity depends on whether HttpOnly is the flag that is missing.',
    modules: ['security'],
    before: {
      response: {
        status: 200,
        headers: {},
        setCookie: [
          "session=abc123; Path=/; Secure; SameSite=Lax",
          "prefs=dark; Path=/; Secure; HttpOnly",
        ],
      },
      ids: {
        'sec/cookie-session': 'moderate',
        'sec/cookie-prefs': 'minor',
        'sec/hsts-missing': 'serious',
        'sec/csp-missing': 'serious',
        'sec/no-sniff': 'moderate',
        'sec/referrer-policy': 'minor',
        'sec/permissions-policy': 'minor',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
        setCookie: [
          "session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax",
          "prefs=dark; Path=/; Secure; HttpOnly; SameSite=Lax",
        ],
      }, ids: {} },
  },
  {
    name: 'mixed-content-and-disclosure',
    title: 'An HTTPS page pulling a script over HTTP, from a server that names its version',
    demonstrates:
      'Two findings a page can carry while every header check passes.',
    modules: ['security'],
    before: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
          "server": "Apache/2.4.29 (Ubuntu)",
          "x-powered-by": "PHP/7.4.3",
        },
      },
      ids: {
        'sec/mixed-content': 'serious',
        'sec/version-disclosure': 'minor',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
          "server": "nginx",
        },
      }, ids: {} },
  },
  {
    name: 'server-error',
    title: 'A page that answers 500, and the same page answering 404',
    demonstrates:
      'The residual set that is not empty. Correcting a 500 to a 404 removes nothing: it changes the severity of one finding from critical to serious, which is exactly what a responder needs to see and what a pass or fail flag hides.',
    modules: ['security'],
    before: {
      response: {
        status: 500,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: { 'sec/non-ok-status': 'critical' } },
    after: {
      response: {
        status: 404,
        headers: {
          "strict-transport-security": "max-age=31536000; includeSubDomains",
          "content-security-policy": "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "geolocation=(), camera=(), microphone=()",
        },
      }, ids: { 'sec/non-ok-status': 'serious' } },
  },
  {
    name: 'indexability',
    title: 'A page that excludes itself from search, and disagrees with its own header while doing it',
    demonstrates:
      'The most expensive finding this tool makes. A noindex left on after a staging launch is invisible in a browser.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {
          "x-robots-tag": "index, follow",
        },
      },
      ids: {
        'seo/noindex': 'critical',
        'seo/robots-conflict': 'serious',
        'seo/nofollow-page': 'moderate',
        'seo/canonical-missing': 'moderate',
        'seo/description-missing': 'minor',
        'seo/jsonld-absent': 'info',
        'seo/open-graph': 'minor',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {
          "x-robots-tag": "index, follow",
        },
      }, ids: { 'seo/jsonld-absent': 'info' } },
  },
  {
    name: 'canonical-conflict',
    title: 'Two canonical links that disagree, one of which does not parse',
    demonstrates:
      'Three canonical findings at once, and the reason the catalogue lists five separate canonical entries rather than one.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/canonical-multiple': 'serious',
        'seo/canonical-invalid': 'serious',
        'seo/description-missing': 'minor',
        'seo/jsonld-absent': 'info',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      }, ids: { 'seo/jsonld-absent': 'info' } },
  },
  {
    name: 'title-and-outline',
    title: 'No title, no description, two h1 elements and a skipped heading level',
    demonstrates:
      'The overlap between a search finding and an accessibility finding. A missing h1 is both, and this repository reports it once under the module that can prove it without a browser.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/title-missing': 'serious',
        'seo/description-missing': 'minor',
        'seo/h1-multiple': 'minor',
        'seo/heading-skip': 'minor',
        'seo/canonical-missing': 'moderate',
        'seo/jsonld-absent': 'info',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      }, ids: { 'seo/jsonld-absent': 'info' } },
  },
  {
    name: 'title-too-long',
    title: 'A title long enough to be cut, and a second title element in head',
    demonstrates:
      'Two findings a content team can fix without a developer, and the residual that stays because a long title is a judgement about the result layout rather than a defect.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/title-long': 'minor',
        'seo/title-multiple': 'moderate',
        'seo/description-missing': 'minor',
        'seo/canonical-missing': 'moderate',
        'seo/jsonld-absent': 'info',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      }, ids: { 'seo/jsonld-absent': 'info' } },
  },
  {
    name: 'images',
    title: 'An image with no alt attribute, and a lazy-loaded first image',
    demonstrates:
      'A performance finding the SEO module can make from the HTML alone, with no browser and no measurement: the element most likely to be the largest paint has been told to load last.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/img-alt-attribute': 'moderate',
        'seo/lazy-first-image': 'moderate',
        'seo/canonical-missing': 'moderate',
        'seo/description-missing': 'minor',
        'seo/jsonld-absent': 'info',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      }, ids: { 'seo/jsonld-absent': 'info' } },
  },
  {
    name: 'structured-data',
    title: 'A JSON-LD block that does not parse',
    demonstrates:
      'The third open family. The suffix is the index of the block on the page, so two broken blocks are two findings and not one.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/jsonld-invalid-0': 'serious',
        'seo/jsonld-invalid-2': 'serious',
        'seo/canonical-missing': 'moderate',
        'seo/description-missing': 'minor',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      }, ids: {} },
  },
  {
    name: 'redirects',
    title: 'A permanent redirect followed by a temporary one',
    demonstrates:
      'Findings that are not about the page at all. They come from the response metadata, which is why the pair harness fetches through the real fetch layer rather than reading the file.',
    modules: ['seo'],
    before: {
      response: {
        status: 200,
        headers: {},
        redirectChain: [
          {
            "status": 301,
            "url": "https://example.test/prices",
          },
          {
            "status": 302,
            "url": "https://example.test/pricing-new",
          },
        ],
      },
      ids: {
        'seo/redirect-chain': 'moderate',
        'seo/temporary-redirect': 'minor',
        'seo/canonical-missing': 'moderate',
        'seo/description-missing': 'minor',
        'seo/jsonld-absent': 'info',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      }, ids: { 'seo/jsonld-absent': 'info' } },
  },
  {
    name: 'canonical-elsewhere',
    title: 'A canonical pointing at another origin, and one pointing at a different path on this one',
    demonstrates:
      'Why cross-origin and mismatch are separate entries with different severities. Pointing at another origin hands the page away; pointing at a different path on the same origin is usually a template bug.',
    modules: ['seo'],
    partial:
      'The correction is deliberately incomplete. Pointing the canonical back at this origin stops the page being handed to another host, and it still points at the wrong path, so one serious finding is replaced by one minor one. Every other pair clears what it reports or keeps it unchanged; this is the one that trades down, and a reader should be able to see that happen.',
    before: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/canonical-cross-origin': 'serious',
        'seo/description-missing': 'minor',
        'seo/jsonld-absent': 'info',
      },
    },
    after: {
      response: {
        status: 200,
        headers: {},
      },
      ids: {
        'seo/canonical-mismatch': 'minor',
        'seo/description-missing': 'minor',
        'seo/jsonld-absent': 'info',
      },
    },
  },
];

/**
 * Findings that appear because of how the pair harness serves the page, not
 * because of anything in the example.
 *
 * The declared sets above describe the page as it would be served in
 * production: HTTPS, with a robots.txt. The harness serves over plain HTTP
 * from a loopback address and answers 404 for robots.txt, so a run through
 * the real binary sees two findings more and five fewer. The four HSTS
 * findings are not judged on a page that is not using TLS, and neither is
 * mixed content, because on a page served over HTTP every subresource is
 * insecure and singling one out would say nothing. Both are properties of
 * the checks rather than concessions to the harness, and the test asserts
 * each adjustment is actually needed.
 *
 * Both lists are applied as code rather than written into each pair, so a
 * pair cannot be quietly corrected by adding an entry to its own manifest.
 */
export const SERVED_ADDS = { 'sec/no-https': 'critical', 'seo/robots-missing': 'minor' };
export const SERVED_DROPS = [
  'sec/hsts-missing',
  'sec/hsts-short',
  'sec/hsts-no-subdomains',
  'sec/hsts-invalid',
  'sec/mixed-content',
];

export function servedIds(pair, side) {
  const out = { ...side.ids };
  for (const id of SERVED_DROPS) delete out[id];
  for (const [id, severity] of Object.entries(SERVED_ADDS)) {
    const module = id.split('/')[0] === 'sec' ? 'security' : 'seo';
    if (pair.modules.includes(module)) out[id] = severity;
  }
  return out;
}

export const SIDES = ['before', 'after'];

/**
 * One file per side, flat, named `<pair>.<side>.html`, and the response
 * metadata on the side itself rather than in a JSON file beside the page.
 *
 * The pages were in `examples/<pair>/<side>/page.html` with a
 * `response.json` next to each one, which is a tidier tree and a worse
 * repository: a reader had to open three files to understand one side, and
 * the status, the headers and the cookies were the only part of a side that
 * the test suite could not see in the same place as its declared findings.
 * They are asserted together now because they are read together.
 */
export function pathFor(pair, side) {
  return join(EXAMPLES_DIR, `${pair.name}.${side}.html`);
}

export function relativePathFor(pair, side) {
  return `examples/${pair.name}.${side}.html`;
}

export async function readSide(pair, side) {
  const html = await readFile(pathFor(pair, side), 'utf8');
  return { html, meta: pair[side].response };
}

/** The exact id set a pair side claims, canonical form, as a sorted array. */
export const idsOf = (side) => Object.keys(side.ids).sort();

/** Every id any pair side claims. */
export function allPairIds() {
  const out = new Set();
  for (const pair of PAIRS) for (const side of SIDES) for (const id of idsOf(pair[side])) out.add(id);
  return [...out].sort();
}
