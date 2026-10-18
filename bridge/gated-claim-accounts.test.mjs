import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {destinationFixture} from './test-fixtures/gated-destination.mjs';
import {reviewGatedClaimDestinationAccounts as review,gatedClaimDestinationSelection} from './gated-claim-accounts.mjs';
import {describeGatedNativeMessage} from './gated-message-review.mjs';
const safety=r=>{for(const k of ['deployedCodeObserved','rpcObservationExecuted','independentVerification','sourceFinalityVerified','expiryVerified','canPrepareSubmission','canSign','canBroadcast','productionReady'])assert.equal(r[k],false,k);};
test('selected nine-account snapshot reconciles exact reserve/floor, bootstrap receipt, payer rent and daily capacity',()=>{
 const f=destinationFixture(),r=review(f.input());assert.equal(r.nativeAmount,'50000000');assert.equal(r.minimumReserveNativeUnits,'1900000000');assert.equal(r.minimumVaultRentNativeUnits,'1002240');assert.equal(r.claimRentNativeUnits,'1113600');assert.equal(r.remainingDailyOriginUnits,'3950000');assert.equal(r.incomingReceiptAbsent,true);safety(r);
});
test('u64 account balances stay exact and recipient overflow is rejected',()=>{
 const f=destinationFixture();f.rows[7].lamports=9007199254740993n;assert.equal(review(f.input()).payerNativeUnits,'9007199254740993');f.rows[8].lamports=(1n<<64n)-1n;assert.throws(()=>review(f.input()),/recipient capacity/);
});
test('unused recipient is supported as an absent default System account',()=>{const f=destinationFixture();f.rows[8]=null;safety(review(f.input()));});
test('an existing incoming receipt and missing or altered consumed bootstrap receipt refuse',()=>{
 for(const change of [f=>f.rows[4]=f.rows[3],f=>f.rows[3]=null,f=>f.rows[3].data[0]=Buffer.alloc(32,7).toString('base64')]){const f=destinationFixture();change(f);assert.throws(()=>review(f.input()));}
});
test('wrong owners, executable accounts and malformed or noncanonical account bytes refuse',()=>{
 for(const change of [f=>f.rows[1].owner=f.pins.remoteProgram,f=>f.rows[2].executable=true,f=>f.rows[3].data[0]+=' ',f=>f.rows[5].data[1]='json',f=>f.rows[8].data[0]='AA==',f=>f.rows[7]=null]){const f=destinationFixture();change(f);assert.throws(()=>review(f.input()));}
});
test('changed current configuration and bootstrap bytes cannot inherit selected declarations',()=>{
 for(const index of [0,2]){const f=destinationFixture(),b=Buffer.from(f.rows[index].data[0],'base64');b[b.length-1]^=1;f.rows[index].data[0]=b.toString('base64');assert.throws(()=>review(f.input()),/differs from selected/);}
});
test('one-unit reserve underfunding and payer fee/rent shortfall refuse',()=>{
 const f=destinationFixture();f.rows[1].lamports=1899999999n;assert.throws(()=>review(f.input()),/insufficient/);
 const g=destinationFixture();g.rows[7].lamports=1133599n;assert.throws(()=>review(g.input()),/insufficient/);g.rows[7].lamports=1133600n;review(g.input());
});
test('vault marker, protected floor and actual rent policy must match',()=>{
 for(const change of [f=>{const b=Buffer.from(f.rows[1].data[0],'base64');b[0]=0;f.rows[1].data[0]=b.toString('base64');},f=>f.vault.writeBigUInt64LE(1999999n,8),f=>f.rent.writeBigUInt64LE(3481n),f=>f.rent.writeBigUInt64LE(1n<<54n),f=>f.rent.writeDoubleLE(2.1,8),f=>f.rent.writeDoubleLE(NaN,8),f=>f.rent[16]=101]){
  const f=destinationFixture();change(f);f.rows[1].data[0]=f.rows[1].data[0].startsWith('U0NWT')?f.vault.toString('base64'):f.rows[1].data[0];f.rows[5].data[0]=f.rent.toString('base64');assert.throws(()=>review(f.input()));
 }
});
test('self-consistent selected large rent is refused outside the supported exact arithmetic range',()=>{
 const f=destinationFixture(),p=f.intent.parameters,c=Buffer.from(p.context.configurationBytes),b=Buffer.from(p.bootstrap.recordBytes),rate=1n<<46n,min=144n*rate*2n,floor=min+1000000n,locked=floor+100000000n,supply=locked+200000000n,max=(1n<<64n)-1n;
 c[328]=9;c.writeBigUInt64LE(max,342);c.writeBigUInt64LE(max,350);c.writeBigUInt64LE(locked,374);p.context.configurationBytes=c;p.context.pins.policySHA256=createHash('sha256').update(c.subarray(0,358)).digest('hex');
 for(const [offset,value] of [[40,supply],[48,supply],[56,100000000n],[64,supply-100000000n],[104,locked],[112,floor]])b.writeBigUInt64LE(value,offset);
 p.bootstrap.recordBytes=b;p.bootstrap.expectedRecordSHA256=createHash('sha256').update(b).digest('hex');p.bootstrap.minimumRentNativeUnits=min;
 f.rows[0].data[0]=c.toString('base64');f.rows[2].data[0]=b.toString('base64');f.vault.writeBigUInt64LE(floor,8);f.rows[1].data[0]=f.vault.toString('base64');f.rows[1].lamports=supply-100000000n;f.rent.writeBigUInt64LE(rate);f.rows[5].data[0]=f.rent.toString('base64');f.rows[7].lamports=max;
 const i=f.input();i.expectedReviewSHA256=describeGatedNativeMessage(f.intent).reviewSHA256;assert(min>BigInt(Number.MAX_SAFE_INTEGER)&&min<max);assert.throws(()=>review(i),/Vault floor or declared rent/);
});
function dynamic(f,day,used,timestamp){const b=Buffer.from(f.intent.parameters.context.configurationBytes);b.writeBigUInt64LE(day,358);b.writeBigUInt64LE(used,366);f.intent.parameters.context.configurationBytes=b;f.rows[0].data[0]=b.toString('base64');f.expectedReviewSHA256=describeGatedNativeMessage(f.intent).reviewSHA256;f.clock.writeBigInt64LE(timestamp,32);f.rows[6].data[0]=f.clock.toString('base64');const i=f.input();i.expectedReviewSHA256=f.expectedReviewSHA256;return i;}
test('same-day daily budget, day rollover, negative clock and backwards day follow the programme rules',()=>{
 const f=destinationFixture();assert.throws(()=>review(dynamic(f,1n,3950001n,86400n)),/daily/);
 const g=destinationFixture();assert.equal(review(dynamic(g,0n,4000000n,86400n)).remainingDailyOriginUnits,'3950000');
 for(const [day,time] of [[2n,86400n],[0n,-1n]]){const h=destinationFixture();assert.throws(()=>review(dynamic(h,day,0n,time)));}
});
test('clock slot must lie within finalized snapshot/checkpoint and snapshot must be current',()=>{
 for(const v of [49n,101n]){const f=destinationFixture();f.clock.writeBigUInt64LE(v);f.rows[6].data[0]=f.clock.toString('base64');assert.throws(()=>review(f.input()),/clock/);}
 const f=destinationFixture();const i=f.input();i.minimumContextSlot=101;assert.throws(()=>review(i),/checkpoint/);
});
test('native balance strings, fractions, exponent notation, negatives and overflow refuse instead of rounding',()=>{
 for(const v of ['"10000000"','10000000.0','1e7','-1','18446744073709551616']){const f=destinationFixture(),i=f.input();i.raw=i.raw.replace('"lamports":10000000','"lamports":'+v);assert.throws(()=>review(i));}
});
test('exact schemas, selections, response bounds, account count and canonical fee/checkpoint types are mandatory',()=>{
 for(const change of [i=>i.extra=true,i=>i.expectedReviewSHA256='0'.repeat(64),i=>i.feeNativeUnits=20000,i=>i.feeNativeUnits=-1n,i=>i.minimumContextSlot=0,i=>i.raw=' '.repeat(32769),i=>{const x=JSON.parse(i.raw);x.result.value.pop();i.raw=JSON.stringify(x);},i=>i.intent.kind='pause']){const f=destinationFixture(),i=f.input();change(i);assert.throws(()=>review(i));}
 const f=destinationFixture();assert.equal(gatedClaimDestinationSelection({intent:f.intent,expectedReviewSHA256:f.expectedReviewSHA256}).addresses.length,9);
});
