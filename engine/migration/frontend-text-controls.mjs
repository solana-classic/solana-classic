/** Offline rendering of exact frozen frontend bytes with supplied hostile data.
 * No live API transport, wallet creation, signing or transaction submission.
 * Usage: node frontend-text-controls.mjs SELECTED_ASSET_CACHE NEW_RESULT_DIR
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/playwright-browsers');
const { chromium, expect } = await import('@playwright/test');

const sha = value => createHash('sha256').update(value).digest('hex');
const [cache, destination] = process.argv.slice(2);
assert(cache && destination && process.argv.length === 4, 'Explicit cache and fresh result directory required');
const freezeBytes = await readFile('evidence/agave-source-candidate-freeze.json');
assert.equal(sha(freezeBytes), '55b668e56a946ec94f0195b03530aba23593bd71d7fd52493d5403b21882757f');
const freeze = JSON.parse(freezeBytes);
const origin = freeze.candidate.frontendOrigin;
const api = freeze.candidate.apiOrigin;
const assets = new Map();
const manifest = JSON.parse(await readFile(resolve(cache, 'manifest.json')));
for (const [path, digest] of Object.entries(freeze.frontendFiles)) assert.equal(manifest[path]?.sha256, digest);
for (const [path, item] of Object.entries(manifest)) {
  assert(path === '/' || /^\/assets\/[\w.-]+\.(js|css|woff2)$/.test(path));
  const body = await readFile(resolve(cache, path === '/' ? 'index.html' : basename(path)));
  assert(body.length <= 4 * 1024 ** 2);
  assert.equal(sha(body), item.sha256);
  assets.set(path, { body, contentType: item.contentType });
}
await mkdir(destination, { mode: 0o700 }); // Never overwrite a retained attempt.
const payloads = ['<svg onload=window.__textProbe=1>', '"><img src=x onerror=window.__textProbe=2>', '<script>window.__textProbe=3</script>', '&lt;svg onload=window.__textProbe=4&gt;'];
const entries = payloads.map((name, i) => ({
  mint: String(i + 2).repeat(32), kind: i % 2 ? 'meme' : 'nft', name,
  symbol: '<svg/>', image: api + '/fixture-image.svg', verifiedAt: '2026-10-18T03:31:59Z',
  ownershipState: 'held', currentOwner: '5'.repeat(32),
}));
const report = {
  schemaVersion: 1, at: new Date().toISOString(), passed: false,
  scope: 'Offline frozen frontend rendering with supplied hostile API data; no live transaction journey',
  freezeSHA256: sha(freezeBytes), frontendFiles: freeze.frontendFiles,
  driverSHA256: sha(await readFile(new URL(import.meta.url))),
  browser: 'Pinned Chromium; Browser plugin not available',
  liveAPIRequests: 0, walletCreations: 0, chainSubmissions: 0, cases: [],
  releaseAccepted: false, mainnetAccepted: false, bridgeAccepted: false,
};
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    const unexpected = [], consoleErrors = [], pageErrors = [], calls = [];
    let galleryFailure = false;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin === origin && req.method() === 'GET') {
        const path = /^\/(gallery|playground|explorer)(\/|$)/.test(url.pathname) ? '/' : url.pathname;
        if (assets.has(path)) return route.fulfill({ status: 200, ...assets.get(path) });
        if (path === '/favicon.ico') return route.fulfill({ status: 204 });
      }
      if (url.origin === api) {
        calls.push({ method: req.method(), path: url.pathname });
        if (req.method() === 'GET') {
          if (url.pathname === '/api/network') return json({ expectedGenesisHash: freeze.genesis, mode: 'remote' });
          if (url.pathname === '/api/status') return json({ state: 'online', genesisMatches: true, slot: 1, message: 'Supplied fixture status' });
          if (url.pathname === '/api/gallery' && !galleryFailure) return json({ entries: url.search ? entries.slice(2) : entries.slice(0, 2), nextCursor: url.search ? null : 'fixture-page-2' });
          if (url.pathname === '/api/gallery') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: payloads[0] } }) });
          if (url.pathname === '/api/gallery/' + entries[0].mint) return json({ ...entries[0], name: payloads[2] });
          if (url.pathname === '/fixture-image.svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#546856"/></svg>' });
        }
        if (req.method() === 'POST' && url.pathname === '/api/rpc') {
          const body = req.postDataJSON();
          if (body.method === 'getTransaction') return json({ jsonrpc: '2.0', id: body.id, result: { slot: 12, blockTime: null, meta: { err: { fixture: payloads[1] }, fee: 5000, logMessages: payloads }, transaction: { signatures: ['2'.repeat(88)], message: { instructions: [] } } } });
        }
      }
      unexpected.push({ method: req.method(), origin: url.origin, path: url.pathname });
      return route.abort('blockedbyclient'); // Never fall through to a real network.
    });
    try {
      const control = await context.newPage();
      await control.setContent('<svg onload="window.__textProbe=9"></svg>');
      await expect.poll(() => control.evaluate(() => window.__textProbe)).toBe(9);
      await control.close();
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      const inert = async () => {
        assert.equal(await page.evaluate(() => window.__textProbe), undefined);
        assert.equal(await page.locator('main [onload], main [onerror], main script, .gallery-heading svg, .gallery-heading img').count(), 0);
        assert.equal(await page.locator('vite-error-overlay').count(), 0);
      };
      await page.goto(origin + '/gallery');
      await expect(page.getByRole('heading', { name: 'Made here.', exact: true })).toBeVisible();
      assert.equal(new URL(page.url()).origin, origin);
      assert.match(await page.title(), /Solana Classic/);
      await expect(page.locator('.gallery-item h2')).toHaveText(payloads.slice(0, 2));
      await page.getByRole('button', { name: 'Load more', exact: true }).click();
      await expect(page.locator('.gallery-item h2')).toHaveText(payloads);
      assert.deepEqual(await page.locator('.gallery-item img').evaluateAll(nodes => nodes.map(n => n.getAttribute('alt'))), payloads.map(p => p + ' geometric artwork'));
      await expect(page.locator('.gallery-heading span')).toHaveText(['NFT', '<svg/>', 'NFT', '<svg/>']);
      await inert();
      await page.getByRole('button', { name: 'Check current owner', exact: true }).first().click();
      await expect(page.locator('.gallery-item h2')).toHaveText([payloads[2], ...payloads.slice(1)]);
      await inert();
      const screenshot = 'gallery-' + width + '.png';
      await page.screenshot({ path: resolve(destination, screenshot), fullPage: true });
      await page.getByRole('link', { name: 'Playground', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill(payloads[0]);
      await page.getByLabel('Symbol', { exact: true }).fill('<svg/>');
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue(payloads[0]);
      await expect(page.getByLabel('Symbol', { exact: true })).toHaveValue('<svg/>');
      await inert();
      await page.goto(origin + '/explorer/tx/' + '2'.repeat(88));
      await expect(page.getByText('Failed', { exact: true })).toBeVisible();
      await expect(page.locator('main pre').last()).toHaveText(payloads.join('\n'));
      assert.equal(await page.locator('main pre').first().textContent(), JSON.stringify({ fixture: payloads[1] }, null, 2));
      await inert();
      // Error boundary is also checked; one browser resource error is expected.
      assert.deepEqual(consoleErrors, []);
      galleryFailure = true;
      await page.goto(origin + '/gallery');
      await expect(page.getByText(payloads[0], { exact: true })).toBeVisible();
      await inert();
      assert(consoleErrors.length <= 1 && consoleErrors.every(s => /503/.test(s)));
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(unexpected, []);
      report.cases.push({ width, passed: true, executablePositiveControl: true, literalGalleryNames: 4, pagination: true, refreshedName: true, literalSymbolAndAlt: true, literalFormInputs: true, literalFailedTransactionLogsAndError: true, literalGalleryError: true, unexpectedRequests: 0, pageErrors: 0, expected503ResourceErrors: consoleErrors.length, interceptedRequests: calls, screenshot, screenshotSHA256: sha(await readFile(resolve(destination, screenshot))) });
    } finally { await context.close(); }
  }
  report.passed = true;
} catch (error) {
  report.failure = { type: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile(resolve(destination, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, failure: report.failure?.type }));
}
