import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Keypair,PublicKey} from '@solana/web3.js';
import {pinnedFixture} from './test-fixtures/pinned.mjs';
import {preparePendingClaim,preparePinnedPendingClaim,takeSubmissionAttempt,takePinnedSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const hash=b=>createHash('sha256').update(b).digest('hex');
const account=(b,owner,executable=false)=>({owner,executable,data:[b.toString('base64'),'base64']});
for(const direction of [0,1])test(`pinned direction${direction} hands out original bytes once and recovers past admission checkpoint`,async t=>{
  const f=await pinnedFixture(t,direction),p=preparePinnedPendingClaim(f.args);
  const before=await inspectPendingClaim(f.directory,p.id);assert.equal(before.schemaVersion,2);assert.equal(before.programmePinsHash.length,64);assert(!Object.hasOwn(before,'transactionBase64'));
  const attempt=await takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher);assert(attempt.rawTransaction.equals(f.args.transaction));
  const saved=f.record(p.id);assert.equal(saved.programmePinHandoffAttempted,true);assert.equal(saved.programmePinAdmission.source.contextSlot,50);assert.equal(saved.attempts,1);assert.equal(f.sides.source.reads,4);assert.equal(f.sides.destination.reads,4);
  await assert.rejects(takeSubmissionAttempt(f.directory,p.id,f.fetcher),/already exists/);
  f.checkpoint(60);f.mode('finalized');assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'FINALIZED');
  assert.equal((await inspectPendingClaim(f.directory,p.id)).state,'FINALIZED');
  assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'FINALIZED');
  assert(f.calls.every(q=>!['sendTransaction','getLatestBlockhash'].includes(q.method)));
});
for(const mode of ['lateCode','lateAuthority','latePolicy','lateExpiry','lateHeightRegression','lateReceipt','wrongGenesis','stale','outage'])test(`${mode} blocks handoff without changing prepared journal bytes`,async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args),before=readFileSync(f.path(p.id));f.set(mode);
  await assert.rejects(takeSubmissionAttempt(f.directory,p.id,f.fetcher));assert(readFileSync(f.path(p.id)).equals(before));assert.equal(f.record(p.id).attempts,0);
});
test('paused settlement, mismatched committee, precision and epoch reject even with freshly supplied digests',async t=>{
  for(const mode of ['pause','committee','precision','epoch']){
    const f=await pinnedFixture(t),s=f.sides.source;
    if(mode==='pause')s.config[341]=1;
    if(mode==='committee')Keypair.generate().publicKey.toBuffer().copy(s.config,296);
    if(mode==='precision')s.config[328]=7;
    if(mode==='epoch')s.config.writeBigUInt64LE(2n,332);
    s.pins.policySHA256=hash(s.config.subarray(0,358));const p=preparePinnedPendingClaim(f.args);
    await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher));assert.equal(f.record(p.id).attempts,0);
  }
});
test('wrong pin domain, mint, extra fields and missing digests cannot prepare',async t=>{
  for(const mode of ['domain','mint','extra','missing']){
    const f=await pinnedFixture(t),pins=f.args.programmePins.source;
    if(mode==='domain')pins.side=1;if(mode==='mint')pins.originMint=Keypair.generate().publicKey.toBase58();if(mode==='extra')pins.canSign=true;if(mode==='missing')delete pins.elfSHA256;
    assert.throws(()=>preparePinnedPendingClaim(f.args));assert.equal(f.calls.length,0);
  }
});
test('caller pin mutation cannot replace committed code, and stored policy tampering rejects',async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args);f.sides.source.data[45]^=1;
  f.args.programmePins.source.programDataSHA256=hash(f.sides.source.data);f.args.programmePins.source.elfSHA256=hash(f.sides.source.data.subarray(45,53));
  await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher));
  const record=f.record(p.id);record.programmePinPolicy.source.elfSHA256='a'.repeat(64);writeFileSync(f.path(p.id),JSON.stringify(record));
  await assert.rejects(inspectPendingClaim(f.directory,p.id),/digest changed/);
});
test('concurrent callers get at most one handoff under the journal lock',async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args);
  const r=await Promise.allSettled([Promise.resolve().then(()=>takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher)),Promise.resolve().then(()=>takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher))]);
  assert.equal(r.filter(v=>v.status==='fulfilled').length,1);assert.equal(f.record(p.id).attempts,1);
});
test('pinned-only entry refuses legacy records while legacy rehearsal remains supported',async t=>{
  const f=await pinnedFixture(t),p=preparePendingClaim(f.args);
  await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher),/version2/);
  assert.equal((await takeSubmissionAttempt(f.directory,p.id,f.fetcher)).signature,p.signature);
});
test('prepared expiry observation remains inspectable without a handoff admission or retry',async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args),expired=async(...args)=>{const r=await f.fetcher(...args),body=await r.json();if(JSON.parse(args[1].body).method==='getBlockHeight')body.result=101;return new Response(JSON.stringify(body));};
  assert.equal((await reconcilePendingClaim(f.directory,p.id,expired)).state,'EXPIRED_UNRESOLVED');assert.equal(f.record(p.id).programmePinHandoffAttempted,false);
  assert.equal((await inspectPendingClaim(f.directory,p.id)).state,'EXPIRED_UNRESOLVED');await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher),/already exists/);
});
test('a saved signed handoff cannot lose its mandatory pin admission',async t=>{
  for(const mode of ['missing','flag','digest','checkpoint']){
    const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args);await takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher);const record=f.record(p.id);
    if(mode==='missing')delete record.programmePinAdmission;if(mode==='flag'){record.programmePinHandoffAttempted=false;delete record.programmePinAdmission;}if(mode==='digest')record.programmePinAdmission.policySHA256='b'.repeat(64);if(mode==='checkpoint')record.programmePinAdmission.source.contextSlot=0;
    writeFileSync(f.path(p.id),JSON.stringify(record));await assert.rejects(inspectPendingClaim(f.directory,p.id));
  }
});
