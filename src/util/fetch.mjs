import { truncate } from './severity.mjs';

/**
 * Fetches a URL without following redirects automatically, so the redirect
 * chain itself becomes evidence.
 *
 * Two things here are deliberate. Redirects are walked by hand because a
 * migration that works but costs three hops is a finding, and `redirect:
 * 'follow'` hides it. And the response body is read as text only for HTML,
 * because downloading a 40MB PDF to count its headings helps nobody.
 */
export async function fetchWithMeta(url, { timeoutMs = 20000, maxHops = 10, userAgent } = {}) {
  const chain = [];
  let current = url;
  let response = null;
  const startedAt = Date.now();
  let firstByteMs = null;

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const hopStart = Date.now();
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: userAgent ? { 'user-agent': userAgent } : undefined,
      });
      if (firstByteMs === null) firstByteMs = Date.now() - hopStart;
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400 && location;
    chain.push({ url: current, status: response.status, location: location || null });
    if (!isRedirect) break;
    current = new URL(location, current).toString();
    if (hop === maxHops) {
      throw new Error(`redirect chain longer than ${maxHops} hops starting at ${url}`);
    }
  }

  const headers = {};
  for (const [key, value] of response.headers.entries()) headers[key.toLowerCase()] = value;

  const contentType = headers['content-type'] || '';
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
  const body = isHtml ? await response.text() : '';

  return {
    requestedUrl: url,
    finalUrl: current,
    status: response.status,
    headers,
    setCookie: readSetCookie(response),
    body,
    isHtml,
    contentType: truncate(contentType, 80),
    redirectChain: chain,
    totalMs: Date.now() - startedAt,
    firstByteMs,
  };
}

function readSetCookie(response) {
  // getSetCookie is the only way to see more than one Set-Cookie header;
  // headers.get() joins them with a comma, which is unparseable because
  // Expires dates contain commas of their own.
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

export async function fetchText(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return { status: res.status, text: res.ok ? await res.text() : '' };
  } catch {
    return { status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}
