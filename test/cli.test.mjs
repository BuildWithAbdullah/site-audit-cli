import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runCli,
  parseArgs,
  resolveOptions,
  normaliseUrl,
  progressLine,
  helpText,
  EXIT,
  DEFAULT_CONFIG_NAME,
  MOBILE_VIEWPORT,
  DESKTOP_VIEWPORT,
  DEFAULT_TIMEOUT_MS,
} from '../src/cli.mjs';
import { ALL_MODULES } from '../src/audit.mjs';

/**
 * The command line, driven with stubs.
 *
 * None of this was testable while it lived in `bin/site-audit.mjs`, because
 * importing that file runs it. It was covered by `node --check`, which proves
 * a file parses and nothing else, and the defect that made the case for this
 * file is recorded in the entry point: the installed binary did nothing at
 * all for the whole life of the package.
 */

const stream = () => {
  const chunks = [];
  return { write: (c) => chunks.push(c), text: () => chunks.join('') };
};

const okReport = (passed = true) => ({
  budget: { passed, results: [] },
  summary: { totalFindings: 0 },
  pages: [],
});

function harness({ files = {}, report = okReport(), runAudit, argv = [] } = {}) {
  const stdout = stream();
  const stderr = stream();
  const written = {};
  const calls = [];
  return {
    stdout,
    stderr,
    written,
    calls,
    run: () =>
      runCli({
        argv,
        cwd: '/work',
        stdout,
        stderr,
        runAudit:
          runAudit ??
          ((url, options) => {
            calls.push({ url, options });
            return Promise.resolve(report);
          }),
        renderers: {
          terminal: () => 'TERMINAL',
          manual: () => 'MANUAL',
          markdown: () => 'MARKDOWN',
          html: () => 'HTML',
          json: () => 'JSON',
        },
        readTextFile: (path) => {
          if (!(path in files)) throw new Error(`stub has no ${path}`);
          return Promise.resolve(files[path]);
        },
        writeTextFile: (path, content) => {
          written[path] = content;
          return Promise.resolve();
        },
        fileExists: (path) => Promise.resolve(path in files),
        resolvePath: (cwd, target) => (target.startsWith('/') ? target : `${cwd}/${target}`),
      }),
  };
}

test('no url prints the help and exits with the could-not-run code', async () => {
  const h = harness({ argv: [] });
  assert.equal(await h.run(), EXIT.couldNotRun);
  assert.ok(h.stdout.text().includes('site-audit <url> [options]'));
  assert.equal(h.calls.length, 0, 'nothing should have been audited');
});

test('--help with a url prints the help and exits zero', async () => {
  const h = harness({ argv: ['example.test', '--help'] });
  assert.equal(await h.run(), EXIT.ok);
  assert.equal(h.calls.length, 0);
});

test('the help text lists every module and every exit code it documents', () => {
  const text = helpText();
  for (const module of ALL_MODULES) assert.ok(text.includes(module), `help omits ${module}`);
  for (const code of Object.values(EXIT)) {
    assert.ok(new RegExp(`^  ${code}  `, 'm').test(text), `help omits exit code ${code}`);
  }
});

test('a bare hostname is given a scheme and an unusable one is refused', async () => {
  assert.equal(normaliseUrl('example.test'), 'https://example.test/');
  assert.equal(normaliseUrl('http://example.test/a'), 'http://example.test/a');
  assert.equal(normaliseUrl('http://%'), null);

  const h = harness({ argv: ['http://%'] });
  assert.equal(await h.run(), EXIT.couldNotRun);
  assert.ok(h.stderr.text().includes('Not a usable URL'));
});

test('an unknown module is refused before anything is audited', async () => {
  const h = harness({ argv: ['example.test', '--only', 'accessibility,astrology'] });
  assert.equal(await h.run(), EXIT.couldNotRun);
  assert.ok(h.stderr.text().includes('astrology'));
  assert.equal(h.calls.length, 0);
});

test('a missing explicit config is an error and a missing default config is not', async () => {
  const explicit = harness({ argv: ['example.test', '--config', 'nope.json'] });
  assert.equal(await explicit.run(), EXIT.couldNotRun);
  assert.ok(explicit.stderr.text().includes('Config not found'));

  const implicit = harness({ argv: ['example.test'] });
  assert.equal(await implicit.run(), EXIT.ok);
  assert.equal(implicit.calls.length, 1);
});

test('a config that is not valid JSON names the file and the parse error', async () => {
  const h = harness({ argv: ['example.test'], files: { [`/work/${DEFAULT_CONFIG_NAME}`]: '{oops' } });
  assert.equal(await h.run(), EXIT.couldNotRun);
  assert.ok(h.stderr.text().includes('is not valid JSON'));
});

