// Render guardrail — the layer static checks can't do: actually renders the live page
// at many widths and fails on horizontal overflow (content off-screen), console errors,
// and failed resource loads. This is what catches "text/elements run off the edge" bugs
// that only appear at specific viewport widths.
const { test, expect } = require('@playwright/test');

const WIDTHS = [320, 360, 375, 414, 768, 1024, 1440];

for (const w of WIDTHS) {
  test(`layout is clean @ ${w}px`, async ({ page }) => {
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(String(e)));
    page.on('requestfailed', r => {
      // ignore analytics/third-party noise; flag same-origin asset failures
      const u = r.url();
      if (!/googletagmanager|analytics|stripe|supadata/i.test(u)) failedRequests.push(u + ' (' + (r.failure()?.errorText || '') + ')');
    });

    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1) No horizontal overflow (respects overflow:hidden clipping → real off-screen signal).
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(scrollW, `horizontal overflow at ${w}px (scrollWidth ${scrollW} > clientWidth ${clientW})`).toBeLessThanOrEqual(clientW + 1);

    // 2) No console/runtime errors.
    expect(consoleErrors, `console errors at ${w}px:\n${consoleErrors.join('\n')}`).toEqual([]);

    // 3) No failed same-origin resource loads.
    expect(failedRequests, `failed resource loads at ${w}px:\n${failedRequests.join('\n')}`).toEqual([]);
  });
}
