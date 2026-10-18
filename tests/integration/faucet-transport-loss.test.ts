import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import type { Settings } from '../../apps/api/src/settings';
import { LIMITS } from '../../packages/config/src/index';

// Fixture-only admission; deployed maintenance controls remain untouched.
vi.mock('../../engine/migration/hold.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../../engine/migration/hold.mjs')>(),
  migrationHeld: () => false,
}));

const genesis = 'isolated-transport-fixture';
const wallet = '11111111111111111111111111111111';
const signature = '2'.repeat(88);

describe('faucet response loss over real loopback HTTP; synthetic upstream only', () => {
  let server: Server;
  let dataDir: string;
  let settings: Settings;
  let context: Awaited<ReturnType<typeof createApp>> | undefined;
  let grantMode: 'drop' | 'stall' | 'reply';
  let statusMode: 'drop' | 'reply';
  let grants: unknown[][];
  let statuses: unknown[][];
  let unexpected: string[];
  beforeEach(async () => {
    grants = []; statuses = []; unexpected = []; grantMode = 'drop'; statusMode = 'reply';
    server = createServer(async (request, reply) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: string; method: string; params: unknown[] };
      let result: unknown;
      if (body.method === 'getGenesisHash') result = genesis;
      else if (body.method === 'requestAirdrop') {
        grants.push(body.params);
        if (grantMode === 'drop') { reply.destroy(); return; }
        if (grantMode === 'stall') return;
        result = signature;
      } else if (body.method === 'getSignatureStatuses') {
        statuses.push(body.params);
        if (statusMode === 'drop') { reply.destroy(); return; }
        result = { context: { slot: 1 }, value: [{ slot: 1, confirmations: null, err: null, confirmationStatus: 'finalized' }] };
      } else { unexpected.push(body.method); reply.writeHead(500).end(); return; }
      reply.setHeader('Content-Type', 'application/json');
      reply.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Loopback listener required');
    dataDir = mkdtempSync(join(tmpdir(), 'classic-transport-'));
    settings = {
      dataDir, upstreamUrl: `http://127.0.0.1:${address.port}/`, port: 3000,
      assetOrigin: 'https://assets.example.test', allowedOrigins: ['https://web.example.test'],
      network: { name: 'Isolated fixture', mode: 'local', expectedGenesisHash: genesis,
        denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false,
        tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', resetPolicy: 'Fixture only.' },
    };
    context = await createApp(settings); await context.app.ready();
  });
  afterEach(async () => {
    await context?.app.close(); context = undefined;
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    vi.restoreAllMocks();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });
  const counters = () => context!.store.db.prepare("SELECT key,count FROM counters WHERE key LIKE 'faucet:%' ORDER BY key").all();
  const submit = (request: { publicKey: string; requestId: string }) => context!.app.inject({ method: 'POST', url: '/api/faucet', payload: request });
  async function reopen() {
    await context!.app.close(); context = undefined;
    context = await createApp(settings); await context.app.ready();
  }

  it.each(['drop', 'stall'] as const)('retains one uncertain reservation after upstream %s and application reopen', async mode => {
    grantMode = mode;
    const request = { publicKey: wallet, requestId: randomUUID() };
    const started = performance.now();
    const first = await submit(request);
    if (mode === 'stall') expect(performance.now() - started).toBeGreaterThanOrEqual(LIMITS.rpcTimeoutMs - 100);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ state: 'uncertain', signature: null, requestId: request.requestId });
    expect(first.json().message).toContain('operator must reconcile');
    expect(grants).toHaveLength(1); expect(grants[0]?.slice(0, 2)).toEqual([wallet, 1_000_000_000]);
    const consumed = counters(); expect(consumed).toHaveLength(3);
    expect(consumed.map(row => (row as { count: number }).count)).toEqual([1, 1, 1]);
    await reopen(); grantMode = 'reply';
    const duplicates = await Promise.all(Array.from({ length: 8 }, () => submit(request)));
    for (const reply of duplicates) expect(reply.json()).toEqual(first.json());
    expect(grants).toHaveLength(1); expect(statuses).toHaveLength(0); expect(unexpected).toEqual([]);
    expect(context!.store.db.prepare('SELECT COUNT(*) AS count FROM faucet').get()).toEqual({ count: 1 });
    expect(counters()).toEqual(consumed);
  }, 20_000);

  it('preserves the submitted signature when its status response is lost, then reconciles after reopen', async () => {
    grantMode = 'reply'; statusMode = 'drop';
    const request = { publicKey: wallet, requestId: randomUUID() };
    const first = await submit(request);
    expect(first.json()).toMatchObject({ state: 'submitted', signature });
    const consumed = counters();
    expect((await submit(request)).statusCode).toBe(503);
    expect(context!.store.db.prepare('SELECT state,signature FROM faucet WHERE request_id=?').get(request.requestId)).toEqual({ state: 'submitted', signature });
    await reopen(); statusMode = 'reply';
    const reconciled = await submit(request);
    expect(reconciled.statusCode).toBe(200); expect(reconciled.json()).toMatchObject({ state: 'confirmed', signature });
    expect(grants).toHaveLength(1);
    expect(statuses).toEqual([[[signature], { searchTransactionHistory: true }], [[signature], { searchTransactionHistory: true }]]);
    expect(counters()).toEqual(consumed); expect(unexpected).toEqual([]);
  });
});
