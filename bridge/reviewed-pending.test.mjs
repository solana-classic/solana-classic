import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {Keypair} from '@solana/web3.js';
import {reviewedFixture} from './test-fixtures/reviewed-pending.mjs';
import {reviewedOriginMintPolicy} from './reviewed-origin-mint.mjs';
import {preparePendingClaim,preparePinnedPendingClaim,prepareReviewedPendingClaim,takeSubmissionAttempt,takePinnedSubmissionAttempt,takeReviewedSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
for(const direction of [0,1])test(`reviewed direction${direction} binds mint policy, hands original bytes once and reconciles exact finalized movement`,async t=>{
 const f=await reviewedFixture(t,direction),p=prepareReviewedPendingClaim(f.args),before=await inspectPendingClaim(f.directory,p.id);
 assert.equal(before.schemaVersion,3);assert.equal(before.reviewedMintPolicySHA256,f.args.reviewedMintPolicy.sha256);assert(!Object.hasOwn(before,'transactionBase64'));
 const a=await takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher);assert(a.rawTransaction.equals(f.args.transaction));
 const record=f.record(p.id);assert.equal(record.attempts,1);assert.equal(record.reviewedMintAdmission.policySHA256,record.reviewedMintPolicy.sha256);assert.equal(record.reviewedMintAdmission.first.mintDataSHA256,record.reviewedMintAdmission.final.mintDataSHA256);assert.equal(f.counts().assetReads,4);assert.equal(f.counts().tokenReads,8);assert(statSync(f.path(p.id)).size<=16384);
 for(const entry of [takeSubmissionAttempt,takePinnedSubmissionAttempt,takeReviewedSubmissionAttempt])await assert.rejects(entry(f.directory,p.id,f.fetcher),/already exists/);
 f.checkpoint(60);f.mode('finalized');assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'FINALIZED');assert.equal((await inspectPendingClaim(f.directory,p.id)).state,'FINALIZED');assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'FINALIZED');
 assert(f.reviewCalls.every(q=>!['sendTransaction','getLatestBlockhash'].includes(q.method)));
});
for(const entry of [takeSubmissionAttempt,takePinnedSubmissionAttempt,takeReviewedSubmissionAttempt])test(`${entry.name} cannot bypass a version3 mint refusal`,async t=>{
 const f=await reviewedFixture(t),p=prepareReviewedPendingClaim(f.args),before=readFileSync(f.path(p.id));f.reviewMode('changedMint');await assert.rejects(entry(f.directory,p.id,f.fetcher),/mint bytes differ/);assert(readFileSync(f.path(p.id)).equals(before));assert.equal(f.record(p.id).attempts,0);
});
for(const direction of [0,1])test(`reviewed direction${direction} late metadata, token-code, depletion and legacy pin failures retain prepared bytes`,async t=>{
 for(const mode of ['lateMint','lateTokenCode','depleted','outage','lateCode','lateExpiry','lateReceipt']){
  const f=await reviewedFixture(t,direction),p=prepareReviewedPendingClaim(f.args),before=readFileSync(f.path(p.id));
  if(['lateMint','lateTokenCode','depleted'].includes(mode))f.reviewMode(mode);else f.set(mode);
  await assert.rejects(takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher));assert(readFileSync(f.path(p.id)).equals(before));assert.equal(f.record(p.id).attempts,0);
 }
});
test('both old preparation entry points refuse silently ignored metadata policy options',async t=>{
 for(const prepare of [preparePendingClaim,preparePinnedPendingClaim]){const f=await reviewedFixture(t);assert.throws(()=>prepare(f.args),/explicit version3/);assert.deepEqual(readdirSync(f.directory),[]);}
});
test('legacy versions retain extended-mint refusal and reviewed-only handoff cannot upgrade them',async t=>{
 for(const prepare of [preparePendingClaim,preparePinnedPendingClaim]){
  const f=await reviewedFixture(t,1),{reviewedMintPolicy,...args}=f.args,p=prepare(args),before=readFileSync(f.path(p.id));
  await assert.rejects(takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher),/version[23]/);await assert.rejects(takeSubmissionAttempt(f.directory,p.id,f.fetcher),/unsupported/);assert(readFileSync(f.path(p.id)).equals(before));
 }
});
test('cross-domain, wrong precision or insufficient selected supply rejects before creating a record',async t=>{
 for(const mode of ['mint','bridge','genesis','precision','supply']){
  const f=await reviewedFixture(t),old=f.args.reviewedMintPolicy;
  const policy=mode==='precision'?reviewedOriginMintPolicy({...old,expectedDecimals:7}):mode==='supply'?reviewedOriginMintPolicy({...old,expectedSupplyUnits:'1'}):reviewedOriginMintPolicy({...old,pins:{...old.pins,[mode==='mint'?'originMint':mode==='genesis'?'remoteGenesis':'bridge']:Keypair.generate().publicKey.toBase58()}});
  assert.throws(()=>prepareReviewedPendingClaim({...f.args,reviewedMintPolicy:policy}),/claim domain/);assert.deepEqual(readdirSync(f.directory),[]);assert.equal(f.reviewCalls.length,0);
 }
});
test('caller review replacement after preparation cannot select different actual mint bytes',async t=>{
 const f=await reviewedFixture(t),p=prepareReviewedPendingClaim(f.args),before=readFileSync(f.path(p.id));f.mint[306]^=1;f.args.reviewedMintPolicy=f.reviewed();await assert.rejects(takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher),/mint bytes differ/);assert(readFileSync(f.path(p.id)).equals(before));
});
test('version3 admission, review digest, checkpoint and schema tampering refuses inspection',async t=>{
 for(const mode of ['missing','digest','first','last','future','downgrade','flag','falseFinalized']){
  const f=await reviewedFixture(t),p=prepareReviewedPendingClaim(f.args);await takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher);const r=f.record(p.id);
  if(mode==='missing')delete r.reviewedMintAdmission;if(mode==='digest')r.reviewedMintPolicy.expectedMintDataSHA256='a'.repeat(64);if(mode==='first')r.reviewedMintAdmission.first.contextSlot=0;if(mode==='last')r.reviewedMintAdmission.final.firstContextSlot=0;if(mode==='future')r.reviewedMintAdmission.final.finalTokenContextSlot=1000;if(mode==='downgrade')r.schemaVersion=2;if(mode==='flag'){r.programmePinHandoffAttempted=false;delete r.programmePinAdmission;}if(mode==='falseFinalized'){r.state='FINALIZED';r.programmePinHandoffAttempted=false;delete r.programmePinAdmission;delete r.reviewedMintAdmission;delete r.attemptedAt;}
  writeFileSync(f.path(p.id),JSON.stringify(r));await assert.rejects(inspectPendingClaim(f.directory,p.id));
 }
});
test('concurrent reviewed callers receive at most one signed-byte handoff',async t=>{
 const f=await reviewedFixture(t),p=prepareReviewedPendingClaim(f.args);const results=await Promise.allSettled([Promise.resolve().then(()=>takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher)),Promise.resolve().then(()=>takeSubmissionAttempt(f.directory,p.id,f.fetcher))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.record(p.id).attempts,1);
});
test('an expired unsubmitted version3 record stays inspectable and can never retry',async t=>{
 const f=await reviewedFixture(t),p=prepareReviewedPendingClaim(f.args),expired=async(...args)=>{const q=JSON.parse(args[1].body),w=await(await f.fetcher(...args)).json();if(q.method==='getBlockHeight')w.result=101;return new Response(JSON.stringify(w));};assert.equal((await reconcilePendingClaim(f.directory,p.id,expired)).state,'EXPIRED_UNRESOLVED');assert.equal((await inspectPendingClaim(f.directory,p.id)).schemaVersion,3);await assert.rejects(takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher),/already exists/);
});
test('a finalized operation seen outside reviewed handoff remains consumed-review-required',async t=>{
 const f=await reviewedFixture(t,1),p=prepareReviewedPendingClaim(f.args);f.mode('finalized');assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'CONSUMED_REVIEW_REQUIRED');assert.equal(f.record(p.id).programmePinHandoffAttempted,false);assert.equal((await inspectPendingClaim(f.directory,p.id)).state,'CONSUMED_REVIEW_REQUIRED');await assert.rejects(takeSubmissionAttempt(f.directory,p.id,f.fetcher),/already exists/);
});
test('recipient authority checks still apply to reviewed metadata redemption',async t=>{
 const f=await reviewedFixture(t,1),p=prepareReviewedPendingClaim(f.args),before=readFileSync(f.path(p.id));f.reviewMode('badRecipient');await assert.rejects(takeReviewedSubmissionAttempt(f.directory,p.id,f.fetcher),/authority or layout/);assert(readFileSync(f.path(p.id)).equals(before));
});
