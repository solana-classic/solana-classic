import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../../packages/config/src/index';
import { createApp } from '../../apps/api/src/app';
import type { Settings } from '../../apps/api/src/settings';

// Only the isolated route fixture opens maintenance admission. This does not
// exercise or alter deployed migration controls or their protected files.
vi.mock('../../engine/migration/hold.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../../engine/migration/hold.mjs')>(),
  migrationHeld: () => false,
}));

const genesis = 'isolated-faucet-fixture';
const wallet = '11111111111111111111111111111111';
const signature = '2'.repeat(88);

describe('isolated faucet concurrency and recorded-signature reconciliation', () => {
  let dataDir: string;
  let settings: Settings;
  let context: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'classic-faucet-'));
    settings = {
      dataDir, assetOrigin: 'https://assets.example.test', allowedOrigins: ['https://web.example.test'],
      upstreamUrl: 'http://127.0.0.1:8899/', port: 3000,
      network: { name: 'Isolated fixture', mode: 'local', expectedGenesisHash: genesis,
        denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false,
        tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', resetPolicy: 'Fixture only.' },
    };
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method !== 'getGenesisHash') throw new Error('Unexpected fixture RPC');
      return Response.json({ jsonrpc: '2.0', id: body.id, result: genesis });
    }));
    context = await createApp(settings); await context.app.ready();
  });
  afterEach(async () => {
    await context.app.close(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    rmSync(dataDir, { recursive: true, force: true });
  });
  const payload = () => ({ publicKey: wallet, requestId: randomUUID() });
  const counters = () => context.store.db.prepare("SELECT key,count FROM counters WHERE key LIKE 'faucet:%' ORDER BY key").all();
  const count = () => context.store.db.prepare('SELECT COUNT(*) AS count FROM faucet').get();

  it('admits one in-flight grant for concurrent identical requests and preserves it on reopen', async () => {
    let release!: (value: string) => void;
    const airdrop = vi.spyOn(context.connection, 'requestAirdrop').mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const request = payload();
    const first = Promise.resolve(context.app.inject({ method: 'POST', url: '/api/faucet', payload: request }));
    try {
      await vi.waitFor(() => expect(airdrop).toHaveBeenCalledTimes(1));
      const duplicates = await Promise.all(Array.from({ length: 8 }, () => context.app.inject({ method: 'POST', url: '/api/faucet', payload: request })));
      for (const reply of duplicates) { expect(reply.statusCode).toBe(200); expect(reply.json()).toMatchObject({ state: 'pending', signature: null }); }
      expect(airdrop).toHaveBeenCalledTimes(1); expect(count()).toEqual({ count: 1 });
      expect(counters()).toHaveLength(3); expect(counters().map(row => (row as { count: number }).count)).toEqual([1, 1, 1]);
    } finally { release?.(signature); await first; }
    expect((await first).json()).toMatchObject({ state: 'submitted', signature });
    const consumed = counters();
    await context.app.close(); context = await createApp(settings); await context.app.ready();
    const resend = vi.spyOn(context.connection, 'requestAirdrop');
    const statuses = vi.spyOn(context.connection, 'getSignatureStatuses').mockResolvedValue({ context: { slot: 1 }, value: [{ slot: 1, confirmations: null, err: null, confirmationStatus: 'finalized' }] });
    const reconciled = await context.app.inject({ method: 'POST', url: '/api/faucet', payload: request });
    expect(reconciled.json()).toMatchObject({ state: 'confirmed', signature });
    expect(statuses).toHaveBeenCalledExactlyOnceWith([signature], { searchTransactionHistory: true });
    expect(resend).not.toHaveBeenCalled(); expect(count()).toEqual({ count: 1 }); expect(counters()).toEqual(consumed);
  });

  it('enforces the wallet limit while distinct requests overlap an in-flight grant', async () => {
    const releases: ((value: string) => void)[] = [];
    const airdrop = vi.spyOn(context.connection, 'requestAirdrop').mockImplementation(() => new Promise(resolve => { releases.push(resolve); }));
    const requests = Array.from({ length: LIMITS.faucetWalletDay + 4 }, payload);
    const pending = requests.map(request => Promise.resolve(context.app.inject({ method: 'POST', url: '/api/faucet', payload: request })));
    let replies: Awaited<(typeof pending)[number]>[] = [];
    try {
      await vi.waitFor(() => expect(airdrop).toHaveBeenCalledTimes(LIMITS.faucetWalletDay));
      expect(count()).toEqual({ count: LIMITS.faucetWalletDay });
    } finally { for (const release of releases) release(signature); replies = await Promise.all(pending); }
    expect(replies.filter(r => r.statusCode === 200)).toHaveLength(LIMITS.faucetWalletDay);
    expect(replies.filter(r => r.statusCode === 429 && r.json().error.code === 'LIMIT_REACHED')).toHaveLength(4);
    expect(airdrop).toHaveBeenCalledTimes(LIMITS.faucetWalletDay);
    const consumed = counters();
    await context.app.close(); context = await createApp(settings); await context.app.ready();
    const resend = vi.spyOn(context.connection, 'requestAirdrop');
    expect((await context.app.inject({ method: 'POST', url: '/api/faucet', payload: payload() })).statusCode).toBe(429);
    expect(resend).not.toHaveBeenCalled(); expect(counters()).toEqual(consumed);
  });

  it.each(['missing', 'processed', 'confirmed', 'finalized', 'failed'] as const)('reconciles only the original signature when its status is %s', async state => {
    const request = payload(); context.store.reserveFaucet(wallet, '192.0.2.1', request.requestId);
    context.store.updateFaucet(request.requestId, 'submitted', signature, 'Fixture submitted.');
    const consumed = counters();
    const resend = vi.spyOn(context.connection, 'requestAirdrop');
    const statuses = vi.spyOn(context.connection, 'getSignatureStatuses').mockResolvedValue({ context: { slot: 1 }, value: [state === 'missing' ? null : { slot: 1, confirmations: null, err: state === 'failed' ? { InstructionError: [0, 'InvalidArgument'] } : null, confirmationStatus: state === 'failed' ? 'finalized' : state }] });
    const reply = await context.app.inject({ method: 'POST', url: '/api/faucet', payload: request });
    const expected = state === 'failed' ? 'failed' : ['confirmed', 'finalized'].includes(state) ? 'confirmed' : 'submitted';
    expect(reply.statusCode).toBe(200); expect(reply.json()).toMatchObject({ state: expected, signature });
    expect(statuses).toHaveBeenCalledExactlyOnceWith([signature], { searchTransactionHistory: true });
    expect(resend).not.toHaveBeenCalled(); expect(count()).toEqual({ count: 1 }); expect(counters()).toEqual(consumed);
  });
});
