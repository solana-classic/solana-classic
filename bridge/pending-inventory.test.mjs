import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {pinnedFixture} from './test-fixtures/pinned.mjs';
import {fixture} from './test-fixtures/pending.mjs';
import {reviewedFixture} from './test-fixtures/reviewed-pending.mjs';
import {nativeClaimInstruction,originClaimInstruction,originalTokenAddress} from './sdk.mjs';
import {preparePinnedPendingClaim,prepareReviewedPendingClaim,preparePendingClaim,inspectPendingClaim,takePinnedSubmissionAttempt} from './pending-claim.mjs';
import {reviewPendingInventory} from './pending-inventory.mjs';

async function selectedFixture(t,{directions=[0,1],amounts=[1000000n,200000n]}={}){
 const f=await pinnedFixture(t,0),origin=f.sides.source.pins,native=f.sides.destination.pins,rows=[];
 for(let index=0;index<directions.length;index++){
  const direction=directions[index],e={...f.e,direction,nonce:BigInt(index+1),originAmount:amounts[index],recipient:index===0?f.e.recipient:Keypair.generate().publicKey.toBase58()};
  if(direction===1){[e.sourceChain,e.destinationChain]=[e.destinationChain,e.sourceChain];[e.sourceProgram,e.destinationProgram]=[e.destinationProgram,e.sourceProgram];}
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(e.bridge).toBuffer()],new PublicKey(e.sourceProgram))[0],nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(e.nonce);
  e.sourceEvent=PublicKey.findProgramAddressSync([Buffer.from('event'),config.toBuffer(),new PublicKey(e.sender).toBuffer(),nonce],new PublicKey(e.sourceProgram))[0].toBase58();
  const mint=new PublicKey(origin.originMint),destinationToken=direction===1?originalTokenAddress(mint,e.recipient):null;
  const args={...f.args,event:e,expected:e,originMint:mint,destinationToken,programmePins:direction===0?f.args.programmePins:{source:native,destination:origin}};
  const ix=direction===0?nativeClaimInstruction({event:e,expected:e,payer:f.payer.publicKey,committee:f.committee.map(k=>k.publicKey)}):originClaimInstruction({event:e,expected:e,payer:f.payer.publicKey,committee:f.committee.map(k=>k.publicKey),mint,destinationToken});
  const tx=new Transaction({feePayer:f.payer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(ix);tx.sign(f.payer,...f.committee);args.transaction=tx.serialize();
  const record=preparePinnedPendingClaim(args);rows.push(await inspectPendingClaim(f.directory,record.id));
 }
 const pending=amounts.reduce((a,b)=>a+b,0n),nativePending=amounts.reduce((a,b,i)=>a+(directions[i]===0?b:0n),0n);
 const expectedDomain={bridge:f.e.bridge,originChain:origin.genesis,nativeChain:native.genesis,originProgram:origin.program,nativeProgram:native.program,originMint:origin.originMint,epoch:f.e.epoch.toString(),originDecimals:6};
 const accounting={originEscrowUnits:(pending+800000n).toString(),originOutstandingUnits:(pending+800000n).toString(),nativeOutstandingUnits:'800000',reserveNativeUnits:(nativePending*1000n+1000000n).toString(),protectedFloorNativeUnits:'1000000'};
 return {...f,rows,options:{directory:f.directory,selection:rows.map(({id,journalHash})=>({id,journalHash})),expectedDomain,accounting}};
}
const journalBytes=f=>Object.fromEntries(f.rows.map(row=>[row.id,readFileSync(join(f.directory,row.id+'.json'))]));
function unchanged(f,before){for(const row of f.rows)assert(readFileSync(join(f.directory,row.id+'.json')).equals(before[row.id]));assert(readdirSync(f.directory).every(name=>!name.endsWith('.lock')));}

