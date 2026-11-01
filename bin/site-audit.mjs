#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAudit } from '../src/audit.mjs';
import { runCli } from '../src/cli.mjs';
import { renderTerminal, renderManualGuide } from '../src/report/terminal.mjs';
import { renderMarkdown } from '../src/report/markdown.mjs';
import { renderHtml } from '../src/report/html.mjs';

/**
 * Wiring only. Every decision is in `src/cli.mjs`, which the suite drives
 * with stubs, and `tools/entry-thin.mjs` fails the build if one moves back
 * into this file.
 *
 * The guard below is the reason the rule exists. It used to compare
 * `process.argv[1]` with `import.meta.url` by string, through
 * `new URL('file://' + process.argv[1])`. npm installs a `bin` as a symlink,
 * Node resolves a module path to its realpath, so `import.meta.url` was the
 * real file while `process.argv[1]` was the link: the two never matched, the
 * branch never ran, and `site-audit` printed nothing and exited 0 for every
 * user who installed this package the documented way. Resolving both sides to
 * a real path before comparing is the fix. The string concatenation was also
 * wrong on Windows, where an absolute path starts with a drive letter.
 */
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly || process.env.SITE_AUDIT_FORCE_RUN === '1') {
  runCli({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
    runAudit,
    renderers: {
      terminal: renderTerminal,
      manual: renderManualGuide,
      markdown: renderMarkdown,
      html: renderHtml,
      json: (report) => `${JSON.stringify(report, null, 2)}\n`,
    },
    readTextFile: (path) => readFile(path, 'utf8'),
    writeTextFile: (path, content) => writeFile(path, content, 'utf8'),
    fileExists: (path) => access(path).then(() => true, () => false),
    resolvePath: (cwd, target) => resolve(cwd, target),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Unexpected failure: ${error.stack}\n`);
      process.exitCode = 2;
    });
}
