import * as cheerio from 'cheerio';
import { fetchWithMeta } from './util/fetch.mjs';

/**
 * Breadth-first, same-origin, HTML only.
 *
 * This is not a site crawler and does not pretend to be one. It exists so an
 * audit can cover the handful of templates a site actually has, rather than
 * the homepage and nothing else, which is how a site passes an audit and fails
 * on every product page.
 */
export async function discoverUrls(startUrl, { maxPages = 1, exclude = [], timeoutMs = 20000 } = {}) {
  if (maxPages <= 1) return [startUrl];

  const origin = new URL(startUrl).origin;
  const excluders = exclude.map((pattern) => new RegExp(pattern, 'i'));
  const seen = new Set([normalise(startUrl)]);
  const ordered = [startUrl];
  const queue = [startUrl];

  while (queue.length > 0 && ordered.length < maxPages) {
    const current = queue.shift();
    let page;
    try {
      page = await fetchWithMeta(current, { timeoutMs });
    } catch {
      continue;
    }
    if (!page.isHtml) continue;

    const $ = cheerio.load(page.body);
    for (const el of $('a[href]').toArray()) {
      if (ordered.length >= maxPages) break;
      const href = $(el).attr('href');
      let resolved;
      try {
        resolved = new URL(href, page.finalUrl);
      } catch {
        continue;
      }
      resolved.hash = '';
      if (resolved.origin !== origin) continue;
      if (!/^https?:$/.test(resolved.protocol)) continue;
      const key = normalise(resolved.toString());
      if (seen.has(key)) continue;
      if (excluders.some((re) => re.test(resolved.pathname + resolved.search))) continue;
      seen.add(key);
      ordered.push(resolved.toString());
      queue.push(resolved.toString());
    }
  }

  return ordered.slice(0, maxPages);
}

const normalise = (u) => u.replace(/\/$/, '').split('#')[0].toLowerCase();
