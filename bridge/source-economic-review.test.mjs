import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {reviewSelectedSourceTransaction as review} from './source-economic-review.mjs';
import {sourceEconomicFixture as fixture} from './test-fixtures/source-economic.mjs';
const noPromotion=['rpcObservationExecuted','chainInclusionVerified','completeSourceEventInventoryVerified','transactionMetadataIndependentlyVerified','historicalCodeVerified','historicalCountersVerified','feeScheduleIndependentlyVerified','finalizedCommitmentIndependentlyVerified','sourceEconomicMovementsIndependentlyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'];
test('signed origin lock and native return bind the current event, exact transfers, fees, rent and inner instructions',()=>{
 for(const side of [0,1]){const f=fixture(side),before=JSON.stringify(f.options()),r=review(f.options());assert.equal(r.side,side);assert.equal(r.originAmount,'10000');assert.equal(r.nativeAmount,'10000000');assert.equal(r.feeNativeUnits,'10000');assert.equal(r.eventRentNativeUnits,'2958000');assert(r.selectedTransactionSignaturesVerified&&r.selectedEconomicMetadataMatched&&r.selectedInnerTransfersMatched);for(const k of noPromotion)assert.equal(r[k],false);assert.equal(JSON.stringify(f.options()),before);}
});
test('sender may also pay the fee with rent and transferred value separately reconciled',()=>{for(const side of [0,1])assert(review(fixture(side,true).options()).selectedEconomicMetadataMatched);});
test('a one-unit change above Number precision cannot disappear from exact native metadata',()=>{const f=fixture(1);f.payload.result.meta.postBalances[f.index(f.accounts[2])]--;assert.throws(()=>review(f.options()));});
test('noncanonical raw native balances and fee numbers refuse before rounded arithmetic',()=>{
 for(const field of ['balance','fee'])for(const value of ['"9007199254740993"','-1','1.5','1e3','-0','18446744073709551616']){const f=fixture();const o=f.options();o.raw=field==='fee'?o.raw.replace('"fee":10000','"fee":'+value):o.raw.replace('9007199254740993',value);assert.throws(()=>review(o));}
});
test('changed, missing, malformed or mismatched transaction signatures refuse',()=>{
 for(const mode of ['changed','missing','selected','extra']){const f=fixture(),t=f.payload.result.transaction;if(mode==='changed')t.signatures[0]=(t.signatures[0][0]==='2'?'3':'2')+t.signatures[0].slice(1);if(mode==='missing')t.signatures.pop();if(mode==='extra')t.signatures.push(t.signatures[0]);const o=f.options();if(mode==='selected')o.signature=t.signatures[1];assert.throws(()=>review(o));}
});
test('validly re-signed wrong opcode, amount, nonce or recipient cannot match a different event',()=>{
 for(const mode of ['opcode','amount','nonce','recipient']){const f=fixture(),ix=f.payload.result.transaction.message.instructions[0],d=f.decode(ix.data);if(mode==='opcode')d[0]=2;if(mode==='amount')d.writeBigUInt64LE(9999n,1);if(mode==='nonce')d.writeBigUInt64LE(12n,9);if(mode==='recipient')d[17]^=1;ix.data=f.encode(d);f.resign();assert.throws(()=>review(f.options()));}
});
test('another slot, unavailable transaction, failed metadata or wrong envelope cannot be accepted',()=>{
 for(const mode of ['slot','null','meta','error','id','protocol','failed','status']){const f=fixture(),p=f.payload;if(mode==='slot')p.result.slot++;if(mode==='null')p.result=null;if(mode==='meta')p.result.meta=null;if(mode==='error')p.error={code:-1};if(mode==='id')p.id=2;if(mode==='protocol')p.jsonrpc='1.0';if(mode==='failed')p.result.meta.err={InstructionError:[0,'Custom']};if(mode==='status')p.result.meta.status={Err:'Custom'};assert.throws(()=>review(f.options()));}
});
test('versioned messages, address lookups and additional instructions refuse the narrow legacy profile',()=>{
 for(const mode of ['version','lookup','loaded','extra']){const f=fixture(),r=f.payload.result;if(mode==='version')r.version=0;if(mode==='lookup')r.transaction.message.addressTableLookups=[{}];if(mode==='loaded')r.meta.loadedAddresses.writable=[f.event.sender];if(mode==='extra')r.transaction.message.instructions.push(r.transaction.message.instructions[0]);assert.throws(()=>review(f.options()));}
});
test('changed roles, duplicate accounts, non-signing sender and readonly sender refuse',()=>{
 for(const mode of ['roles','duplicate','signer','readonly']){const f=fixture(),m=f.payload.result.transaction.message;if(mode==='roles')[m.instructions[0].accounts[1],m.instructions[0].accounts[2]]=[m.instructions[0].accounts[2],m.instructions[0].accounts[1]];if(mode==='duplicate')m.accountKeys[2]=m.accountKeys[3];if(mode==='signer')m.header.numRequiredSignatures=1;if(mode==='readonly')m.header.numReadonlySignedAccounts=1;assert.throws(()=>review(f.options()));}
});
test('depleted or extra native transfers, wrong rent, payer fee and unexplained account movements refuse',()=>{
 for(const side of [0,1])for(const mode of ['sender','rent','payer','other']){const f=fixture(side),m=f.payload.result.meta;const i=mode==='sender'?f.index(f.event.sender):mode==='rent'?f.index(f.event.sourceEvent):mode==='payer'?0:f.index(f.accounts[1]);m.postBalances[i]--;assert.throws(()=>review(f.options()));}
});
test('missing, altered or additional inner transfer/account-creation instructions refuse',()=>{
 for(const side of [0,1])for(const mode of ['missing','extra','index','program','amount','owner','space','stack','funding','oldCreate']){const f=fixture(side),group=f.payload.result.meta.innerInstructions[0];if(mode==='missing')group.instructions.pop();if(mode==='extra')group.instructions.push(group.instructions[0]);if(mode==='index')group.index=1;if(mode==='program')group.instructions[3].programIdIndex=group.instructions[0].accounts[0];if(mode==='amount'){const ix=group.instructions[3],d=f.decode(ix.data);d[side===0?1:4]^=1;ix.data=f.encode(d);}if(mode==='owner'||mode==='space'){const ix=group.instructions[mode==='owner'?2:1],d=f.decode(ix.data);d[4]^=1;ix.data=f.encode(d);}if(mode==='stack')group.instructions[3].stackHeight=1;if(mode==='funding'){const ix=group.instructions[0],d=f.decode(ix.data);d[4]^=1;ix.data=f.encode(d);}if(mode==='oldCreate'){const d=Buffer.alloc(52);d.writeBigUInt64LE(2958000n,4);d.writeBigUInt64LE(297n,12);new PublicKey(f.event.sourceProgram).toBuffer().copy(d,20);group.instructions.splice(0,3,{...group.instructions[0],data:f.encode(d)});}assert.throws(()=>review(f.options()));}
});
test('token debit, escrow credit, owner, mint, programme and raw precision cannot be substituted',()=>{
 for(const mode of ['debit','credit','owner','mint','program','decimals','duplicate','unknown','overflow','leading']){const f=fixture(),meta=f.payload.result.meta,row=meta.postTokenBalances[0];if(mode==='debit')row.uiTokenAmount.amount='990001';if(mode==='credit')meta.postTokenBalances[1].uiTokenAmount.amount='9999';if(mode==='owner')row.owner=f.accounts[2];if(mode==='mint')row.mint=f.accounts[1];if(mode==='program')row.programId=f.event.sourceProgram;if(mode==='decimals')row.uiTokenAmount.decimals=9;if(mode==='duplicate')meta.postTokenBalances[1].accountIndex=row.accountIndex;if(mode==='unknown')row.accountIndex=0;if(mode==='overflow')row.uiTokenAmount.amount='18446744073709551616';if(mode==='leading')row.uiTokenAmount.amount='0990000';assert.throws(()=>review(f.options()));}
});
test('native returns cannot carry token movements or missing recorded metadata',()=>{for(const mode of ['token','absent','inner','logs']){const f=fixture(1),m=f.payload.result.meta;if(mode==='token')m.preTokenBalances=[{}];if(mode==='absent')delete m.preTokenBalances;if(mode==='inner')m.innerInstructions=null;if(mode==='logs')m.logMessages=null;assert.throws(()=>review(f.options()));}});
test('missing or duplicated source event log, wrong source state or mismatched selected policy refuses',()=>{
 for(const mode of ['log','duplicateLog','success','event','owner','context','policy','public']){const f=fixture(),o=f.options();if(mode==='log')f.payload.result.meta.logMessages.splice(1,1);if(mode==='duplicateLog')f.payload.result.meta.logMessages.push(f.payload.result.meta.logMessages[1]);if(mode==='success')f.payload.result.meta.logMessages.pop();if(mode==='event')o.sourceEvent=f.accounts[2];if(mode==='owner')f.snapshot.accounts[2].owner=f.accounts[2];if(mode==='context')f.snapshot.contextSlot=49;if(mode==='policy')o.pins={...o.pins,policySHA256:'0'.repeat(64)};if(mode==='public')o.pins={...o.pins,genesis:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'};if(['log','duplicateLog','success'].includes(mode))o.raw=f.options().raw;assert.throws(()=>review(o));}
});
test('size and schema bounds refuse oversized or unknown inputs',()=>{
 const f=fixture();for(const o of [{...f.options(),raw:' '.repeat(65537)},{...f.options(),extra:true},{...f.options(),signature:123},{...f.options(),raw:f.options().raw.replace('"jsonrpc":"2.0"','"extra":1,"jsonrpc":"2.0"')}])assert.throws(()=>review(o));
});
