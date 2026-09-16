import * as cheerio from 'cheerio';
import { finding, truncate } from '../util/severity.mjs';
import { fetchText } from '../util/fetch.mjs';

/**
 * Crawlability and indexation first, then the things people usually audit.
 *
 * The order is the point. A perfect title on a page carrying
 * `X-Robots-Tag: noindex` is a perfect title on a page nobody will ever see in
 * a search result, and Search Console will not raise its hand about it,
 * because from Google's side nothing is wrong.
 */
export async function auditSeo({ finalUrl, headers, body, isHtml, redirectChain = [] }, { fetchRobots = true } = {}) {
  if (!isHtml) return [];
  const $ = cheerio.load(body);
  const findings = [];
  const url = new URL(finalUrl);

  findings.push(...checkIndexability($, headers, finalUrl));
  findings.push(...checkCanonical($, finalUrl));
  findings.push(...checkTitleAndDescription($));
  findings.push(...checkHeadingOutline($));
  findings.push(...checkStructuredData($));
  findings.push(...checkOpenGraph($));
  findings.push(...checkRedirects(redirectChain));
  findings.push(...checkImages($));

  if (fetchRobots) findings.push(...(await checkRobots(url)));
  return findings;
}

function checkIndexability($, headers, finalUrl) {
  const out = [];
  const metaRobots = $('meta[name="robots" i], meta[name="googlebot" i]')
    .map((_, el) => $(el).attr('content') || '')
    .get()
    .join(', ');
  const headerRobots = headers['x-robots-tag'] || '';
  const combined = `${metaRobots} ${headerRobots}`.toLowerCase();

  if (/\bnoindex\b/.test(combined)) {
    out.push(
      finding({
        id: 'seo/noindex',
        module: 'seo',
        severity: 'critical',
        title: 'Page is marked noindex',
        detail:
          'This page is excluded from search results by its own instruction. If that is intentional, nothing to do. If it is a staging setting that shipped, it is the most expensive line on the site.',
        evidence: truncate(headerRobots ? `X-Robots-Tag: ${headerRobots}` : `meta robots: ${metaRobots}`, 140),
        help: 'Check both places. A meta tag and an X-Robots-Tag header can disagree, and the header wins.',
      }),
    );
  }

  if (metaRobots && headerRobots && /\bnoindex\b/.test(headerRobots) !== /\bnoindex\b/.test(metaRobots)) {
    out.push(
      finding({
        id: 'seo/robots-conflict',
        module: 'seo',
        severity: 'serious',
        title: 'Meta robots and X-Robots-Tag disagree',
        detail:
          'Two sources of truth for the same instruction, and the header is the one that applies. This usually means a plugin and a server rule were configured by different people.',
        evidence: truncate(`meta: ${metaRobots} | header: ${headerRobots}`, 160),
      }),
    );
  }

  if (/\bnofollow\b/.test(combined)) {
    out.push(
      finding({
        id: 'seo/nofollow-page',
        module: 'seo',
        severity: 'moderate',
        title: 'Page-level nofollow is set',
        detail: 'Every link on the page is discounted, including the ones pointing at your own pages.',
        evidence: truncate(combined, 120),
      }),
    );
  }

  return out;
}

function checkCanonical($, finalUrl) {
  const links = $('link[rel="canonical" i]');
  if (links.length === 0) {
    return [
      finding({
        id: 'seo/canonical-missing',
        module: 'seo',
        severity: 'moderate',
        title: 'No canonical link',
        detail:
          'Without one, every parameter variant of this URL, from tracking tags to a session id, is a separate candidate page competing with the original.',
      }),
    ];
  }
  const out = [];
  if (links.length > 1) {
    out.push(
      finding({
        id: 'seo/canonical-multiple',
        module: 'seo',
        severity: 'serious',
        title: `${links.length} canonical links on one page`,
        detail:
          'Search engines discard all of them when they conflict, which leaves the page in the same position as having none, with the added cost of looking deliberate.',
      }),
    );
  }
  const href = links.first().attr('href');
  if (!href) return out;

  let resolved;
  try {
    resolved = new URL(href, finalUrl);
  } catch {
    out.push(
      finding({
        id: 'seo/canonical-invalid',
        module: 'seo',
        severity: 'serious',
        title: 'Canonical href is not a valid URL',
        detail: 'An unparseable canonical is ignored, silently.',
        evidence: truncate(href, 140),
      }),
    );
    return out;
  }

  if (resolved.origin !== new URL(finalUrl).origin) {
    out.push(
      finding({
        id: 'seo/canonical-cross-origin',
        module: 'seo',
        severity: 'serious',
        title: 'Canonical points at a different origin',
        detail:
          'This hands the page to another host. On a migrated site it is usually the old domain left behind in a template.',
        evidence: truncate(resolved.toString(), 140),
      }),
    );
  } else if (stripSlash(resolved.toString()) !== stripSlash(finalUrl)) {
    out.push(
      finding({
        id: 'seo/canonical-mismatch',
        module: 'seo',
        severity: 'minor',
        title: 'Canonical does not match the URL that served this page',
        detail:
          'Often correct and deliberate, on a paginated or filtered view. Worth confirming it is deliberate here.',
        evidence: truncate(`served ${finalUrl} | canonical ${resolved}`, 160),
      }),
    );
  }
  return out;
}

