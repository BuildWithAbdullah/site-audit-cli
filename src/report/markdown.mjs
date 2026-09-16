import { SEVERITIES } from '../util/severity.mjs';
import { formatBytes } from '../checks/performance.mjs';

/**
 * Markdown exists for the place a report actually gets read: a pull request
 * comment, a ticket, an email to a client who will not open an attachment.
 */
export function renderMarkdown(report) {
  const out = [];
  const counts = report.summary.bySeverity;

  out.push(`# Audit: ${report.target}`);
  out.push('');
  out.push(
    `${report.summary.pagesAudited} page(s) audited on ${new Date(report.startedAt).toUTCString()} by site-audit-cli ${report.tool.version}.`,
  );
  out.push('');
  out.push('| Severity | Count |');
  out.push('|---|---|');
  for (const s of SEVERITIES.filter((x) => x !== 'info')) {
    out.push(`| ${s} | ${counts[s] ?? 0} |`);
  }
  out.push('');

  out.push('## Budgets');
  out.push('');
  out.push('| Check | Result | Actual | Limit |');
  out.push('|---|---|---|---|');
  for (const r of report.budget.results) {
    out.push(
      `| ${r.module}.${r.metric} | ${r.passed ? 'pass' : '**FAIL**'} | ${format(r.actual, r.unit)} | ${format(r.limit, r.unit)} |`,
    );
  }
  out.push('');

  for (const page of report.pages) {
    out.push(`## ${page.url}`);
    out.push('');
    if (page.metrics) {
      const m = page.metrics;
      out.push(
        `Lab metrics: LCP ${m.lcpMs === null ? 'n/a' : `${Math.round(m.lcpMs)}ms`}, CLS ${m.cls.toFixed(3)}, TBT ${Math.round(m.tbtMs)}ms, TTFB ${Math.round(m.ttfbMs)}ms, ${formatBytes(m.totalBytes)} over ${m.requestCount} requests.`,
      );
      out.push('');
    }
    const defects = page.findings.filter((f) => f.kind !== 'manual' && f.severity !== 'info');
    if (defects.length === 0) {
      out.push('No automated findings on this page.');
      out.push('');
    }
    for (const f of defects) {
      out.push(
        `### ${f.severity.toUpperCase()} - ${f.title}${f.count > 1 ? ` (${f.count} instances)` : ''}`,
      );
      out.push('');
      out.push(f.detail);
      if (f.wcag.length > 0) out.push('', `WCAG: ${f.wcag.join(', ')}`);
      if (f.evidence) out.push('', '```', f.evidence, '```');
      if (f.help) out.push('', `Next step: ${f.help}`);
      out.push('');
    }
  }

  const manual = report.pages[0]?.findings.filter((f) => f.kind === 'manual') ?? [];
  if (manual.length > 0) {
    out.push('## Checks no scanner can make');
    out.push('');
    out.push(
      'These are not findings. They are the WCAG 2.2 A and AA criteria no automated tool can judge, listed so a clean automated report is not mistaken for a conformant site.',
    );
    out.push('');
    for (const m of manual) {
      out.push(`### ${m.title.replace('Manual check required: ', '')} (${m.wcag.join(', ')})`);
      out.push('');
      out.push(`**Why a scanner cannot decide it.** ${m.detail}`);
      out.push('');
      out.push(`**How to test.** ${m.help}`);
      out.push('');
    }
  }

  return out.join('\n');
}

function format(value, unit) {
  if (unit === 'bytes') return formatBytes(Number(value));
  if (unit === 'ms') return `${Math.round(Number(value))}ms`;
  if (unit === 'score') return Number(value).toFixed(3);
  return String(value);
}
