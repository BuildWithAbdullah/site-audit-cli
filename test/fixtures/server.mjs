import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Two fixture sites on one server, distinguished by path prefix, so tests can
 * assert both that a defect is found and that a correct page produces nothing.
 *
 * The header sets are part of the fixture. A security module tested only
 * against a page with no headers proves nothing about the case that matters,
 * which is a header that is present and useless.
 */
const HEADERS = {
  broken: {
    'content-type': 'text/html; charset=utf-8',
    server: 'Apache/2.4.29 (Ubuntu)',
    'x-powered-by': 'PHP/7.2.24',
    'content-security-policy': "default-src * 'unsafe-inline' 'unsafe-eval'",
    'strict-transport-security': 'max-age=0',
    'set-cookie': 'session_id=abc123; Path=/',
  },
  clean: {
    'content-type': 'text/html; charset=utf-8',
    // style-src is spelled out because the fixture styles the page with an
    // inline <style> block. Without it, default-src 'self' blocks the block
    // outright and the page renders unstyled, which is exactly the class of
    // bug a report-only rollout is supposed to catch before enforcement.
    'content-security-policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'set-cookie': 'session_id=abc123; Path=/; Secure; HttpOnly; SameSite=Lax',
  },
};

const ROBOTS = `User-agent: *
Disallow: /cart
Sitemap: http://localhost/sitemap.xml
`;

export async function startFixtureServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(new URL(req.url, 'http://localhost').pathname);

    if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(ROBOTS);
      return;
    }

    const variant = path.startsWith('/clean') ? 'clean' : 'broken';
    const file = path.endsWith('/second.html') ? 'second.html' : 'index.html';

    try {
      const body = await readFile(join(HERE, variant, file), 'utf8');
      res.writeHead(200, HEADERS[variant]);
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Not found</title>');
    }
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    brokenUrl: `http://127.0.0.1:${port}/broken/index.html`,
    cleanUrl: `http://127.0.0.1:${port}/clean/index.html`,
    async close() {
      await new Promise((r) => server.close(r));
    },
  };
}
