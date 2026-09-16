#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAudit, ALL_MODULES } from '../src/audit.mjs';
import { renderTerminal, renderManualGuide } from '../src/report/terminal.mjs';
import { renderMarkdown } from '../src/report/markdown.mjs';
import { renderHtml } from '../src/report/html.mjs';

const HELP = `
site-audit  Accessibility, Core Web Vitals, technical SEO and header security
            in one pass, with an explicit account of what it cannot check.

Usage
  site-audit <url> [options]

Options
  --only <list>        Comma-separated modules to run.
                       ${ALL_MODULES.join(', ')}
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
  0  every budget met
  1  a budget was exceeded
  2  the audit could not run

Examples
  site-audit https://example.com
  site-audit https://example.com --crawl 12 --html report.html
  site-audit https://example.com --only accessibility --manual
  site-audit https://example.com --json - --quiet | jq '.summary'
`;

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.url) {
    process.stdout.write(`${HELP}\n`);
    return args.url ? 0 : 2;
  }

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(args.url) ? args.url : `https://${args.url}`).toString();
  } catch {
    process.stderr.write(`Not a usable URL: ${args.url}\n`);
    return 2;
  }

  const fileConfig = args.config ? await readConfig(args.config) : await readConfig(null);
  const modules = args.only ?? fileConfig.modules ?? ALL_MODULES;
  const unknown = modules.filter((m) => !ALL_MODULES.includes(m));
  if (unknown.length > 0) {
    process.stderr.write(`Unknown module(s): ${unknown.join(', ')}\n`);
    return 2;
  }

  const options = {
    modules,
    crawl: {
      maxPages: args.crawl ?? fileConfig.crawl?.maxPages ?? 1,
      exclude: args.exclude ?? fileConfig.crawl?.exclude ?? [],
    },
    budgets: fileConfig.budgets ?? {},
    viewport: args.mobile
      ? { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }
      : (fileConfig.viewport ?? { width: 1366, height: 768 }),
    timeoutMs: args.timeout ?? fileConfig.timeoutMs ?? 45000,
    onProgress: args.quiet ? () => {} : progress,
  };

  let report;
  try {
    report = await runAudit(url, options);
  } catch (error) {
    process.stderr.write(`Audit failed: ${error.message}\n`);
    return 2;
  }

  if (!args.quiet) {
    process.stdout.write(`${renderTerminal(report)}\n`);
    if (args.manual) process.stdout.write(`${renderManualGuide(report)}\n`);
  }

  await Promise.all([
    write(args.html, () => renderHtml(report)),
    write(args.md, () => renderMarkdown(report)),
    write(args.json, () => `${JSON.stringify(report, null, 2)}\n`),
  ]);

  if (args.noBudget) return 0;
  return report.budget.passed ? 0 : 1;
}

async function write(target, render) {
  if (!target) return;
  const content = render();
  if (target === '-') {
    process.stdout.write(content);
    return;
  }
  const path = resolve(process.cwd(), target);
  await writeFile(path, content, 'utf8');
  process.stderr.write(`Wrote ${path}\n`);
}

function progress(event) {
  if (event.phase === 'discovered' && event.urls.length > 1) {
    process.stderr.write(`Discovered ${event.urls.length} page(s).\n`);
  }
  if (event.phase === 'page') {
    process.stderr.write(`[${event.index + 1}/${event.total}] ${event.url}\n`);
  }
}

async function readConfig(explicit) {
  const path = explicit
    ? resolve(process.cwd(), explicit)
    : resolve(process.cwd(), 'siteaudit.config.json');
  if (!existsSync(path)) {
    if (explicit) throw new Error(`Config not found: ${path}`);
    return {};
  }
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Config at ${path} is not valid JSON: ${error.message}`);
  }
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

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly || process.env.SITE_AUDIT_FORCE_RUN === '1') {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Unexpected failure: ${error.stack}\n`);
      process.exitCode = 2;
    });
}

export { main, HELP };
