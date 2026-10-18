import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../../packages/config/src/index';
import { createApp } from '../../apps/api/src/app';
import type { Settings } from '../../apps/api/src/settings';

// Isolated fixture only: deployed maintenance state is neither read nor changed.
vi.mock('../../engine/migration/hold.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../../engine/migration/hold.mjs')>(),
  migrationHeld: () => false,
}));

const genesis = 'isolated-forwarding-fixture';
const wallet = '11111111111111111111111111111111';
const client = '192.0.2.25', other = '192.0.2.26';
const now = Date.UTC(2026, 9, 18, 1, 30);
const day = new Date(now).toISOString().slice(0, 10), hour = Math.floor(now / 3_600_000);
const asset = { mint: wallet, kind: 'nft', name: 'Isolated forwarding', symbol: 'TEST', presetId: 3 };

describe('nearest-hop attribution over loopback HTTP; supplied ingress headers only', () => {
  let directory: string, base: string, context: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    directory = mkdtempSync(join(tmpdir(), 'classic-forwarding-'));
    const settings: Settings = {
      dataDir: directory, hosting: 'railway', port: 3000, upstreamUrl: 'http://127.0.0.1:1/',
      assetOrigin: 'https://assets.example.test', allowedOrigins: ['https://web.example.test'],
      network: { name: 'Isolated fixture', mode: 'local', expectedGenesisHash: genesis,
        denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false,
        tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', resetPolicy: 'Fixture only.' },
    };
    context = await createApp(settings);
    vi.spyOn(context.connection, 'getGenesisHash').mockResolvedValue(genesis);
    vi.spyOn(context.connection, 'requestAirdrop').mockResolvedValue('2'.repeat(88));
    base = await context.app.listen({ host: '127.0.0.1', port: 0 });
  });
  afterEach(async () => {
    await context?.app.close();
    vi.restoreAllMocks();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  const counters = () => context.store.db.prepare('SELECT key,count FROM counters ORDER BY key').all();
  async function post(route: 'assets' | 'faucet', headers: Record<string, string>) {
    const response = await fetch(`${base}/api/${route}`, { method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(route === 'assets' ? asset : { publicKey: wallet, requestId: randomUUID() }) });
    return { status: response.status, body: await response.json() as { error?: { code: string } } };
  }

  it.each(['assets', 'faucet'] as const)('%s rejects spoofed prefixes at the client cap while another client succeeds', async route => {
    const key = route === 'assets' ? `asset:ip:${client}:${hour}` : `faucet:ip:${client}:${day}`;
    const max = route === 'assets' ? LIMITS.assetsIpHour : LIMITS.faucetIpDay;
    context.store.db.prepare('INSERT INTO counters(key,count) VALUES(?,?)').run(key, max);
    const initial = counters();
    for (const prefix of ['198.51.100.1', '203.0.113.2, 198.51.100.99', 'unknown-prefix', '2001:db8::7']) {
      const response = await post(route, { 'x-forwarded-for': `${prefix}, ${client}`,
        'x-real-ip': prefix, forwarded: 'for=203.0.113.9;proto=https', 'true-client-ip': '203.0.113.10' });
      expect(response.status).toBe(429); expect(response.body.error?.code).toBe('LIMIT_REACHED');
      expect(counters()).toEqual(initial);
    }
    expect(context.store.db.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 0 });
    expect(context.store.db.prepare('SELECT COUNT(*) AS n FROM faucet').get()).toEqual({ n: 0 });
    expect(context.connection.requestAirdrop).not.toHaveBeenCalled();
    const positive = await post(route, { 'x-forwarded-for': `${client}, ${other}` });
    expect(positive.status).toBe(200);
    const globalKey = route === 'assets' ? `asset:global:${day}` : `faucet:global:${day}`;
    expect(context.store.db.prepare('SELECT count FROM counters WHERE key=?').get(globalKey)).toEqual({ count: 1 });
    expect(context.store.db.prepare('SELECT count FROM counters WHERE key=?').get(key)).toEqual({ count: max });
    const otherKey = route === 'assets' ? `asset:ip:${other}:${hour}` : `faucet:ip:${other}:${day}`;
    expect(context.store.db.prepare('SELECT count FROM counters WHERE key=?').get(otherKey)).toEqual({ count: 1 });
    expect(counters()).toHaveLength(route === 'assets' ? 3 : 4);
    expect(context.connection.requestAirdrop).toHaveBeenCalledTimes(route === 'assets' ? 0 : 1);
    if (route === 'faucet') expect(context.store.db.prepare('SELECT ip FROM faucet').all()).toEqual([{ ip: other }]);
  });

  it('uses the real socket peer when XFF is absent and ignores alternate forwarding fields', async () => {
    for (const address of ['198.51.100.1', '2001:db8::1']) {
      expect((await post('faucet', { forwarded: `for=${address}`, 'x-real-ip': address, 'true-client-ip': address })).status).toBe(200);
    }
    expect(context.store.db.prepare('SELECT DISTINCT ip FROM faucet').all()).toEqual([{ ip: '127.0.0.1' }]);
    expect(context.store.db.prepare("SELECT key,count FROM counters WHERE key LIKE 'faucet:ip:%'").all()).toEqual([{ key: `faucet:ip:127.0.0.1:${day}`, count: 2 }]);
    expect(context.connection.requestAirdrop).toHaveBeenCalledTimes(2);
  });
});