test('both selected directions retain exact pending obligations without RPC or recovery permission',async t=>{
 const f=await selectedFixture(t),before=journalBytes(f);t.mock.method(globalThis,'fetch',()=>{throw Error('No network allowed');});
 const result=await reviewPendingInventory(f.options);
 assert.equal(result.pending.nativeClaimOriginUnits,'1000000');assert.equal(result.pending.originalRedemptionOriginUnits,'200000');assert.equal(result.pending.totalOriginUnits,'1200000');assert.equal(result.pending.nativePayoutUnits,'1000000000');assert.equal(result.selectedJournals,2);assert.equal(result.selectedAccountingEquationMatched,true);
 for(const flag of ['completeSourceEventInventoryVerified','simultaneousSnapshotVerified','sameLedgerHistoryVerified','freshChainStateVerified','finalizedJournalLabelsIndependentlyVerified','codeAndCustodyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'])assert.equal(result[flag],false);
 for(const field of ['directory','transactionBase64','transactionHash','signature','rpc','sourceRpc'])assert(!JSON.stringify(result).includes('"'+field+'"'));
 unchanged(f,before);
});
test('selection ordering is canonical and caller-supplied fields cannot propagate',async t=>{
 const f=await selectedFixture(t),a=await reviewPendingInventory(f.options),b=await reviewPendingInventory({...f.options,selection:[...f.options.selection].reverse(),canRetry:true,privateKey:'not-propagated'});
 assert.deepEqual(a,b);assert(!JSON.stringify(b).includes('not-propagated'));assert.equal(a.selectionSHA256,b.selectionSHA256);
});
test('duplicate, missing, unselected or changed records refuse rather than reducing liability',async t=>{
 const f=await selectedFixture(t),before=journalBytes(f),selected=f.options.selection;
 for(const selection of [[selected[0],selected[0]],selected.slice(0,1),[{id:Keypair.generate().publicKey.toBase58(),journalHash:'1'.repeat(64)}],[{...selected[0],journalHash:'0'.repeat(64)},selected[1]]])await assert.rejects(reviewPendingInventory({...f.options,selection}));
 unchanged(f,before);
});
test('public chains, wrong signed domain, mint, epoch or precision refuse',async t=>{
 const f=await selectedFixture(t);
 for(const [field,value] of [['bridge',Keypair.generate().publicKey.toBase58()],['originChain',Keypair.generate().publicKey.toBase58()],['nativeChain',f.options.expectedDomain.originChain],['originChain','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'],['nativeChain','7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'],['originProgram',Keypair.generate().publicKey.toBase58()],['nativeProgram',Keypair.generate().publicKey.toBase58()],['originMint',Keypair.generate().publicKey.toBase58()],['epoch','2'],['originDecimals',7]])await assert.rejects(reviewPendingInventory({...f.options,expectedDomain:{...f.options.expectedDomain,[field]:value}}));
});
test('expired, failed, consumed and submitted labels never erase selected unresolved liability',async t=>{
 const f=await selectedFixture(t,{directions:[0],amounts:[1000000n]}),row=f.rows[0],path=join(f.directory,row.id+'.json'),prepared=readFileSync(path);
 await takePinnedSubmissionAttempt(f.directory,row.id,f.fetcher);const attempted=JSON.parse(readFileSync(path));
 for(const state of ['PREPARED','SUBMISSION_ATTEMPTED','PENDING','EXPIRED_UNRESOLVED','CONSUMED_REVIEW_REQUIRED','FAILED_REVIEW_REQUIRED']){
  const record=state==='PREPARED'?JSON.parse(prepared):{...attempted,state};writeFileSync(path,JSON.stringify(record));
  const chosen=await inspectPendingClaim(f.directory,row.id),result=await reviewPendingInventory({...f.options,selection:[{id:row.id,journalHash:chosen.journalHash}]});
  assert.equal(result.pending.totalOriginUnits,'1000000');assert.equal(result.records[0].includedAsPending,true);assert.equal(result.stateCounts[state],1);assert.equal(result.canRetry,false);
 }
});
test('a locally finalized label is separated but never treated as independent settlement proof',async t=>{
 const f=await selectedFixture(t,{directions:[0],amounts:[1000000n]}),row=f.rows[0],path=join(f.directory,row.id+'.json');
 await takePinnedSubmissionAttempt(f.directory,row.id,f.fetcher);const record=JSON.parse(readFileSync(path));record.state='FINALIZED';writeFileSync(path,JSON.stringify(record));
 const chosen=await inspectPendingClaim(f.directory,row.id),accounting={...f.options.accounting,originEscrowUnits:'800000',originOutstandingUnits:'800000'};
 const result=await reviewPendingInventory({...f.options,selection:[{id:row.id,journalHash:chosen.journalHash}],accounting});
 assert.equal(result.pending.totalOriginUnits,'0');assert.equal(result.records[0].includedAsPending,false);assert.equal(result.stateCounts.FINALIZED,1);assert.equal(result.finalizedJournalLabelsIndependentlyVerified,false);assert.equal(result.backingVerified,false);
});
test('counter reset, omitted-direction liability and insufficient payout reserve refuse',async t=>{
 const f=await selectedFixture(t),before=journalBytes(f);
 for(const change of [{originEscrowUnits:'1999999'},{originOutstandingUnits:'800000',originEscrowUnits:'800000'},{nativeOutstandingUnits:'1000000'},{reserveNativeUnits:'1000999999'},{protectedFloorNativeUnits:'1000001'}])await assert.rejects(reviewPendingInventory({...f.options,accounting:{...f.options.accounting,...change}}));
 unchanged(f,before);
});
test('accounting is lossless above Number precision and sum overflow refuses',async t=>{
 const amount=9007199254741n,f=await selectedFixture(t,{directions:[0,1],amounts:[amount,amount]});
 const result=await reviewPendingInventory(f.options);assert.equal(result.pending.totalOriginUnits,(amount*2n).toString());assert.equal(result.pending.nativePayoutUnits,(amount*1000n).toString());
 for(const value of [false,1,'01','1.0','18446744073709551616'])await assert.rejects(reviewPendingInventory({...f.options,accounting:{...f.options.accounting,originEscrowUnits:value}}));
 const overflow=await selectedFixture(t,{directions:[0,0],amounts:[10000000000000000n,10000000000000000n]});
 await assert.rejects(reviewPendingInventory({...overflow.options,accounting:{originEscrowUnits:'20000000000800000',originOutstandingUnits:'20000000000800000',nativeOutstandingUnits:'800000',reserveNativeUnits:'18446744073709551615',protectedFloorNativeUnits:'0'}}),/exceeds u64/);
});
test('legacy unpinned records cannot acquire inventory admission by copying selected hashes',async t=>{
 const f=fixture(t,1),record=preparePendingClaim(f.args),chosen=await inspectPendingClaim(f.directory,record.id);
 const other=await selectedFixture(t);await assert.rejects(reviewPendingInventory({...other.options,directory:f.directory,selection:[{id:record.id,journalHash:chosen.journalHash}]}),/domain or enforced pins/);
});
test('selection is snapshotted before asynchronous inspection and concurrent changes refuse',async t=>{
 const f=await selectedFixture(t),before=journalBytes(f),promise=reviewPendingInventory(f.options);
 f.options.selection[0].journalHash='0'.repeat(64);f.options.expectedDomain.epoch='99';f.options.accounting.nativeOutstandingUnits='0';
 const result=await promise;assert.equal(result.domain.epoch,'1');assert.equal(result.accounting.nativeOutstandingUnits,'800000');unchanged(f,before);
 const g=await selectedFixture(t),pending=reviewPendingInventory(g.options),path=join(g.directory,g.rows[0].id+'.json'),record=JSON.parse(readFileSync(path));record.preparedAt='changed-during-inspection';writeFileSync(path,JSON.stringify(record));
 await assert.rejects(pending,/changed/);
});
test('exact selection/domain/accounting schemas and bounded inventories refuse before inspection',async t=>{
 const f=await selectedFixture(t);
 for(const change of [{selection:[{id:'1'.repeat(1000),journalHash:'1'.repeat(64)}]},{selection:[]},{selection:Array(257).fill(f.options.selection[0])},{selection:[{...f.options.selection[0],canRetry:true}]},{expectedDomain:{...f.options.expectedDomain,extra:true}},{accounting:{...f.options.accounting,pendingRedemptionUnits:'200000'}}])await assert.rejects(reviewPendingInventory({...f.options,...change}));
});

