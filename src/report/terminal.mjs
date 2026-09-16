import { SEVERITIES } from '../util/severity.mjs';
import { formatBytes } from '../checks/performance.mjs';

const ESC = String.fromCharCode(27);

const SUPPORTS_COLOUR =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

const paint = (code, text) => (SUPPORTS_COLOUR ? `${ESC}[${code}m${text}${ESC}[0m` : text);

const COLOUR = {
  critical: (t) => paint('1;31', t),
  serious: (t) => paint('31', t),
  moderate: (t) => paint('33', t),
  minor: (t) => paint('36', t),
  info: (t) => paint('90', t),
  dim: (t) => paint('90', t),
  bold: (t) => paint('1', t),
  good: (t) => paint('32', t),
};

export function renderTerminal(report) {
  const lines = [];
  const push = (line = '') => lines.push(line);

  push();
  push(COLOUR.bold(`site-audit  ${report.target}`));
  push(
    COLOUR.dim(
      `${report.summary.pagesAudited} page(s) | ${report.modules.join(', ')} | ${(report.durationMs / 1000).toFixed(1)}s`,
    ),
  );
  push();

  const counts = report.summary.bySeverity;
  const headline = SEVERITIES.filter((s) => s !== 'info')
    .map((s) => `${COLOUR[s](String(counts[s] ?? 0))} ${s}`)
    .join('   ');
  push(`  ${headline}`);
  push();

  for (const page of report.pages) {
    if (report.pages.length > 1) push(COLOUR.bold(`  ${page.url}`));

    const defects = page.findings.filter((f) => f.kind !== 'manual' && f.severity !== 'info');
    if (defects.length === 0) push(`    ${COLOUR.dim('no automated findings')}`);

    for (const f of defects) {
      const tag = COLOUR[f.severity](f.severity.padEnd(8));
      const times = f.count > 1 ? COLOUR.dim(` x${f.count}`) : '';
      push(`    ${tag} ${f.title}${times}`);
      if (f.evidence) push(`             ${COLOUR.dim(f.evidence)}`);
    }
    if (page.metrics) push(`    ${COLOUR.dim(metricLine(page.metrics))}`);
    for (const error of page.errors ?? []) {
      push(`    ${COLOUR.moderate('note')}     ${error}`);
    }
    push();
  }

  const manual = report.pages[0]?.findings.filter((f) => f.kind === 'manual') ?? [];
  if (manual.length > 0) {
    push(COLOUR.bold(`  ${manual.length} checks no scanner can make`));
    for (const m of manual) {
      push(
        `    ${COLOUR.dim('-')} ${m.title.replace('Manual check required: ', '')}  ${COLOUR.dim(m.wcag.join(', '))}`,
      );
    }
    push(COLOUR.dim('    Run with --manual to print how to test each one.'));
    push();
  }

  push(COLOUR.bold('  Budgets'));
  for (const r of report.budget.results) {
    const mark = r.passed ? COLOUR.good('pass') : COLOUR.critical('FAIL');
    const label = `${r.module}.${r.metric}`.padEnd(28);
    push(`    ${mark}  ${label} ${formatValue(r.actual, r.unit)} / ${formatValue(r.limit, r.unit)}`);
  }
  push();
  push(
    report.budget.passed
      ? COLOUR.good('  All budgets met.')
      : COLOUR.critical('  Budget exceeded. Exit code 1.'),
  );
  push();

  return lines.join('\n');
}

export function renderManualGuide(report) {
  const manual = report.pages[0]?.findings.filter((f) => f.kind === 'manual') ?? [];
  const lines = ['', COLOUR.bold('  Manual checks'), ''];
  for (const m of manual) {
    lines.push(
      `  ${COLOUR.bold(m.title.replace('Manual check required: ', ''))}  ${COLOUR.dim(m.wcag.join(', '))}`,
    );
    lines.push(`    ${COLOUR.dim('Why a scanner cannot:')} ${wrap(m.detail, 74)}`);
    lines.push(`    ${COLOUR.dim('How to test:')} ${wrap(m.help, 74)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function metricLine(m) {
  const parts = [];
  parts.push(`LCP ${m.lcpMs === null ? 'n/a' : `${Math.round(m.lcpMs)}ms`}`);
  parts.push(`CLS ${m.cls.toFixed(3)}`);
  parts.push(`TBT ${Math.round(m.tbtMs)}ms`);
  parts.push(`TTFB ${Math.round(m.ttfbMs)}ms`);
  parts.push(`${formatBytes(m.totalBytes)} in ${m.requestCount} requests`);
  return parts.join('  |  ');
}

function formatValue(value, unit) {
  if (unit === 'bytes') return formatBytes(Number(value));
  if (unit === 'ms') return `${Math.round(Number(value))}ms`;
  if (unit === 'score') return Number(value).toFixed(3);
  return String(value);
}

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += `${word} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join('\n      ');
}
