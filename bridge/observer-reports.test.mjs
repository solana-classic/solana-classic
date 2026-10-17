import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PublicKey} from '@solana/web3.js';
import {fixture} from './test-fixtures/pending.mjs';
import {pinnedFixture} from './test-fixtures/pinned.mjs';
import {reviewedFixture} from './test-fixtures/reviewed-pending.mjs';
import {preparePendingClaim,preparePinnedPendingClaim,prepareReviewedPendingClaim,takeSubmissionAttempt,takePinnedSubmissionAttempt,takeReviewedSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
import {observerRosterHash,observerAccountingHash,observerReportMessage,verifyObserverReports,reviewAuthenticatedExpiry} from './observer-reports.mjs';
async function setup(t,version=1){
  const f=version===3?await reviewedFixture(t,1):version===2?await pinnedFixture(t,1):fixture(t,1),prepare=version===3?prepareReviewedPendingClaim:version===2?preparePinnedPendingClaim:preparePendingClaim,take=version===3?takeReviewedSubmissionAttempt:version===2?takePinnedSubmissionAttempt:takeSubmissionAttempt,r=prepare(f.args);await take(f.directory,r.id,f.fetcher);f.mode('expired');const expiredFetcher=version===1?f.fetcher:async(url,options)=>JSON.parse(options.body).method==='getBlockHeight'?new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:101})):f.fetcher(url,options);await reconcilePendingClaim(f.directory,r.id,expiredFetcher);
  const operation=await inspectPendingClaim(f.directory,r.id),actors=Array.from({length:5},()=>{const pair=generateKeyPairSync('ed25519');return {...pair,operator:new PublicKey(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32)).toBase58()};});
  assert.equal(operation.state,'EXPIRED_UNRESOLVED');
  const roster={scope:'isolated-review-only',threshold:3,sourceChain:operation.sourceChain,destinationChain:operation.destinationChain,epoch:operation.epoch,observers:actors.map(a=>a.operator)};
  const accounting={originEscrowUnits:'1960000',originOutstandingUnits:'1960000',nativeOutstandingUnits:'960000',pendingRedemptionUnits:'1000000',reserveNativeUnits:'52000000',protectedFloorNativeUnits:'2000000'};
  const reviewedAt='2026-10-14T16:30:00.000Z',programmePinsHash=operation.programmePinsHash??'a'.repeat(64),expected={...operation,programmePinsHash,accountingHash:observerAccountingHash(accounting)};
  const body=i=>({scope:'isolated-expired-redemption-observation-v1',purpose:'review-only',operator:actors[i].operator,rosterHash:observerRosterHash(roster),...Object.fromEntries(['id','journalHash','eventHash','transactionHash','instructionHash','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','signature','originMint','destinationToken','originAmount','nonce','epoch','programmePinsHash','accountingHash'].map(k=>[k,expected[k]])),evidenceHash:String(i+1).repeat(64),observedAt:reviewedAt,sourceFinalizedSlot:30,destinationFinalizedSlot:50,destinationFinalizedHeight:101,sourceReturnFinalized:true,receipt:'absent',signatureStatus:'absent',historyCoverage:'asserted-complete-for-attempt'});
  const envelope=(i,change={})=>{const report={...body(i),...change};return {report,signatureBase64:sign(null,observerReportMessage(report),actors[i].privateKey).toString('base64')};};
  const envelopes=[0,1,2].map(i=>envelope(i));
  return {...f,r,operation,actors,roster,accounting,programmePinsHash,expected,reviewedAt,envelope,envelopes,verify:changes=>verifyObserverReports({envelopes,reviewRoster:roster,expected,reviewedAt,...changes}),review:changes=>reviewAuthenticatedExpiry({directory:f.directory,id:r.id,envelopes,reviewRoster:roster,programmePinsHash,accounting,reviewedAt,...changes})};
}
test('three distinct approved keys authenticate review reports without activation',async t=>{
  const f=await setup(t),r=f.verify();assert.equal(r.signers.length,3);assert.equal(r.keyAuthenticationVerified,true);assert.equal(r.operatorIdentityVerified,false);assert.equal(r.operatorIndependenceVerified,false);assert.equal(r.rosterApprovedForProduction,false);assert.equal(r.canRetry,false);assert.equal(r.canSign,false);assert.equal(r.canBroadcast,false);assert.equal(r.productionReady,false);
});
test('quorum cannot be weakened or inflated through duplicate reports/signatures',async t=>{
  const f=await setup(t);assert.throws(()=>f.verify({envelopes:f.envelopes.slice(0,2)}));assert.throws(()=>f.verify({envelopes:[f.envelopes[0],f.envelopes[0],f.envelopes[1]]}));assert.throws(()=>f.verify({reviewRoster:{...f.roster,threshold:2}}));assert.throws(()=>f.verify({reviewRoster:{...f.roster,observers:[...f.roster.observers.slice(0,4),f.roster.observers[0]]}}));
});
test('invalid, substituted, malformed or noncanonical signatures reject',async t=>{
  const f=await setup(t);
  for(const signatureBase64 of ['A'.repeat(88),f.envelopes[1].signatureBase64,f.envelopes[0].signatureBase64+' ',Buffer.alloc(63).toString('base64')])assert.throws(()=>f.verify({envelopes:[{...f.envelopes[0],signatureBase64},...f.envelopes.slice(1)]}));
  const unknown=generateKeyPairSync('ed25519'),report={...f.envelopes[0].report,operator:new PublicKey(unknown.publicKey.export({format:'der',type:'spki'}).subarray(-32)).toBase58()};assert.throws(()=>f.verify({envelopes:[{report,signatureBase64:sign(null,observerReportMessage(report),unknown.privateKey).toString('base64')},...f.envelopes.slice(1)]}));
});
test('changed report bytes and foreign domain cannot replay an authenticated signature',async t=>{
  const f=await setup(t),original=f.envelopes[0];
  for(const change of [{evidenceHash:'e'.repeat(64)},{destinationFinalizedHeight:102},{observedAt:'2026-10-14T16:29:59.000Z'}])assert.throws(()=>f.verify({envelopes:[{...original,report:{...original.report,...change}},...f.envelopes.slice(1)]}));
  assert.throws(()=>observerReportMessage({...original.report,purpose:'authorize-retry'}));assert.throws(()=>observerReportMessage({...original.report,scope:'production'}));
  const signatureBase64=sign(null,Buffer.from(JSON.stringify(original.report)),f.actors[0].privateKey).toString('base64');assert.throws(()=>f.verify({envelopes:[{...original,signatureBase64},...f.envelopes.slice(1)]}));
});
test('otherwise valid signatures cannot change operation, accounting, code pins or roster',async t=>{
  const f=await setup(t);
  for(const change of [{transactionHash:'f'.repeat(64)},{programmePinsHash:'b'.repeat(64)},{accountingHash:'c'.repeat(64)},{nonce:'2'},{originAmount:'1000001'}])assert.throws(()=>f.verify({envelopes:[f.envelope(0,change),...f.envelopes.slice(1)]}));
  assert.throws(()=>f.verify({reviewRoster:{...f.roster,observers:[...f.roster.observers].reverse()}}));assert.throws(()=>f.verify({reviewRoster:{...f.roster,epoch:'2'}}));
});
test('stale/future signed reports and duplicate evidence cannot gain quorum',async t=>{
  const f=await setup(t);for(const change of [{observedAt:'2026-10-14T16:24:59.000Z'},{observedAt:'2026-10-14T16:30:01.000Z'},{evidenceHash:f.envelopes[1].report.evidenceHash}])assert.throws(()=>f.verify({envelopes:[f.envelope(0,change),...f.envelopes.slice(1)]}));
});
test('strict canonical schema excludes extra data, fractional units and unsafe contexts',async t=>{
  const f=await setup(t),report=f.envelopes[0].report;for(const change of [{secret:'do-not-propagate'},{originAmount:'1000000.0'},{destinationFinalizedSlot:Number.MAX_SAFE_INTEGER+1},{sourceReturnFinalized:'true'},{observedAt:'2026-10-14T16:30:00Z'}])assert.throws(()=>observerReportMessage({...report,...change}));
  assert.throws(()=>observerReportMessage({...report,sourceChain:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}));
});
test('authenticated expiry review keeps original journal and all recovery flags disabled',async t=>{
  const f=await setup(t),path=join(f.directory,f.r.id+'.json'),before=readFileSync(path),r=await f.review();assert.equal(r.keyAuthenticationVerified,true);assert.equal(r.observerAuthenticationVerified,true);assert.equal(r.operatorIdentityVerified,false);assert.equal(r.operatorIndependenceVerified,false);assert.equal(r.canRetry,false);assert.equal(r.canRefund,false);assert.equal(r.canResetAttempt,false);assert.equal(r.settlementAccepted,false);assert.equal(r.productionReady,false);assert(readFileSync(path).equals(before));await assert.rejects(takeSubmissionAttempt(f.directory,f.r.id,f.fetcher));
});
test('valid keys cannot bless late settlement, missing history or changed liability',async t=>{
  const f=await setup(t),path=join(f.directory,f.r.id+'.json'),before=readFileSync(path);
  for(const change of [{receipt:'present'},{signatureStatus:'finalized'},{historyCoverage:'pruned'}])await assert.rejects(f.review({envelopes:[f.envelope(0,change),...f.envelopes.slice(1)]}));
  await assert.rejects(f.review({accounting:{...f.accounting,pendingRedemptionUnits:'0'}}));assert(readFileSync(path).equals(before));
});
test('a later finalized journal cannot inherit an old authenticated expiry snapshot',async t=>{
  const f=await setup(t);f.mode('finalized');await reconcilePendingClaim(f.directory,f.r.id,f.fetcher);await assert.rejects(f.review());assert.equal(f.record(f.r.id).state,'FINALIZED');
});
test('extra envelope data cannot bypass strict schema through combined review',async t=>{
  const f=await setup(t),path=join(f.directory,f.r.id+'.json'),before=readFileSync(path);await assert.rejects(f.review({envelopes:[{...f.envelopes[0],canRetry:true},...f.envelopes.slice(1)]}),/Exact observer envelope/);assert(readFileSync(path).equals(before));
});
test('combined review snapshots selected roster, reports and accounting before await',async t=>{
  const f=await setup(t),pending=f.review();f.roster.observers.reverse();f.envelopes[0].report.receipt='present';f.accounting.pendingRedemptionUnits='0';const result=await pending;assert.equal(result.keyAuthenticationVerified,true);assert.equal(result.accounting.pendingRedemptionUnits,'1000000');assert.equal(result.observations[0].receipt,'absent');assert.equal(result.canRetry,false);
});


