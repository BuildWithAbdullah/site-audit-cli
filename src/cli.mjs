import { ALL_MODULES } from './audit.mjs';

/**
 * Every decision the command line makes, in a module a test can import.
 *
 * It used to live in `bin/site-audit.mjs`, which the suite could not drive,
 * so the entry point was covered by `node --check` and nothing else. A file
 * that is only parsed is not a file that is tested, and the defect that made
 * the point is recorded in the entry point itself: for the whole life of this
 * package the installed binary did nothing at all, and no test could have
 * noticed, because no test could run it.
 *
 * So `runCli` takes every capability it needs as an argument: the two
 * streams, the environment, the working directory, the audit function, the
 * renderers, and the three file operations. Nothing in here touches the
 * filesystem, the network or `process`. `tools/entry-thin.mjs` fails the
 * build if a decision moves back out.
 */

export const EXIT = { ok: 0, budgetFailed: 1, couldNotRun: 2 };

export function helpText(modules = ALL_MODULES) {
  return `
site-audit  Accessibility, Core Web Vitals, technical SEO and header security
            in one pass, with an explicit account of what it cannot check.

Usage
  site-audit <url> [options]

Options
  --only <list>        Comma-separated modules to run.
                       ${modules.join(', ')}
  --crawl <n>          Audit up to n same-origin pages found from the start URL.
                       Default 1.
  --exclude <list>     Comma-separated regular expressions. Paths matching any
                       of them are skipped while crawling.
  --config <path>      JSON config file. CLI flags override its values.
                       See siteaudit.config.example.json.
  --html <path>        Write a self-contained HTML report.
  --json <path>        Write the full result as JSON. Use "-" for stdout.
  --md <path>          Write a Markdown report.
  --manual             Print how to perform each check a scanner cannot make.
  --mobile             Audit at 390x844 instead of 1366x768.
  --no-budget          Report findings but always exit 0.
  --quiet              Suppress the terminal report. Useful with --json -.
  --timeout <ms>       Per-page timeout. Default 45000.
  -h, --help           This text.

Exit codes
  ${EXIT.ok}  every budget met
  ${EXIT.budgetFailed}  a budget was exceeded
  ${EXIT.couldNotRun}  the audit could not run

Examples
  site-audit https://example.com
  site-audit https://example.com --crawl 12 --html report.html
  site-audit https://example.com --only accessibility --manual
  site-audit https://example.com --json - --quiet | jq '.summary'
`;
}

export function parseArgs(argv) {
  const args = { help: false, quiet: false, manual: false, mobile: false, noBudget: false };
  const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => argv[++i];
    switch (token) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '--only':
        args.only = list(next() ?? '');
        break;
      case '--crawl':
        args.crawl = Math.max(1, Number(next()) || 1);
        break;
      case '--exclude':
        args.exclude = list(next() ?? '');
        break;
      case '--config':
        args.config = next();
        break;
      case '--html':
        args.html = next();
        break;
      case '--json':
        args.json = next();
        break;
      case '--md':
      case '--markdown':
        args.md = next();
        break;
      case '--timeout':
        args.timeout = Number(next()) || 45000;
        break;
      case '--manual':
        args.manual = true;
        break;
      case '--mobile':
        args.mobile = true;
        break;
      case '--quiet':
        args.quiet = true;
        break;
      case '--no-budget':
        args.noBudget = true;
        break;
      default:
        if (token.startsWith('-')) {
          args.help = true;
        } else if (!args.url) {
          args.url = token;
        }
    }
  }
  return args;
}

export const DEFAULT_CONFIG_NAME = 'siteaudit.config.json';
export const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 };
export const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
export const DEFAULT_TIMEOUT_MS = 45000;

/**
 * Turns parsed arguments and a config file into the options `runAudit`
 * takes. Separated out because precedence is the part of a command line that
 * is quietly wrong most often, and it can be asserted on its own.
 */
export function resolveOptions(args, fileConfig, { allModules = ALL_MODULES } = {}) {
  const modules = args.only ?? fileConfig.modules ?? allModules;
  const unknown = modules.filter((m) => !allModules.includes(m));
  return {
    unknown,
    options: {
      modules,
      crawl: {
        maxPages: args.crawl ?? fileConfig.crawl?.maxPages ?? 1,
        exclude: args.exclude ?? fileConfig.crawl?.exclude ?? [],
      },
      budgets: fileConfig.budgets ?? {},
      viewport: args.mobile
        ? MOBILE_VIEWPORT
        : (fileConfig.viewport ?? DESKTOP_VIEWPORT),
      timeoutMs: args.timeout ?? fileConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    },
  };
}

export function normaliseUrl(raw) {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return null;
  }
}

export function progressLine(event) {
  if (event.phase === 'discovered' && event.urls.length > 1) {
    return `Discovered ${event.urls.length} page(s).\n`;
  }
  if (event.phase === 'page') return `[${event.index + 1}/${event.total}] ${event.url}\n`;
  if (event.phase === 'browser-unavailable') return `No browser: ${event.message}\n`;
  return null;
}

export async function runCli({
  argv,
  cwd,
  stdout,
  stderr,
  runAudit,
  renderers,
  readTextFile,
  writeTextFile,
  fileExists,
  resolvePath,
  allModules = ALL_MODULES,
}) {
  const args = parseArgs(argv);
  if (args.help || !args.url) {
    stdout.write(`${helpText(allModules)}\n`);
    return args.url ? EXIT.ok : EXIT.couldNotRun;
  }

  const url = normaliseUrl(args.url);
  if (url === null) {
    stderr.write(`Not a usable URL: ${args.url}\n`);
    return EXIT.couldNotRun;
  }

  let fileConfig;
  try {
    fileConfig = await readConfig(args.config, { cwd, readTextFile, fileExists, resolvePath });
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return EXIT.couldNotRun;
  }

  const { unknown, options } = resolveOptions(args, fileConfig, { allModules });
  if (unknown.length > 0) {
    stderr.write(`Unknown module(s): ${unknown.join(', ')}\n`);
    return EXIT.couldNotRun;
  }

  let report;
  try {
    report = await runAudit(url, {
      ...options,
      onProgress: args.quiet
        ? () => {}
        : (event) => {
            const line = progressLine(event);
            if (line) stderr.write(line);
          },
    });
  } catch (error) {
    stderr.write(`Audit failed: ${error.message}\n`);
    return EXIT.couldNotRun;
  }

  if (!args.quiet) {
    stdout.write(`${renderers.terminal(report)}\n`);
    if (args.manual) stdout.write(`${renderers.manual(report)}\n`);
  }

  for (const [flag, render] of [
    [args.html, renderers.html],
    [args.md, renderers.markdown],
    [args.json, renderers.json],
  ]) {
    if (!flag) continue;
    const content = render(report);
    if (flag === '-') {
      stdout.write(content);
      continue;
    }
    const path = resolvePath(cwd, flag);
    await writeTextFile(path, content);
    stderr.write(`Wrote ${path}\n`);
  }

  if (args.noBudget) return EXIT.ok;
  return report.budget.passed ? EXIT.ok : EXIT.budgetFailed;
}

async function readConfig(explicit, { cwd, readTextFile, fileExists, resolvePath }) {
  const path = resolvePath(cwd, explicit ?? DEFAULT_CONFIG_NAME);
  if (!(await fileExists(path))) {
    if (explicit) throw new Error(`Config not found: ${path}`);
    return {};
  }
  try {
    return JSON.parse(await readTextFile(path));
  } catch (error) {
    throw new Error(`Config at ${path} is not valid JSON: ${error.message}`);
  }
}
