import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PublicKey } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../../apps/api/src/store';
import { LIMITS } from '../../packages/config/src/index';

type Request = { wallet: string; ip: string; requestId: string };
type Snapshot = { receipts: number; counterTotal: number; maxWallet: number; maxIp: number; global: number; fingerprint: string };
type Reply = { ready?: boolean; provenance?: { store: string; config: string }; outcomes: {requestId: string; created?: boolean; code?: string; status?: number}[]; snapshot: Snapshot };
const now = Date.UTC(2026, 0, 1);
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const wallet = (n: number) => new PublicKey(createHash('sha256').update(`fixture-wallet-${n}`).digest()).toBase58();
const request = (n: number): Request => ({ wallet: wallet(n), ip: `fixture-ip-${n}`, requestId: randomUUID() });
const provenance = {
  store: hash(readFileSync(new URL('../../apps/api/src/store.ts', import.meta.url))),
  config: hash(readFileSync(createRequire(import.meta.url).resolve('@solana-classic/config'))),
};
function reply(child: ChildProcess): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exited); child.off('error', failed); };
    const message = (value: unknown) => { cleanup(); resolve(value as Reply); };
    const exited = () => { cleanup(); reject(new Error('Fixture exited before response')); };
    const failed = () => { cleanup(); reject(new Error('Fixture process failed')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Fixture response deadline')); }, 8000);
    child.once('message', message); child.once('exit', exited); child.once('error', failed);
  });
}
async function reserve(child: ChildProcess, requests: Request[]) {
  const result = reply(child); child.send({ type: 'reserve', requests, now }); return result;
}
async function stop(child: ChildProcess, clean = true) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2000);
    child.once('exit', (code, signal) => { clearTimeout(timer); if (clean && (code !== 0 || signal)) reject(new Error('Fixture did not close cleanly')); else resolve(); });
    if (clean && child.connected) child.send({ type: 'close' }); else child.kill('SIGTERM');
  });
}

describe('isolated faucet reservations across separate processes', () => {
  let directory: string;
  let children: ChildProcess[];
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'classic-faucet-process-')); children = []; new Store(directory).close(); });
  afterEach(async () => { await Promise.all(children.map(child => stop(child, false))); rmSync(directory, { recursive: true, force: true }); });
  async function start() {
    const child = fork(fileURLToPath(new URL('../fixtures/faucet-process-worker.ts', import.meta.url)), [directory], {
      execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, CLASSIC_ISOLATED_FAUCET_FIXTURE: '1' },
    });
    children.push(child); let stderr = ''; child.stderr?.on('data', data => { stderr += String(data).slice(0, 4096 - stderr.length); });
    try { const ready = await reply(child); expect(ready.ready).toBe(true); expect(ready.provenance).toEqual(provenance); }
    catch (error) { throw new Error(`Fixture startup failed: ${stderr}`, { cause: error }); }
    return child;
  }
  it.each(['wallet', 'ip', 'global'] as const)('enforces the %s cap across concurrent connections and process replacement', async dimension => {
    const seeded = dimension === 'global' ? LIMITS.faucetGlobalDay - 5 : 0;
    const seed = new Store(directory);
    try { for (let i = 0; i < seeded; i++) { const r = request(i); seed.reserveFaucet(r.wallet, r.ip, r.requestId, now); } } finally { seed.close(); }
    const allowed = dimension === 'wallet' ? LIMITS.faucetWalletDay : dimension === 'ip' ? LIMITS.faucetIpDay : 5;
    const requests = Array.from({ length: allowed + 4 }, (_, i) => ({ ...request(2000 + i),
      ...(dimension === 'wallet' ? { wallet: wallet(2000) } : {}), ...(dimension === 'ip' ? { ip: 'shared-fixture-ip' } : {}) }));
    const first = await start(), second = await start();
    const results = await Promise.all([reserve(first, requests.filter((_, i) => i % 2 === 0)), reserve(second, requests.filter((_, i) => i % 2 === 1))]);
    const outcomes = results.flatMap(r => r.outcomes);
    expect(outcomes.filter(r => r.created === true)).toHaveLength(allowed);
    expect(outcomes.filter(r => r.code === 'LIMIT_REACHED' && r.status === 429)).toHaveLength(4);
    const before = (await reserve(first, [])).snapshot;
    expect(before.receipts).toBe(seeded + allowed); expect(before.counterTotal).toBe(3 * before.receipts);
    expect(before.maxWallet).toBeLessThanOrEqual(LIMITS.faucetWalletDay); expect(before.maxIp).toBeLessThanOrEqual(LIMITS.faucetIpDay); expect(before.global).toBe(before.receipts);
    await Promise.all([stop(first), stop(second)]);
    const replacement = await start();
    const denied = await reserve(replacement, [{ ...requests[0]!, requestId: randomUUID() }]);
    expect(denied.outcomes).toMatchObject([{ code: 'LIMIT_REACHED', status: 429 }]); expect(denied.snapshot).toEqual(before);
    const accepted = requests.find(r => outcomes.some(o => o.requestId === r.requestId && o.created))!;
    const replay = await reserve(replacement, [accepted]); expect(replay.outcomes).toMatchObject([{ created: false }]); expect(replay.snapshot).toEqual(before);
    await stop(replacement);
  });
  it('reserves one logical request across processes and rejects a conflicting wallet after replacement', async () => {
    const first = await start(), second = await start(), selected = request(3000);
    const results = await Promise.all([reserve(first, Array(4).fill(selected)), reserve(second, Array(4).fill(selected))]);
    const outcomes = results.flatMap(r => r.outcomes); expect(outcomes.filter(r => r.created === true)).toHaveLength(1); expect(outcomes.filter(r => r.created === false)).toHaveLength(7);
    const before = (await reserve(first, [])).snapshot; expect(before.receipts).toBe(1); expect(before.counterTotal).toBe(3);
    await Promise.all([stop(first), stop(second)]);
    const replacement = await start(); const conflict = await reserve(replacement, [{ ...selected, wallet: wallet(3001) }]);
    expect(conflict.outcomes).toMatchObject([{ code: 'REQUEST_CONFLICT', status: 409 }]); expect(conflict.snapshot).toEqual(before);
    const replay = await reserve(replacement, [selected]); expect(replay.outcomes).toMatchObject([{ created: false }]); expect(replay.snapshot).toEqual(before); await stop(replacement);
  });
});