const stripSlash = (u) => u.replace(/\/$/, '').split('#')[0];

function checkTitleAndDescription($) {
  const out = [];
  const titles = $('head title');
  const title = titles.first().text().trim();

  if (titles.length === 0 || title.length === 0) {
    out.push(
      finding({
        id: 'seo/title-missing',
        module: 'seo',
        severity: 'serious',
        title: 'Page has no title',
        detail:
          'The title is the search result headline, the browser tab label and the first thing a screen reader announces on page load. Three jobs, one element.',
        wcag: ['2.4.2'],
      }),
    );
  } else if (title.length > 65) {
    out.push(
      finding({
        id: 'seo/title-long',
        module: 'seo',
        severity: 'minor',
        title: `Title is ${title.length} characters`,
        detail: 'It will be cut in most result layouts. Put the distinguishing words first rather than the brand.',
        evidence: truncate(title, 140),
      }),
    );
  }

  if (titles.length > 1) {
    out.push(
      finding({
        id: 'seo/title-multiple',
        module: 'seo',
        severity: 'moderate',
        title: `${titles.length} title elements in head`,
        detail: 'Usually a theme and a plugin both writing one. Only the first is used; the rest are noise in the source.',
      }),
    );
  }

  const description = $('meta[name="description" i]').first().attr('content');
  if (!description || description.trim().length === 0) {
    out.push(
      finding({
        id: 'seo/description-missing',
        module: 'seo',
        severity: 'minor',
        title: 'No meta description',
        detail:
          'Not a ranking factor, and it is still the snippet that decides whether a result gets the click. Without one the engine picks a sentence for you.',
      }),
    );
  }
  return out;
}

function checkHeadingOutline($) {
  const out = [];
  const headings = $('h1, h2, h3, h4, h5, h6')
    .map((_, el) => ({ level: Number(el.tagName[1]), text: $(el).text().trim() }))
    .get();
  const h1s = headings.filter((h) => h.level === 1);

  if (h1s.length === 0) {
    out.push(
      finding({
        id: 'seo/h1-missing',
        module: 'seo',
        severity: 'moderate',
        title: 'No h1 on the page',
        detail:
          'Screen reader users navigate by heading before they navigate by anything else, and the h1 is where that tour starts. This is a search finding and an accessibility finding at the same time.',
        wcag: ['1.3.1', '2.4.6'],
      }),
    );
  } else if (h1s.length > 1) {
    out.push(
      finding({
        id: 'seo/h1-multiple',
        module: 'seo',
        severity: 'minor',
        title: `${h1s.length} h1 elements`,
        detail:
          'Valid in HTML5 sectioning terms and still confusing in practice, because assistive technology presents one flat outline regardless of the sectioning.',
        evidence: truncate(h1s.map((h) => h.text).join(' | '), 160),
      }),
    );
  }

  let previous = 0;
  for (const h of headings) {
    if (previous && h.level > previous + 1) {
      out.push(
        finding({
          id: 'seo/heading-skip',
          module: 'seo',
          severity: 'minor',
          title: `Heading level jumps from h${previous} to h${h.level}`,
          detail:
            'A skipped level reads as a missing section. It is almost always a heading chosen for its font size rather than its place in the outline.',
          evidence: truncate(h.text, 120),
          wcag: ['1.3.1'],
        }),
      );
      break;
    }
    previous = h.level;
  }
  return out;
}

function checkStructuredData($) {
  const blocks = $('script[type="application/ld+json"]');
  if (blocks.length === 0) {
    return [
      finding({
        id: 'seo/jsonld-absent',
        module: 'seo',
        severity: 'info',
        title: 'No JSON-LD structured data',
        detail:
          'Not a defect. It is the difference between a plain result and one carrying a breadcrumb, a price or a rating, and it is the cheapest visible change on most result pages.',
      }),
    ];
  }
  const out = [];
  blocks.each((index, el) => {
    const raw = $(el).contents().text();
    try {
      JSON.parse(raw);
    } catch (error) {
      out.push(
        finding({
          id: `seo/jsonld-invalid-${index}`,
          module: 'seo',
          severity: 'serious',
          title: 'JSON-LD block does not parse',
          detail:
            'An invalid block is discarded whole. Search Console reports nothing, because from its side the page simply has no structured data. A trailing comma from a template loop is the usual cause.',
          evidence: truncate(`${error.message} near: ${raw.slice(0, 80)}`, 160),
        }),
      );
    }
  });
  return out;
}