test('flags beat the config file, and the config file beats the defaults', () => {
  const fileConfig = {
    modules: ['seo'],
    crawl: { maxPages: 9, exclude: ['/cart'] },
    timeoutMs: 1234,
    viewport: { width: 800, height: 600 },
    budgets: { seo: { serious: 5 } },
  };

  const fromFile = resolveOptions(parseArgs(['example.test']), fileConfig);
  assert.deepEqual(fromFile.options.modules, ['seo']);
  assert.equal(fromFile.options.crawl.maxPages, 9);
  assert.equal(fromFile.options.timeoutMs, 1234);
  assert.deepEqual(fromFile.options.viewport, { width: 800, height: 600 });
  assert.deepEqual(fromFile.options.budgets, { seo: { serious: 5 } });

  const fromFlags = resolveOptions(
    parseArgs(['example.test', '--only', 'security', '--crawl', '3', '--timeout', '50', '--mobile']),
    fileConfig,
  );
  assert.deepEqual(fromFlags.options.modules, ['security']);
  assert.equal(fromFlags.options.crawl.maxPages, 3);
  assert.equal(fromFlags.options.timeoutMs, 50);
  assert.deepEqual(fromFlags.options.viewport, MOBILE_VIEWPORT, '--mobile overrides a config viewport');

  const bare = resolveOptions(parseArgs(['example.test']), {});
  assert.deepEqual(bare.options.modules, ALL_MODULES);
  assert.equal(bare.options.crawl.maxPages, 1);
  assert.equal(bare.options.timeoutMs, DEFAULT_TIMEOUT_MS);
  assert.deepEqual(bare.options.viewport, DESKTOP_VIEWPORT);
});

test('--crawl never goes below one, however it is spelled', () => {
  for (const value of ['0', '-4', 'nonsense', '']) {
    assert.equal(parseArgs(['example.test', '--crawl', value]).crawl, 1, `--crawl ${value}`);
  }
  assert.equal(parseArgs(['example.test', '--crawl', '12']).crawl, 12);
});

test('every report flag writes through the injected writer, and - goes to stdout', async () => {
  const h = harness({
    argv: ['example.test', '--html', 'r.html', '--md', 'out/r.md', '--json', '/abs/r.json', '--quiet'],
  });
  assert.equal(await h.run(), EXIT.ok);
  assert.deepEqual(h.written, {
    '/work/r.html': 'HTML',
    '/work/out/r.md': 'MARKDOWN',
    '/abs/r.json': 'JSON',
  });

  const toStdout = harness({ argv: ['example.test', '--json', '-', '--quiet'] });
  assert.equal(await toStdout.run(), EXIT.ok);
  assert.equal(toStdout.stdout.text(), 'JSON');
  assert.deepEqual(toStdout.written, {}, 'a dash must not create a file called -');
});

test('--quiet suppresses the terminal report and --manual adds the register', async () => {
  const quiet = harness({ argv: ['example.test', '--quiet'] });
  await quiet.run();
  assert.equal(quiet.stdout.text(), '');

  const loud = harness({ argv: ['example.test'] });
  await loud.run();
  assert.ok(loud.stdout.text().includes('TERMINAL'));
  assert.ok(!loud.stdout.text().includes('MANUAL'));

  const manual = harness({ argv: ['example.test', '--manual'] });
  await manual.run();
  assert.ok(manual.stdout.text().includes('MANUAL'));
});

test('the exit code follows the budget, and --no-budget overrides it', async () => {
  const failing = harness({ argv: ['example.test', '--quiet'], report: okReport(false) });
  assert.equal(await failing.run(), EXIT.budgetFailed);

  const ignored = harness({ argv: ['example.test', '--quiet', '--no-budget'], report: okReport(false) });
  assert.equal(await ignored.run(), EXIT.ok);

  const passing = harness({ argv: ['example.test', '--quiet'], report: okReport(true) });
  assert.equal(await passing.run(), EXIT.ok);
});

test('an audit that throws is reported and is not a crash', async () => {
  const h = harness({
    argv: ['example.test', '--quiet'],
    runAudit: () => Promise.reject(new Error('chrome is on fire')),
  });
  assert.equal(await h.run(), EXIT.couldNotRun);
  assert.ok(h.stderr.text().includes('chrome is on fire'));
});

test('progress lines are written to stderr, and only when there is something to say', async () => {
  assert.equal(progressLine({ phase: 'discovered', urls: ['a'] }), null, 'one page is not news');
  assert.ok(progressLine({ phase: 'discovered', urls: ['a', 'b'] }).includes('2'));
  assert.ok(progressLine({ phase: 'page', url: 'u', index: 2, total: 9 }).includes('[3/9]'));
  assert.ok(progressLine({ phase: 'browser-unavailable', message: 'no chrome' }).includes('no chrome'));
  assert.equal(progressLine({ phase: 'something-new' }), null);

  const loud = harness({ argv: ['example.test'] });
  const h = harness({ argv: ['example.test'] });
  await h.run();
  assert.equal(h.stdout.text().includes('TERMINAL'), true);
  assert.equal(loud.stderr.text(), '', 'an unrun harness writes nothing');
});

test('an unknown flag prints the help rather than guessing', () => {
  assert.equal(parseArgs(['example.test', '--colour']).help, true);
  assert.equal(parseArgs(['--only']).only.length, 0, 'a flag with no value is an empty list, not a crash');
});

test('the first bare token is the url and later ones are ignored', () => {
  const args = parseArgs(['first.test', 'second.test']);
  assert.equal(args.url, 'first.test');
});
