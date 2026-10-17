// Disposable database fixture only. No RPC client, keys or grant submission.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { Store, HttpFailure } from '../../apps/api/src/store';

const directory = process.argv[2];
if (!directory || process.env.CLASSIC_ISOLATED_FAUCET_FIXTURE !== '1'
  || dirname(realpathSync(directory)) !== realpathSync(tmpdir())
  || !basename(directory).startsWith('classic-faucet-process-')) throw new Error('Disposable fixture directory required');
const store = new Store(directory);
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const provenance = {
  store: hash(readFileSync(new URL('../../apps/api/src/store.ts', import.meta.url))),
  config: hash(readFileSync(createRequire(import.meta.url).resolve('@solana-classic/config'))),
};
type Request = { wallet: string; ip: string; requestId: string };
function snapshot() {
  const counters = store.db.prepare('SELECT key,count FROM counters ORDER BY key').all() as {key: string; count: number}[];
  const receipts = store.db.prepare('SELECT * FROM faucet ORDER BY request_id').all();
  const maximum = (prefix: string) => Math.max(0, ...counters.filter(r => r.key.startsWith(prefix)).map(r => r.count));
  return { receipts: receipts.length, counterTotal: counters.reduce((n, r) => n + r.count, 0),
    maxWallet: maximum('faucet:wallet:'), maxIp: maximum('faucet:ip:'), global: maximum('faucet:global:'),
    fingerprint: hash(JSON.stringify({ counters, receipts })) };
}
process.on('message', (message: {type: string; requests: Request[]; now: number}) => {
  if (message.type === 'close') { store.close(); process.disconnect(); return; }
  if (message.type !== 'reserve' || !Array.isArray(message.requests) || message.requests.length > 32 || !Number.isSafeInteger(message.now)) throw new Error('Bounded fixture command required');
  const outcomes = message.requests.map(r => {
    try { const result = store.reserveFaucet(r.wallet, r.ip, r.requestId, message.now); return { requestId: r.requestId, created: result.created, state: result.receipt.state }; }
    catch (error) { if (error instanceof HttpFailure) return { requestId: r.requestId, code: error.code, status: error.statusCode }; throw error; }
  });
  process.send?.({ outcomes, snapshot: snapshot() });
});
process.send?.({ ready: true, provenance });
