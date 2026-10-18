// Actual bounded valueless browser regression. Keys stay in browser memory.
// No arbitrary endpoints, imported wallets, server control or release approval.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const freeze = JSON.parse(readFileSync(new URL('../../evidence/candidate-freeze.json', import.meta.url)));
const TOKEN = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sha = data => createHash('sha256').update(data).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let readRetries = 0;
export function retryableReadFailure(error) {
  return error?.name === 'TypeError' && error?.message === 'fetch failed' || error?.name === 'TimeoutError';
}
const targets = {
  frozen: { web: 'https://solana-classic-soc.vercel.app', api: 'https://network-release-production.up.railway.app', denomination: 'TEST' },
  custom: { web: 'https://solanaclassic.net', api: 'https://solanaclassic.net/_network', denomination: 'tSOC' }
};
export function targetFor(name) {
  if (!Object.hasOwn(targets, name)) throw Error('Unknown fixed devnet target');
  return targets[name];
}
export function checkBrowserStorage(name, snapshot) {
  targetFor(name);
  if (!snapshot || !Array.isArray(snapshot.localKeys) || snapshot.sessionLength !== 0) throw Error('Unexpected browser storage');
  const empty = snapshot.localKeys.length === 0 && snapshot.panelPreference === null;
  const panelOnly = snapshot.localKeys.length === 1 && snapshot.localKeys[0] === 'classic.wallet.panel' &&
    ['open', 'closed'].includes(snapshot.panelPreference);
  if (name === 'frozen' ? !empty : !panelOnly) throw Error('Unexpected browser storage');
  return { localStorageEmpty: empty, sessionStorageEmpty: true, onlyPanelPreference: panelOnly };
}
export function viewportFor(profile) {
  if (profile === 'desktop') return { width: 1440, height: 1000, isMobile: false, hasTouch: false };
  if (profile === 'mobile') return { width: 360, height: 844, isMobile: true, hasTouch: true };
  throw Error('Use only the fixed desktop or mobile browser profile');
}
export function checkRuntime(runtime) {
  for (const key of ['genesis', 'sourceCommit', 'coreSha256', 'apiBootId', 'validatorBootId', 'deploymentId', 'tokenProgramSha256']) {
    if (runtime?.[key] !== freeze.runtime[key]) throw Error('Original runtime identity changed');
  }
}
export function receipt(href) {
  const match = /^\/explorer\/tx\/([1-9A-HJ-NP-Za-km-z]{80,90})$/.exec(href ?? '');
  if (!match) throw Error('Missing new browser receipt');
  return match[1];
}
export function checkMint(value, mint, kind, name) {
  const info = value?.data?.parsed?.info;
  const pointer = info?.extensions?.find(e => e.extension === 'metadataPointer')?.state;
  const metadata = info?.extensions?.find(e => e.extension === 'tokenMetadata')?.state;
  if (value?.owner !== TOKEN || value?.data?.parsed?.type !== 'mint' ||
      info?.supply !== (kind === 'nft' ? '1' : '1000000000000') ||
      info?.decimals !== (kind === 'nft' ? 0 : 6) || info?.mintAuthority !== null ||
      info?.freezeAuthority !== null || pointer?.authority !== null ||
      pointer?.metadataAddress !== mint || metadata?.mint !== mint || metadata?.name !== name ||
      ![null, '11111111111111111111111111111111'].includes(metadata?.updateAuthority)) {
    throw Error('Mint supply, metadata or authorities differ');
  }
  const url = new URL(metadata.uri);
  if (!['https://network-release-production.up.railway.app', 'https://image-assets-production.up.railway.app'].includes(url.origin) ||
      !/^\/assets\/[a-f0-9]{64}\/metadata.json$/.test(url.pathname) || url.username || url.password || url.search || url.hash) throw Error('Unapproved immutable metadata');
  return metadata;
}
export function checkArtwork(uri, metadataURI, uploaded) {
  const expected = metadataURI.replace(/metadata\.json$/, uploaded ? 'image.png' : 'image.svg');
  if (uri !== expected) throw Error('Artwork does not match the fixed immutable asset origin');
  return uri;
}
async function json(url, options = {}) {
  // Only this driver's independent read requests retry transport failures.
  // HTTP errors (including429), JSON/RPC errors and identity mismatches do not.
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) }); break; }
    catch (error) { if (attempt === 2 || !retryableReadFailure(error)) throw error; readRetries++; await delay(1000); }
  }
  if (!response.ok) throw Error('Required public response unavailable');
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 262144) throw Error('Public JSON response too large');
  return JSON.parse(raw);
}
async function rpc(method, params = []) {
  const response = await json('https://rpc.solanaclassic.net', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (response.error || response.id !== 1 || response.jsonrpc !== '2.0') throw Error('Branded RPC rejected read');
  return response.result;
}
async function identity() {
  const runtime = await json(freeze.candidate.apiOrigin + '/api/runtime');
  checkRuntime(runtime);
  const facts = await json(freeze.candidate.apiOrigin + '/api/network');
  if (facts.mode !== 'remote' || facts.hasMonetaryValue !== false || facts.expectedGenesisHash !== freeze.genesis || await rpc('getGenesisHash') !== freeze.genesis) throw Error('Wrong valueless devnet');
  for (const [path, digest] of Object.entries(freeze.coreFiles)) {
    if (sha(readFileSync(ROOT + path)) !== digest) throw Error('Frozen source changed');
  }
  return runtime;
}
async function finalized(signature) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    const result = (await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value?.[0];
    if (result?.err) throw Error('Browser transaction failed');
    if (result?.confirmationStatus === 'finalized') return result.slot;
    await delay(3000);
  }
  throw Error('Finality unavailable within bound');
}
async function lastReceipt(page, label) {
  const row = page.locator('.activity li').first();
  await row.getByText(label, { exact: true }).waitFor({ timeout: 90000 });
  const signature = receipt(await row.locator('a').getAttribute('href'));
  return { signature, finalizedSlot: await finalized(signature) };
}
async function holdings(owner) {
  return (await rpc('getTokenAccountsByOwner', [owner, { programId: TOKEN }, { encoding: 'jsonParsed', commitment: 'finalized' }])).value;
}
async function bundle(web) {
  const html = await fetch(web + '/', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!html.ok) throw Error('Frontend unavailable');
  const raw = await html.text();
  const paths = ['/', ...new Set([...raw.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m => m[1]))];
  if (paths.length < 3 || paths.length > 8) throw Error('Unexpected frontend entry inventory');
  const hashes = { '/': sha(raw) };
  for (const path of paths.slice(1)) {
    const response = await fetch(web + path, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Frontend entry asset unavailable');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1048576) throw Error('Entry asset exceeds bound');
    hashes[path] = sha(bytes);
  }
  return hashes;
}
export async function run(name, profile = 'desktop') {
  const target = targetFor(name), viewport = viewportFor(profile), at = new Date().toISOString();
  const output = ROOT + 'evidence/browser-final-' + name + '-' + profile + '-' + at.replace(/[^0-9TZ]/g, '') + '.json';
  const report = { schemaVersion: 1, at, scope: 'remote production-origin final clean-browser valueless regression; not an independent agent pilot, soak or full release acceptance', passed: false,
    web: target.web, api: target.api, genesis: freeze.genesis, candidate: freeze.candidate,
    target: name, profile, fullJourneyViewport: viewport, widths: [1440, 360], layoutChecks: [], assets: [], receipts: [], issues: [], releaseAccepted: false, cutoverAccepted: false,
    canonicalProcessChanged: false, walletSecretsPersisted: null, faucetLogicalGrants: 0,
    browser: 'Chromium Playwright; Browser plugin not available', screenshotsCommitted: false };
  let browser, stage = 'admission';
  readRetries = 0;
  try {
    if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Pinned Node24 required');
    report.runtimeBefore = await identity();
    const status = await json('https://solanaclassic.net/roadmap/api/status');
    if (!status.soak?.accepted || !status.network?.identityMatches) throw Error('Original stability result unavailable');
    report.frontendBefore = await bundle(target.web);
    if (name === 'frozen') for (const [path, digest] of Object.entries(report.frontendBefore)) if (freeze.frontendFiles[path] !== digest) throw Error('Frozen frontend entry changed');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
    const page = await context.newPage(), recipientPage = await context.newPage();
    let pageErrors = 0, consoleErrors = 0, sensitivePayload = false, unexpectedDestination = false;
    const rendered = async (p, label) => {
      if (!(await p.title()).startsWith('Solana Classic') || !await p.locator('main').isVisible()) throw Error('Wrong or blank rendered page');
      if (await p.locator('vite-error-overlay, nextjs-portal').count()) throw Error('Framework error overlay');
      const box = await p.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (box.scrollWidth > box.width) throw Error('Journey page overflows');
      report.layoutChecks.push({ stage: label, ...box, pageIdentity: true, meaningfulMain: true, frameworkOverlay: false });
    };
    context.on('page', p => p.on('pageerror', () => { pageErrors++; }));
    context.on('page', p => p.on('console', m => { if (m.type() === 'error') consoleErrors++; }));
    for (const p of [page, recipientPage]) { p.on('pageerror', () => { pageErrors++; }); p.on('console', m => { if (m.type() === 'error') consoleErrors++; }); }
    context.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.includes('/api/')) return;
      if (![new URL(target.web).origin, freeze.candidate.apiOrigin].includes(url.origin)) unexpectedDestination = true;
      const body = request.postData();
      if (body && /"(?:secretKey|privateKey|mnemonic|seedPhrase)"\s*:/.test(body)) sensitivePayload = true;
    });
    stage = 'clean wallets';
    for (const p of [page, recipientPage]) {
      await p.goto(target.web + '/playground');
      await p.getByText('Network responding', { exact: true }).waitFor({ timeout: 30000 });
      await rendered(p, 'playground-entry');
      if (p === page) await p.screenshot({ path: '/tmp/soc-final-' + name + '-' + profile + '-entry.png', fullPage: false });
      await p.getByRole('button', { name: 'Create test wallet', exact: true }).click();
      await p.locator('.wallet-rail code.address').waitFor();
      await rendered(p, 'clean-wallet');
    }
    await page.screenshot({ path: '/tmp/soc-final-' + name + '-' + profile + '-wallet.png', fullPage: false });
    report.payer = await page.locator('.wallet-rail code.address').innerText();
    report.recipient = await recipientPage.locator('.wallet-rail code.address').innerText();
    if (report.payer === report.recipient) throw Error('Wallet identities reused');
    stage = 'bounded faucet'; await identity();
    await page.getByRole('button', { name: 'Get 1 ' + target.denomination, exact: true }).click();
    const grant = await lastReceipt(page, '1 ' + target.denomination + ' received');
    report.receipts.push({ action: 'faucet', ...grant }); report.faucetLogicalGrants = 1;
    stage = 'native transfer'; await identity();
    const initialNative = (await rpc('getBalance', [report.recipient, { commitment: 'finalized' }])).value;
    await page.getByLabel('Recipient public address').fill(report.recipient);
    await page.getByLabel('Amount', { exact: true }).fill('0.01');
    await page.getByRole('button', { name: 'Transfer ' + target.denomination, exact: true }).click();
    const native = await lastReceipt(page, target.denomination + ' transferred');
    const finalNative = (await rpc('getBalance', [report.recipient, { commitment: 'finalized' }])).value;
    if (initialNative !== 0 || finalNative !== 10000000) throw Error('Native transfer balance mismatch');
    report.receipts.push({ action: 'native-transfer', ...native });
    await rendered(page, 'native-transfer');
    for (const kind of ['meme', 'nft']) {
      stage = kind + ' mint'; await identity();
      if (report.assets.length) await page.getByRole('button', { name: 'Start a new creation', exact: true }).click();
      await page.getByRole('tab', { name: kind === 'meme' ? 'Meme token' : 'NFT', exact: true }).click();
      const assetName = 'Release QA ' + name + ' ' + kind;
      await page.getByLabel('Name', { exact: true }).fill(assetName);
      await page.getByLabel('Symbol', { exact: true }).fill('QA');
      if (name === 'custom' && kind === 'nft') {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
        await page.getByLabel('Choose artwork', { exact: true }).setInputFiles({ name: 'release-qa.png', mimeType: 'image/png', buffer: png });
        await page.getByText('Your artwork is selected.', { exact: true }).waitFor();
      }
      await page.getByRole('button', { name: kind === 'meme' ? 'Create meme token' : 'Mint test NFT', exact: true }).click();
      await page.locator('.completion strong').filter({ hasText: 'is issued and verified.' }).waitFor({ timeout: 120000 });
      const mint = await page.locator('.completion code.address').innerText();
      const issuance = await lastReceipt(page, kind === 'meme' ? 'Meme token issued' : 'Test NFT issued');
      const account = (await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'finalized' }])).value;
      const metadata = checkMint(account, mint, kind, assetName);
      const document = await json(metadata.uri);
      if (document.name !== assetName || document.symbol !== 'QA') throw Error('Immutable document mismatch');
      const imageURI = checkArtwork(document.image, metadata.uri, name === 'custom' && kind === 'nft');
      const artwork = await fetch(imageURI, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!artwork.ok) throw Error('Artwork unavailable');
      const artworkBytes = Buffer.from(await artwork.arrayBuffer());
      if (artworkBytes.length > 1048576) throw Error('Artwork too large');
      const asset = { kind, mint, metadataURI: metadata.uri, imageURI: document.image, imageSHA256: sha(artworkBytes), uploaded: name === 'custom' && kind === 'nft', ...issuance };
      report.assets.push(asset); report.receipts.push({ action: kind + '-issuance', ...issuance });
      stage = kind + ' transfer'; await identity();
      stage = kind + ' transfer amount';
      await page.getByLabel('Amount', { exact: true }).fill('5');
      stage = kind + ' transfer button';
      await page.getByRole('button', { name: kind === 'meme' ? 'Transfer meme tokens' : 'Transfer this NFT', exact: true }).click();
      stage = kind + ' transfer receipt';
      const moved = await lastReceipt(page, 'Asset transferred');
      const tokens = await holdings(report.recipient);
      const matched = tokens.filter(item => item.account?.data?.parsed?.info?.mint === mint);
      if (matched.length !== 1 || matched[0].account.owner !== TOKEN || matched[0].account.data.parsed.type !== 'account' ||
          matched[0].account.data.parsed.info.owner !== report.recipient || matched[0].account.data.parsed.info.state !== 'initialized' ||
          matched[0].account.data.parsed.info.tokenAmount.decimals !== (kind === 'nft' ? 0 : 6) ||
          matched[0].account.data.parsed.info.tokenAmount.amount !== (kind === 'nft' ? '1' : '5000000')) throw Error('Recipient finalized token balance mismatch');
      report.receipts.push({ action: kind + '-transfer', ...moved });
      if (kind === 'nft') {
        const gallery = await json(target.api + '/api/gallery/' + mint);
        if (gallery.currentOwner !== report.recipient) throw Error('Gallery current owner mismatch');
      }
      await rendered(page, kind + '-mint-transfer');
      await page.screenshot({ path: '/tmp/soc-final-' + name + '-' + profile + '-' + kind + '.png', fullPage: true });
    }
    stage = 'responsive discovery';
    const discovery = await context.newPage();
    for (const width of [1440, 360]) {
      await discovery.setViewportSize({ width, height: 1000 });
      const last = report.receipts.at(-1);
      await discovery.goto(target.web + '/explorer/tx/' + last.signature);
      await discovery.getByText('Confirmed', { exact: true }).waitFor({ timeout: 30000 });
      if (await discovery.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Explorer overflow');
      await discovery.keyboard.press('Tab');
      if (!await discovery.evaluate(() => document.activeElement?.tagName === 'A' || document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'INPUT')) throw Error('Keyboard focus unavailable');
      await discovery.screenshot({ path: '/tmp/soc-final-' + name + '-' + profile + '-' + width + '.png', fullPage: true });
    }
    stage = 'secret persistence and continuity';
    report.storageChecks = [];
    for (const p of [page, recipientPage]) {
      const snapshot = await p.evaluate(() => ({ localKeys: Object.keys(localStorage), sessionLength: sessionStorage.length,
        panelPreference: localStorage.getItem('classic.wallet.panel') }));
      report.storageChecks.push(checkBrowserStorage(name, snapshot));
    }
    if (pageErrors || consoleErrors || sensitivePayload || unexpectedDestination) throw Error('Browser integrity check failed');
    report.runtimeAfter = await identity(); report.frontendAfter = await bundle(target.web);
    if (JSON.stringify(report.frontendBefore) !== JSON.stringify(report.frontendAfter)) throw Error('Frontend changed during regression');
    if (new Set(report.receipts.map(row => row.signature)).size !== report.receipts.length) throw Error('Duplicate logical receipts');
    report.pageErrors = 0; report.consoleErrors = 0; report.finalizedReceipts = report.receipts.length;
    report.browserStorageEmpty = report.storageChecks.every(check => check.localStorageEmpty); report.walletSecretsPersisted = false; report.sensitivePayloadObserved = false;
    report.unexpectedAPIDestination = false; report.passed = true;
  } catch (error) {
    report.issues.push('Regression stopped during ' + stage + '; no release acceptance. Preserve partial receipts and investigate.');
    // Diagnostic text is from this bounded public-page driver. Never inspect
    // memory-wallet contents, request bodies, browser traces or key material.
    report.failureStage = stage;
    report.failureType = error?.name ?? 'Error';
    report.failureMessage = String(error?.message ?? '').slice(0,500);
  } finally {
    await browser?.close(); report.completedAt = new Date().toISOString(); report.independentReadTransportRetries = readRetries;
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ passed: report.passed, target: name, evidence: output.slice(ROOT.length), assets: report.assets.length, finalizedReceipts: report.receipts.length, issues: report.issues }));
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (![6,8].includes(process.argv.length) || process.argv[2] !== '--target' || process.argv[4] !== '--ack' || process.argv[5] !== 'valueless-devnet' || process.argv.length === 8 && process.argv[6] !== '--viewport') throw Error('Use --target frozen|custom --ack valueless-devnet [--viewport desktop|mobile]; no other targets supported');
  if (!(await run(process.argv[3], process.argv[7] ?? 'desktop')).passed) process.exitCode = 1;
}