function checkOpenGraph($) {
  const required = ['og:title', 'og:description', 'og:image'];
  const missing = required.filter(
    (p) => $(`meta[property="${p}" i]`).attr('content') === undefined,
  );
  if (missing.length === 0) return [];
  return [
    finding({
      id: 'seo/open-graph',
      module: 'seo',
      severity: 'minor',
      title: `Open Graph tags missing: ${missing.join(', ')}`,
      detail:
        'Every share of this page on a social platform, in Slack or in a message app renders as a bare link. The cost is paid by whoever was trying to promote it.',
    }),
  ];
}

function checkRedirects(chain) {
  const hops = chain.filter((c) => c.status >= 300 && c.status < 400);
  const out = [];
  if (hops.length >= 2) {
    out.push(
      finding({
        id: 'seo/redirect-chain',
        module: 'seo',
        severity: 'moderate',
        title: `${hops.length} redirects before the page is served`,
        detail:
          'Each hop is a full round trip added to the time before anything renders, and chains are where a migration quietly loses the link equity it was supposed to carry over.',
        evidence: truncate(chain.map((c) => `${c.status} ${c.url}`).join(' -> '), 200),
      }),
    );
  }
  const temporary = hops.filter((h) => h.status === 302 || h.status === 307);
  if (temporary.length > 0) {
    out.push(
      finding({
        id: 'seo/temporary-redirect',
        module: 'seo',
        severity: 'minor',
        title: 'A temporary redirect sits in front of this page',
        detail:
          'A 302 tells search engines to keep the old URL. On a permanent move that is the opposite of the intent, and it is usually a default nobody chose.',
        evidence: truncate(temporary.map((h) => `${h.status} ${h.url}`).join(' | '), 160),
      }),
    );
  }
  return out;
}

function checkImages($) {
  const images = $('img');
  const missingAlt = images.filter((_, el) => $(el).attr('alt') === undefined).length;
  const lazyAboveFold = $('img[loading="lazy"]').slice(0, 1).length;
  const out = [];
  if (missingAlt > 0) {
    out.push(
      finding({
        id: 'seo/img-alt-attribute',
        module: 'seo',
        severity: 'moderate',
        title: `${missingAlt} image${missingAlt === 1 ? ' has' : 's have'} no alt attribute`,
        detail:
          'Counted here as a crawl signal. The accessibility module judges whether the text is any good, which is a separate and harder question.',
        wcag: ['1.1.1'],
        count: missingAlt,
      }),
    );
  }
  if (lazyAboveFold > 0 && $('img').first().attr('loading') === 'lazy') {
    out.push(
      finding({
        id: 'seo/lazy-first-image',
        module: 'seo',
        severity: 'moderate',
        title: 'The first image on the page is lazy-loaded',
        detail:
          'If this is the hero it is very likely the Largest Contentful Paint element, and lazy loading delays exactly the request that decides the metric.',
      }),
    );
  }
  return out;
}

async function checkRobots(url) {
  const robotsUrl = new URL('/robots.txt', url.origin).toString();
  const { status, text } = await fetchText(robotsUrl);
  if (status === 0) return [];
  if (status === 404) {
    return [
      finding({
        id: 'seo/robots-missing',
        module: 'seo',
        severity: 'minor',
        title: 'No robots.txt',
        detail:
          'Crawling is unrestricted, which is usually fine, and there is nowhere to advertise the sitemap. A 404 here is also a missed chance to keep crawlers out of search and filter URLs.',
        evidence: robotsUrl,
      }),
    ];
  }
  const out = [];
  if (/^\s*disallow:\s*\/\s*$/im.test(text) && /user-agent:\s*\*/i.test(text)) {
    out.push(
      finding({
        id: 'seo/robots-disallow-all',
        module: 'seo',
        severity: 'critical',
        title: 'robots.txt disallows the whole site',
        detail:
          'Worth knowing: this blocks crawling, not indexing. A URL blocked here can still appear in results with no description, and because the page cannot be fetched, a noindex tag on it is never read.',
        evidence: robotsUrl,
      }),
    );
  }
  if (!/sitemap:/i.test(text)) {
    out.push(
      finding({
        id: 'seo/robots-no-sitemap',
        module: 'seo',
        severity: 'minor',
        title: 'robots.txt does not declare a sitemap',
        detail: 'One line, and it is how a crawler that arrives without a submitted sitemap finds the URL list.',
        evidence: robotsUrl,
      }),
    );
  }
  return out;
}