test('retained code policy cannot be replaced by caller hash even with otherwise valid signed reports',async t=>{
  for(const version of [2,3]){
    const f=await setup(t,version),path=join(f.directory,f.r.id+'.json'),before=readFileSync(path),wrong='b'.repeat(64);
    const envelopes=[0,1,2].map(i=>f.envelope(i,{programmePinsHash:wrong}));
    await assert.rejects(f.review({programmePinsHash:wrong,envelopes}),/Selected programme pins differ from retained journal/);
    assert(readFileSync(path).equals(before));
  }
});
test('matching retained code policy reviews version2 and metadata version3 without enabling recovery',async t=>{
  for(const version of [2,3]){
    const f=await setup(t,version),path=join(f.directory,f.r.id+'.json'),before=readFileSync(path),r=await f.review();
    assert.equal(r.programmePinsBoundToJournal,true);assert.equal(r.programmePinsHash,f.operation.programmePinsHash);assert.equal(r.operation.journalHash,f.operation.journalHash);
    if(version===3)assert.equal(r.operation.reviewedMintPolicySHA256,f.operation.reviewedMintPolicySHA256);
    for(const field of ['canRetry','canRefund','canResetAttempt','settlementAccepted','productionReady','operatorIndependenceVerified','programCodeAndCustodyVerified'])assert.equal(r[field],false);
    assert(readFileSync(path).equals(before));assert.equal(r.operation.state,'EXPIRED_UNRESOLVED');assert.equal(r.operation.attempts,1);
  }
});
test('legacy review labels supplied code hash as unbound instead of claiming retained pin verification',async t=>{
  const f=await setup(t),r=await f.review();assert.equal(r.programmePinsBoundToJournal,false);assert.equal(r.programmePinsHash,f.programmePinsHash);assert.equal(r.canRetry,false);assert.equal(r.productionReady,false);
});
