import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PublicKey } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import type { Settings } from '../../apps/api/src/settings';
import { MEME_SUPPLY, type AssetDocument } from '../../packages/config/src/index';

// Only isolated migration admission is opened. Chain observations are supplied;
// the route, Store, asset verifier and Token-2022 byte decoders remain real.
vi.mock('../../engine/migration/hold.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../../engine/migration/hold.mjs')>(), migrationHeld: () => false,
}));
const requireChain = createRequire(new URL('../../packages/chain/package.json', import.meta.url));
type Metadata = { mint: PublicKey; name: string; symbol: string; uri: string; updateAuthority?: PublicKey; additionalMetadata: [] };
const token = requireChain('@solana/spl-token') as {
  TOKEN_2022_PROGRAM_ID: PublicKey; TOKEN_PROGRAM_ID: PublicKey; ACCOUNT_SIZE: number;
  AccountType: { Mint: number }; ExtensionType: { MetadataPointer: number; TokenMetadata: number };
  MintLayout: { span: number; encode(value: Record<string, unknown>, bytes: Buffer): number };
  MetadataPointerLayout: { span: number; encode(value: Record<string, unknown>, bytes: Buffer): number };
};
const metadataCodec = requireChain('@solana/spl-token-metadata') as { pack(value: Metadata): Uint8Array };
const genesis = 'isolated-gallery-control-genesis';
const key = (label: string) => new PublicKey(createHash('sha256').update(label).digest());
const mint = key('gallery-fixture-mint'), other = key('gallery-fixture-other');
const signature = '2'.repeat(88);
function extension(type: number, bytes: Uint8Array) {
  const header = Buffer.alloc(4); header.writeUInt16LE(type); header.writeUInt16LE(bytes.length, 2);
  return Buffer.concat([header, bytes]);
}
function mintBytes(asset: AssetDocument, changes: Partial<Metadata> = {}, pointerChanges: Record<string, PublicKey> = {}) {
  const base = Buffer.alloc(token.ACCOUNT_SIZE + 1);
  token.MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: asset.kind === 'nft' ? 1n : MEME_SUPPLY,
    decimals: asset.kind === 'nft' ? 0 : 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, base.subarray(0, token.MintLayout.span));
  base[token.ACCOUNT_SIZE] = token.AccountType.Mint;
  const pointer = Buffer.alloc(token.MetadataPointerLayout.span);
  token.MetadataPointerLayout.encode({ authority: PublicKey.default, metadataAddress: mint, ...pointerChanges }, pointer);
  const metadata = metadataCodec.pack({ mint, name: asset.name, symbol: asset.symbol, uri: asset.uri, additionalMetadata: [], ...changes });
  return Buffer.concat([base, extension(token.ExtensionType.MetadataPointer, pointer), extension(token.ExtensionType.TokenMetadata, metadata)]);
}

