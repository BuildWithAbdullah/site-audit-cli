import { launchBrowser, openPage } from './browser.mjs';
import { fetchWithMeta } from './util/fetch.mjs';
import { discoverUrls } from './crawl.mjs';
import { auditAccessibility } from './checks/accessibility.mjs';
import { auditPerformance } from './checks/performance.mjs';
import { auditSeo } from './checks/seo.mjs';
import { auditSecurity } from './checks/security.mjs';
import { bySeverity, countBySeverity, finding, truncate } from './util/severity.mjs';
import { DEFAULT_BUDGETS, evaluateBudgets, mergeBudgets } from './budgets.mjs';

export const ALL_MODULES = ['accessibility', 'performance', 'seo', 'security'];

const USER_AGENT =
  'Mozilla/5.0 (compatible; site-audit-cli/1.0; +https://github.com/BuildWithAbdullah/site-audit-cli)';

export async function runAudit(startUrl, options = {}) {
  const {
    modules = ALL_MODULES,
    crawl = { maxPages: 1, exclude: [] },
    budgets: budgetOverride = {},
    viewport = { width: 1366, height: 768 },
    timeoutMs = 45000,
    onProgress = () => {},
  } = options;

  const budgets = mergeBudgets(DEFAULT_BUDGETS, budgetOverride);
  const needsBrowser = modules.includes('accessibility') || modules.includes('performance');
  const startedAt = new Date();

  const urls = await discoverUrls(startUrl, { ...crawl, timeoutMs });
  onProgress({ phase: 'discovered', urls });

  let browser = null;
  if (needsBrowser) browser = await launchBrowser();

  const pages = [];
  try {
    for (const [index, url] of urls.entries()) {
      onProgress({ phase: 'page', url, index, total: urls.length });
      pages.push(await auditPage(url, { browser, modules, budgets, viewport, timeoutMs }));
    }
  } finally {
    if (browser) await browser.close();
  }

  const findings = pages.flatMap((p) => p.findings);
  const defects = findings.filter((f) => f.kind !== 'manual' && f.severity !== 'info');
  const budget = evaluateBudgets(pages, budgets);

  return {
    tool: { name: 'site-audit-cli', version: '1.0.0' },
    target: startUrl,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    modules,
    pages,
    summary: {
      pagesAudited: pages.length,
      totalFindings: defects.length,
      bySeverity: countBySeverity(defects),
      byModule: Object.fromEntries(
        ALL_MODULES.map((m) => [m, defects.filter((f) => f.module === m).length]),
      ),
      manualChecksOutstanding: findings.filter((f) => f.kind === 'manual').length,
    },
    budget,
  };
}

async function auditPage(url, { browser, modules, budgets, viewport, timeoutMs }) {
  const findings = [];
  let metrics = null;
  let automated = null;
  let consoleErrors = [];
  const errors = [];

  let response = null;
  try {
    response = await fetchWithMeta(url, { timeoutMs, userAgent: USER_AGENT });
  } catch (error) {
    return {
      url,
      ok: false,
      findings: [
        finding({
          id: 'run/unreachable',
          module: 'security',
          severity: 'critical',
          title: 'Page could not be fetched',
          detail:
            'No audit ran against this URL. A timeout here is itself a finding: whatever a visitor would have experienced, this is it.',
          evidence: truncate(String(error.message), 160),
        }),
      ],
      errors: [String(error.message)],
    };
  }

  if (modules.includes('security')) {
    findings.push(...auditSecurity(response));
  }

  if (modules.includes('seo')) {
    try {
      findings.push(...(await auditSeo(response)));
    } catch (error) {
      errors.push(`seo: ${error.message}`);
    }
  }

  if (browser && (modules.includes('accessibility') || modules.includes('performance'))) {
    let page = null;
    try {
      const opened = await openPage(browser, url, { viewport, timeoutMs, userAgent: USER_AGENT });
      page = opened.page;
      consoleErrors = opened.consoleErrors;

      if (modules.includes('accessibility')) {
        const a11y = await auditAccessibility(page);
        findings.push(...a11y.findings);
        automated = a11y.automated;
      }
      if (modules.includes('performance')) {
        const perf = await auditPerformance(page, { budgets: budgets.performance });
        findings.push(...perf.findings);
        metrics = perf.metrics;
      }
    } catch (error) {
      errors.push(`browser: ${error.message}`);
      // A module that did not run is not a module that found nothing. Without
      // this, a page the browser could not open reports zero accessibility
      // violations and passes its budget, which is the precise failure mode
      // this tool exists to argue against.
      for (const name of modules.filter((m) => m === 'accessibility' || m === 'performance')) {
        findings.push(
          finding({
            id: `run/${name}-did-not-run`,
            module: name,
            severity: 'serious',
            title: `The ${name} module did not run on this page`,
            detail:
              'The page could not be opened in a browser, so these checks were never performed. This page is unaudited for them, which is not the same as clean, and the budget fails accordingly.',
            evidence: truncate(String(error.message), 160),
          }),
        );
      }
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  if (consoleErrors.length > 0) {
    findings.push(
      finding({
        id: 'run/console-errors',
        module: 'performance',
        severity: 'minor',
        title: `${consoleErrors.length} JavaScript error${consoleErrors.length === 1 ? '' : 's'} on load`,
        detail:
          'Reported because a script that threw did not finish. Whatever it was responsible for, a slider, a filter, a tracking call, did not happen for this visitor either.',
        evidence: truncate(consoleErrors[0], 180),
        count: consoleErrors.length,
      }),
    );
  }

  return {
    url,
    ok: true,
    status: response.status,
    finalUrl: response.finalUrl,
    redirectChain: response.redirectChain,
    findings: findings.sort(bySeverity),
    metrics,
    automated,
    errors,
  };
}
