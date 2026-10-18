/** Offline lazy-import regression for the isolated SDK-selection proposal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/playwright-browsers');
const { chromium, expect } = await import('@playwright/test');
const sha = value => createHash('sha256').update(value).digest('hex');
const [attemptId] = process.argv.slice(2);
assert(process.argv.length === 3 && /^frontend-sdk-[a-z0-9-]{8,80}$/.test(attemptId));
const attempt = resolve('.tools', attemptId), output = resolve(attempt, 'browser-check');
const buildBytes = await readFile(resolve(attempt, 'build-result.json')), build = JSON.parse(buildBytes);
assert.equal(build.passed, true);
const freezeBytes = await readFile('evidence/agave-source-candidate-freeze.json');
assert.equal(sha(freezeBytes), build.freezeSHA256);
assert.equal(build.freezeSHA256, '55b668e56a946ec94f0195b03530aba23593bd71d7fd52493d5403b21882757f');
const freeze = JSON.parse(freezeBytes), origin = freeze.candidate.frontendOrigin, api = freeze.candidate.apiOrigin;
await mkdir(output, { mode: 0o700 });
const report = { schemaVersion: 1, at: new Date().toISOString(), passed: false, scope: 'Isolated browser lazy-import check with supplied API responses; no live issuance', driverSHA256: sha(await readFile(new URL(import.meta.url))), buildResultSHA256: sha(buildBytes), cases: [], liveAPIRequests: 0, chainSubmissions: 0, deployed: false, candidateAccepted: false };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const [variant, width] of [['baseline', 1440], ['named', 1440], ['named', 360]]) {
    const assets = new Map();
    for (const [path, expected] of Object.entries(build.variants[variant].files)) {
      assert(/^[\w./-]+$/.test(path) && !path.includes('..'));
      const body = await readFile(resolve(attempt, variant, 'dist', path));
      assert.equal(sha(body), expected.sha256); assert.equal(body.length, expected.bytes);
      const ext = path.split('.').at(-1), types = { html: 'text/html', js: 'application/javascript', css: 'text/css', woff2: 'font/woff2', woff: 'font/woff' };
      assert(types[ext]); assets.set('/' + path, { body, contentType: types[ext] });
    }
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    const unexpected = [], errors = [], consoleErrors = [], apiCalls = [];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin === origin && req.method() === 'GET') {
        const path = url.pathname === '/playground' ? '/index.html' : url.pathname;
        if (assets.has(path)) return route.fulfill({ status: 200, ...assets.get(path) });
        if (path === '/favicon.ico') return route.fulfill({ status: 204 });
      }
      if (url.origin === api) {
        if (req.method() === 'GET' && url.pathname === '/api/network') return json({ expectedGenesisHash: freeze.genesis, mode: 'remote' });
        if (req.method() === 'GET' && url.pathname === '/api/status') return json({ state: 'online', genesisMatches: true, slot: 1, message: 'Supplied fixture' });
        if (req.method() === 'POST' && url.pathname === '/api/rpc') {
          const body = req.postDataJSON();
          if (body.method === 'getBalance') { apiCalls.push('supplied-getBalance'); return json({ jsonrpc: '2.0', id: body.id, result: { context: { slot: 1 }, value: 0 } }); }
        }
        if (req.method() === 'POST' && url.pathname === '/api/assets') {
          const body = req.postDataJSON();
          assert.deepEqual(Object.keys(body).sort(), ['kind', 'mint', 'name', 'presetId', 'symbol']);
          assert.match(body.mint, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
          assert.equal(body.kind, 'nft'); assert.equal(body.name, 'SDK selection fixture');
          apiCalls.push('supplied-asset-refusal'); return json({ error: { message: 'Fixture stops before issuance.' } }, 409);
        }
      }
      unexpected.push({ method: req.method(), origin: url.origin, path: url.pathname });
      return route.abort('blockedbyclient');
    });
    try {
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      await page.goto(origin + '/playground');
      assert.match(await page.title(), /Solana Classic/);
      await expect(page.getByText('Network responding', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Create test wallet', exact: true }).click();
      await expect(page.locator('.wallet-rail code.address')).toHaveText(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      await page.getByLabel('Name', { exact: true }).fill('SDK selection fixture');
      await page.getByRole('button', { name: 'Mint test NFT', exact: true }).click();
      await expect(page.getByText('Fixture stops before issuance.', { exact: true })).toBeVisible();
      assert.equal(await page.locator('.completion, vite-error-overlay').count(), 0);
      assert.deepEqual(apiCalls, ['supplied-getBalance', 'supplied-asset-refusal']);
      assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [] });
      const screenshot = variant + '-' + width + '.png';
      await page.screenshot({ path: resolve(output, screenshot), fullPage: true });
      await page.reload();
      await expect(page.getByRole('button', { name: 'Create test wallet', exact: true })).toBeVisible();
      assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
      assert(consoleErrors.length === 1 && /409/.test(consoleErrors[0]));
      report.cases.push({ variant, width, passed: true, disposableWalletCreated: true, sdkConnectionBalanceRead: true, mintKeyGenerationAndChainModuleLoaded: true, suppliedAssetRefusalDisplayed: true, walletLostOnReload: true, browserStorageEmpty: true, unexpectedRequests: 0, pageErrors: 0, expected409ResourceErrors: 1, screenshot, screenshotSHA256: sha(await readFile(resolve(output, screenshot))) });
    } finally { await context.close(); }
  }
  report.passed = true;
} catch (error) { report.failure = { type: error.name, message: error.message }; process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, failure: report.failure?.type }));
}