describe('isolated gallery refusal with actual mint and metadata decoding', () => {
  let directory: string, context: Awaited<ReturnType<typeof createApp>>, settings: Settings;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'classic-gallery-control-'));
    settings = { dataDir: directory, assetOrigin: 'https://assets.example.test', allowedOrigins: ['https://web.example.test'], upstreamUrl: 'http://127.0.0.1:8899/', port: 3000,
      network: { name: 'Isolated fixture', mode: 'local', expectedGenesisHash: genesis, denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false,
        tokenProgram: token.TOKEN_2022_PROGRAM_ID.toBase58(), associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', resetPolicy: 'Fixture only.' } };
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No network access in gallery fixture'); }));
    context = await createApp(settings); await context.app.ready();
    vi.spyOn(context.connection, 'getGenesisHash').mockResolvedValue(genesis);
  });
  afterEach(async () => { await context.app.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });
  function prepare(kind: 'nft' | 'meme' = 'nft') {
    const asset = context.store.createAsset({ mint: mint.toBase58(), kind, name: 'Fixture Orbit', symbol: 'ORBIT', presetId: 3 }, genesis, settings.assetOrigin, 'fixture-ip');
    const proof = { meta: { err: null }, transaction: { message: { instructions: [{ programId: token.TOKEN_2022_PROGRAM_ID,
      parsed: { type: 'mintTo', info: { mint: asset.mint, amount: kind === 'nft' ? '1' : MEME_SUPPLY.toString() } } }] } } };
    const parsed = vi.spyOn(context.connection, 'getParsedTransaction').mockResolvedValue(proof as unknown as Awaited<ReturnType<typeof context.connection.getParsedTransaction>>);
    const info = { data: mintBytes(asset), owner: token.TOKEN_2022_PROGRAM_ID, executable: false, lamports: 10000000, rentEpoch: 0 };
    const account = vi.spyOn(context.connection, 'getAccountInfo').mockResolvedValue(info);
    const payload = { mint: asset.mint, contentHash: asset.contentHash, issuanceSignature: signature };
    return { asset, proof, parsed, info, account, payload };
  }
  function snapshot() {
    return ['assets', 'gallery', 'faucet', 'counters'].map(table => context.store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  }
  async function denied(payload: ReturnType<typeof prepare>['payload'], status: number, code: string) {
    const before = snapshot();
    const result = await context.app.inject({ method: 'POST', url: '/api/gallery', payload });
    expect(result.statusCode).toBe(status); expect(result.json().error.code).toBe(code);
    expect(snapshot()).toEqual(before); expect(context.store.gallery(genesis, 0, 10)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  }
  it.each(['nft', 'meme'] as const)('accepts a correctly encoded %s control through the same route', async kind => {
    const fixture = prepare(kind);
    const result = await context.app.inject({ method: 'POST', url: '/api/gallery', payload: fixture.payload });
    expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ mint: fixture.asset.mint, issuanceSignature: signature });
    expect(context.store.gallery(genesis, 0, 10)).toHaveLength(1);
    expect(fixture.parsed).toHaveBeenCalledWith(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
    expect(fixture.account).toHaveBeenCalledTimes(2);
    for (const [address, commitment] of fixture.account.mock.calls) { expect(address.equals(mint)).toBe(true); expect(commitment).toBe('finalized'); }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['name', 'symbol', 'uri', 'mint', 'updateAuthority'] as const)('rejects validly encoded wrong metadata %s without insertion', async field => {
    const fixture = prepare();
    const changes = field === 'mint' || field === 'updateAuthority' ? { [field]: other } : { [field]: `wrong-${field}` };
    fixture.info.data = mintBytes(fixture.asset, changes);
    await denied(fixture.payload, 503, 'SERVICE_UNAVAILABLE'); expect(fixture.account).toHaveBeenCalledTimes(2);
  });
  it.each(['metadataAddress', 'authority'] as const)('rejects a validly encoded wrong pointer %s without insertion', async field => {
    const fixture = prepare(); fixture.info.data = mintBytes(fixture.asset, {}, { [field]: other });
    await denied(fixture.payload, 503, 'SERVICE_UNAVAILABLE'); expect(fixture.account).toHaveBeenCalledTimes(2);
  });
  it('rejects correct mint bytes owned by the wrong token program', async () => {
    const fixture = prepare(); fixture.info.owner = token.TOKEN_PROGRAM_ID;
    await denied(fixture.payload, 503, 'SERVICE_UNAVAILABLE'); expect(fixture.account).toHaveBeenCalledTimes(2);
  });
  it('rejects a matching issuance instruction from the wrong token program before account reads', async () => {
    const fixture = prepare(); fixture.proof.transaction.message.instructions[0]!.programId = token.TOKEN_PROGRAM_ID;
    await denied(fixture.payload, 400, 'ISSUANCE_PROOF'); expect(fixture.account).not.toHaveBeenCalled();
  });
  it.each(['another-private-genesis', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'])('rejects wrong/public genesis %s before proof reads', async actual => {
    const fixture = prepare(); vi.mocked(context.connection.getGenesisHash).mockResolvedValue(actual);
    await denied(fixture.payload, 503, 'SERVICE_UNAVAILABLE'); expect(fixture.parsed).not.toHaveBeenCalled(); expect(fixture.account).not.toHaveBeenCalled();
  });
  it('rejects a valid-shaped wrong mint before proof reads', async () => {
    const fixture = prepare(); await denied({ ...fixture.payload, mint: other.toBase58() }, 400, 'ASSET_MISMATCH');
    expect(fixture.parsed).not.toHaveBeenCalled(); expect(fixture.account).not.toHaveBeenCalled();
  });
  it('rejects an unknown signature without insertion', async () => {
    const fixture = prepare(); fixture.parsed.mockResolvedValue(null);
    await denied(fixture.payload, 409, 'NOT_FINALIZED'); expect(fixture.account).not.toHaveBeenCalled();
  });
});