test('explicit version3 metadata journals keep their selected policy and unresolved amount',async t=>{
 const f=await reviewedFixture(t,1),prepared=prepareReviewedPendingClaim(f.args),chosen=await inspectPendingClaim(f.directory,prepared.id),before=readFileSync(f.path(prepared.id)),origin=f.sides.destination.pins,native=f.sides.source.pins;
 const result=await reviewPendingInventory({directory:f.directory,selection:[{id:chosen.id,journalHash:chosen.journalHash}],expectedDomain:{bridge:f.e.bridge,originChain:origin.genesis,nativeChain:native.genesis,originProgram:origin.program,nativeProgram:native.program,originMint:origin.originMint,epoch:'1',originDecimals:6},accounting:{originEscrowUnits:'2000000',originOutstandingUnits:'2000000',nativeOutstandingUnits:'1000000',reserveNativeUnits:'1000000',protectedFloorNativeUnits:'1000000'}});
 assert.equal(result.pending.originalRedemptionOriginUnits,'1000000');assert.equal(result.pending.nativePayoutUnits,'0');assert.equal(result.freshChainStateVerified,false);assert(readFileSync(f.path(prepared.id)).equals(before));
});
test('coordinated omission cannot prove global completeness even when selected arithmetic matches',async t=>{
 const f=await selectedFixture(t),selection=[f.options.selection[0]],accounting={...f.options.accounting,originEscrowUnits:'1800000',originOutstandingUnits:'1800000'};
 const result=await reviewPendingInventory({...f.options,selection,accounting});assert.equal(result.selectedJournals,1);assert.equal(result.selectedAccountingEquationMatched,true);assert.equal(result.completeSourceEventInventoryVerified,false);assert.equal(result.backingVerified,false);assert.equal(result.settlementAccepted,false);
});
