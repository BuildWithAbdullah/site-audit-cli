import { createServer } from 'node:http';
import { readSide } from './pairs.mjs';

/**
 * Serves one pair side at a time over real HTTP, so the examples can be run
 * through the real binary rather than only through the check modules.
 *
 * One side at a time, always at the same path, because the paths matter: a
 * relative canonical resolves against the URL that served the page, and a
 * query string or a per-pair path would make every corrected page report a
 * canonical mismatch that has nothing to do with the example.
 *
 * `/robots.txt` answers 404 on purpose. A served run therefore sees one SEO
 * finding more than the declared set, and `servedIds` in `tools/pairs.mjs`
 * adds it as code rather than letting each pair add it to its own manifest.
 */
export const PAGE_PATH = '/pricing';
export const ENTRY_WITH_REDIRECTS = '/start';
const MID_PATH = '/mid';

export async function startPairServer() {
  let current = null;

  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];

    if (path === '/robots.txt') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found\n');
      return;
    }

    if (!current) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('no side selected\n');
      return;
    }

    const chain = current.meta.redirectChain ?? [];
    if (chain.length > 0 && path === ENTRY_WITH_REDIRECTS) {
      res.writeHead(chain[0].status, { location: MID_PATH });
      res.end();
      return;
    }
    if (chain.length > 1 && path === MID_PATH) {
      res.writeHead(chain[1].status, { location: PAGE_PATH });
      res.end();
      return;
    }

    if (path !== PAGE_PATH) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found\n');
      return;
    }

    const headers = { 'content-type': 'text/html; charset=utf-8', ...(current.meta.headers ?? {}) };
    const cookies = current.meta.setCookie ?? [];
    if (cookies.length > 0) headers['set-cookie'] = cookies;
    res.writeHead(current.meta.status ?? 200, headers);
    res.end(current.html);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    async select(pair, side) {
      current = await readSide(pair, side);
      return `http://127.0.0.1:${port}${(current.meta.redirectChain ?? []).length > 0 ? ENTRY_WITH_REDIRECTS : PAGE_PATH}`;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
