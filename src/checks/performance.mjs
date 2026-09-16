import { finding, truncate } from '../util/severity.mjs';

/**
 * Lab metrics, measured in the page rather than inferred from the HTML.
 *
 * Two honesty constraints are built in.
 *
 * Interaction to Next Paint cannot be measured without an interaction, and a
 * synthetic run has no user. Total Blocking Time is collected instead and
 * labelled as the proxy it is, because a page with 900ms of blocking time will
 * have a bad INP and a page with 20ms usually will not.
 *
 * Everything here is a single cold load on one connection. It says whether the
 * page is built well. It does not say what the field data looks like, and the
 * report says so rather than letting a client assume otherwise.
 */
export async function auditPerformance(page, { budgets = {} } = {}) {
  const metrics = await collect(page);
  const findings = [];

  const lcpBudget = budgets.lcpMs ?? 2500;
  if (metrics.lcpMs !== null && metrics.lcpMs > lcpBudget) {
    findings.push(
      finding({
        id: 'perf/lcp',
        module: 'performance',
        severity: metrics.lcpMs > lcpBudget * 1.6 ? 'serious' : 'moderate',
        title: `Largest Contentful Paint is ${Math.round(metrics.lcpMs)}ms in the lab`,
        detail: attributeLcp(metrics),
        evidence: metrics.lcpElement ? truncate(metrics.lcpElement, 160) : null,
        help: 'Fix the phase that owns the time. Preloading an image will not help a page whose time is spent waiting for the server.',
      }),
    );
  }

  const clsBudget = budgets.clsScore ?? 0.1;
  if (metrics.cls > clsBudget) {
    findings.push(
      finding({
        id: 'perf/cls',
        module: 'performance',
        severity: metrics.cls > clsBudget * 2.5 ? 'serious' : 'moderate',
        title: `Cumulative Layout Shift is ${metrics.cls.toFixed(3)}`,
        detail:
          'Content moved after it was painted. The usual causes are images and iframes without width and height, a web font swapping in at a different metric, and content injected above the fold by a consent or promotion script.',
        evidence: metrics.largestShiftSource ? truncate(metrics.largestShiftSource, 160) : null,
      }),
    );
  }

  const tbtBudget = budgets.tbtMs ?? 200;
  if (metrics.tbtMs > tbtBudget) {
    findings.push(
      finding({
        id: 'perf/tbt',
        module: 'performance',
        severity: metrics.tbtMs > tbtBudget * 3 ? 'serious' : 'moderate',
        title: `Total Blocking Time is ${Math.round(metrics.tbtMs)}ms`,
        detail:
          'Time on the main thread in tasks long enough to delay a response to a tap. This is the lab proxy for Interaction to Next Paint, which cannot be measured without a real interaction.',
        evidence: metrics.longestTaskMs
          ? `Longest single task: ${Math.round(metrics.longestTaskMs)}ms`
          : null,
      }),
    );
  }

  if (metrics.ttfbMs > 800) {
    findings.push(
      finding({
        id: 'perf/ttfb',
        module: 'performance',
        severity: metrics.ttfbMs > 1800 ? 'serious' : 'moderate',
        title: `Time to First Byte is ${Math.round(metrics.ttfbMs)}ms`,
        detail:
          'The browser was idle for this long before the first byte arrived. No amount of front-end optimisation moves this number; it is server, database, or a missing page cache.',
      }),
    );
  }

  const byteBudget = budgets.totalBytes ?? 2_000_000;
  if (metrics.totalBytes > byteBudget) {
    findings.push(
      finding({
        id: 'perf/weight',
        module: 'performance',
        severity: metrics.totalBytes > byteBudget * 2 ? 'serious' : 'moderate',
        title: `Page weighs ${formatBytes(metrics.totalBytes)}`,
        detail: 'Transfer size over the wire on a cold load, before any repeat-visit caching.',
        evidence: truncate(
          Object.entries(metrics.bytesByType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, bytes]) => `${type} ${formatBytes(bytes)}`)
            .join(', '),
          160,
        ),
      }),
    );
  }

  if (metrics.renderBlocking.length > 0) {
    findings.push(
      finding({
        id: 'perf/render-blocking',
        module: 'performance',
        severity: metrics.renderBlocking.length > 4 ? 'moderate' : 'minor',
        title: `${metrics.renderBlocking.length} render-blocking resource${metrics.renderBlocking.length === 1 ? '' : 's'} in head`,
        detail:
          'Nothing paints until each of these has been fetched and parsed. Stylesheets block by design; scripts in head only block because they were written without defer or async.',
        evidence: truncate(metrics.renderBlocking.slice(0, 4).join(' | '), 200),
        count: metrics.renderBlocking.length,
      }),
    );
  }

  if (metrics.oversizedImages.length > 0) {
    findings.push(
      finding({
        id: 'perf/oversized-images',
        module: 'performance',
        severity: 'moderate',
        title: `${metrics.oversizedImages.length} image${metrics.oversizedImages.length === 1 ? ' is' : 's are'} far larger than the box they are drawn in`,
        detail:
          'The browser downloads the full file and then scales it down. The visitor pays for every pixel that was thrown away.',
        evidence: truncate(metrics.oversizedImages.slice(0, 3).join(' | '), 200),
        count: metrics.oversizedImages.length,
      }),
    );
  }

  if (metrics.thirdPartyBytes > metrics.totalBytes * 0.4 && metrics.totalBytes > 0) {
    findings.push(
      finding({
        id: 'perf/third-party',
        module: 'performance',
        severity: 'moderate',
        title: `${Math.round((metrics.thirdPartyBytes / metrics.totalBytes) * 100)} per cent of the page weight is third-party`,
        detail:
          'Tags, chat widgets, review embeds and font hosts. This is the part of the page you do not control and cannot fix by optimising your own code.',
        evidence: truncate(metrics.thirdPartyHosts.slice(0, 6).join(', '), 200),
      }),
    );
  }

  return { findings, metrics };
}

