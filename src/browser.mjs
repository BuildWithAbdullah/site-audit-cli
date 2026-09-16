import puppeteer from 'puppeteer';

/**
 * One browser for the whole run, one page per URL.
 *
 * `PUPPETEER_EXECUTABLE_PATH` is honoured so the tool can run against a
 * Chrome that is already installed, which matters in a container where a
 * second 150MB download per job is not free.
 */
export async function launchBrowser({ headless = true } = {}) {
  return puppeteer.launch({
    headless,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

export async function openPage(browser, url, { viewport, timeoutMs = 45000, userAgent } = {}) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  if (userAgent) await page.setUserAgent(userAgent);
  page.setDefaultTimeout(timeoutMs);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err.message).slice(0, 200)));

  await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
  return { page, consoleErrors };
}