async function collect(page) {
  const raw = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    let lcpMs = null;
    let lcpElement = null;
    let cls = 0;
    let largestShift = 0;
    let largestShiftSource = null;
    let tbtMs = 0;
    let longestTaskMs = 0;

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          lcpMs = entry.startTime;
          const el = entry.element;
          if (el) {
            lcpElement = `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
              el.className && typeof el.className === 'string'
                ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                : ''
            }>`;
          }
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          cls += entry.value;
          if (entry.value > largestShift) {
            largestShift = entry.value;
            const node = entry.sources && entry.sources[0] && entry.sources[0].node;
            if (node && node.tagName) {
              largestShiftSource = `<${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}> shifted by ${entry.value.toFixed(3)}`;
            }
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longestTaskMs = Math.max(longestTaskMs, entry.duration);
          if (entry.duration > 50) tbtMs += entry.duration - 50;
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {}

    await wait(600);

    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]),
    );
    const resources = performance.getEntriesByType('resource');

    const bytesByType = {};
    let totalBytes = Number(nav.transferSize) || 0;
    let thirdPartyBytes = 0;
    const thirdPartyHosts = new Set();
    const origin = location.origin;

    for (const r of resources) {
      const size = Number(r.transferSize) || 0;
      const type = r.initiatorType || 'other';
      bytesByType[type] = (bytesByType[type] || 0) + size;
      totalBytes += size;
      try {
        const host = new URL(r.name).origin;
        if (host !== origin && size > 0) {
          thirdPartyBytes += size;
          thirdPartyHosts.add(new URL(r.name).hostname);
        }
      } catch {}
    }

    const renderBlocking = [
      ...document.querySelectorAll('head link[rel="stylesheet"]:not([media="print"])'),
      ...document.querySelectorAll('head script[src]:not([defer]):not([async]):not([type="module"])'),
    ].map((el) => (el.getAttribute('href') || el.getAttribute('src') || '').split('?')[0].slice(-70));

    const oversizedImages = [...document.images]
      .filter((img) => img.naturalWidth > 0 && img.clientWidth > 0)
      .filter((img) => img.naturalWidth > img.clientWidth * window.devicePixelRatio * 1.8)
      .map(
        (img) =>
          `${(img.currentSrc || img.src).split('/').pop().slice(0, 40)} ${img.naturalWidth}px served into ${img.clientWidth}px`,
      );

    return {
      lcpMs,
      lcpElement,
      cls,
      largestShiftSource,
      tbtMs,
      longestTaskMs,
      ttfbMs: Number(nav.responseStart) || 0,
      fcpMs: paints['first-contentful-paint'] ?? null,
      domContentLoadedMs: Number(nav.domContentLoadedEventEnd) || 0,
      loadMs: Number(nav.loadEventEnd) || 0,
      totalBytes,
      bytesByType,
      thirdPartyBytes,
      thirdPartyHosts: [...thirdPartyHosts],
      requestCount: resources.length + 1,
      renderBlocking,
      oversizedImages,
    };
  });

  return raw;
}

function attributeLcp(m) {
  const server = m.ttfbMs;
  const render = m.fcpMs ?? 0;
  if (m.lcpMs === null) return 'The largest element could not be attributed.';
  const serverShare = Math.round((server / m.lcpMs) * 100);
  if (serverShare > 40) {
    return `Roughly ${serverShare} per cent of that time was spent before the first byte arrived, so the largest share of this metric belongs to the server, not to the front end.`;
  }
  if (render > 0 && m.lcpMs - render > m.lcpMs * 0.5) {
    return 'The page began painting early and the largest element arrived late, which points at the resource itself: a lazy-loaded hero, an image discovered only after CSS parsed, or a font blocking the text that carries the metric.';
  }
  return 'Time is spread across the load rather than concentrated in one phase. Look at render-blocking resources first, then at the size of the largest element.';
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}
