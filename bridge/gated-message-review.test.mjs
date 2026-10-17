import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {preparePendingClaim} from './pending-claim.mjs';
import {fixture as oldFixture} from './test-fixtures/pending.mjs';
import {Keypair,PublicKey,Transaction,TransactionInstruction,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {GATED_NATIVE_CONTRACT,gatedNativeClaimInstruction,gatedNativeReturnInstruction,gatedNativePauseInstruction} from './gated-native.mjs';
import {nativeClaimInstruction} from './sdk.mjs';
import {describeGatedNativeMessage as describe,reviewGatedNativeSignedTransaction as review} from './gated-message-review.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),pk=v=>new PublicKey(v),key=i=>new PublicKey(Buffer.alloc(32,i)).toBase58();
const le=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
const pda=(p,seeds)=>PublicKey.findProgramAddressSync(seeds,pk(p))[0];
function fixture(kind='claim',flags=[false,false]){
 const keys=Array.from({length:7},()=>Keypair.generate()),[payer,...members]=keys,committee=members.slice(0,5).map(k=>k.publicKey.toBase58()),recipient=keys[6].publicKey.toBase58();
 const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,i] of [[8,1],[40,3],[72,2],[104,4],[136,40]])pk(key(i)).toBuffer().copy(config,o);
 committee.forEach((v,i)=>pk(v).toBuffer().copy(config,168+32*i));config.set([6,9,1,3],328);config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2_000_000n,342);config.writeBigUInt64LE(4_000_000n,350);config.writeBigUInt64LE(102_000n,374);
 const pins={genesis:key(3),remoteGenesis:key(2),program:key(5),remoteProgram:key(4),bridge:key(1),originMint:key(40),side:1,upgradeAuthority:key(8),elfSHA256:GATED_NATIVE_CONTRACT.elfSHA256,elfBytes:GATED_NATIVE_CONTRACT.elfBytes,programDataSHA256:'a'.repeat(64),policySHA256:hash(config.subarray(0,358))};
 const sourceConfig=pda(pins.remoteProgram,[Buffer.from('config'),pk(pins.bridge).toBuffer()]);
 const sourceEvent=n=>pda(pins.remoteProgram,[Buffer.from('event'),sourceConfig.toBuffer(),pk(recipient).toBuffer(),le(n)]).toBase58();
 const record=Buffer.concat([Buffer.from('SCBST001'),Buffer.alloc(32,42),le(2_000_000n),le(2_000_000_000n),le(100_000_000n),le(1_900_000_000n),pk(sourceEvent(1n)).toBuffer(),le(102_000n),le(2_000_000n)]);
 const context={abi:GATED_NATIVE_CONTRACT.abi,pins,configurationBytes:config},bootstrap={recordBytes:record,expectedRecordSHA256:hash(record),expectedSourceEvent:sourceEvent(1n),minimumRentNativeUnits:1_002_240n};
 const event={bridge:pins.bridge,sourceChain:pins.remoteGenesis,destinationChain:pins.genesis,sourceProgram:pins.remoteProgram,destinationProgram:pins.program,sender:recipient,recipient,originAmount:50_000n,nonce:2n,slot:20n,epoch:1n,direction:0,sourceEvent:sourceEvent(2n)};
 let parameters,signers;
 if(kind==='claim'){parameters={context,bootstrap,event,payer:payer.publicKey.toBase58(),committee:committee.slice(0,3),recipient};signers=[payer,...members.slice(0,3)];}
 if(kind==='return'){parameters={context,bootstrap,sender:payer.publicKey.toBase58(),recipient,originAmount:25_000n,nonce:7n};signers=[payer];}
 if(kind==='pause'){parameters={context,bootstrap:flags.every(Boolean)?null:bootstrap,committee:committee.slice(0,3),newLocksPaused:flags[0],settlementPaused:flags[1]};signers=[payer,...members.slice(0,3)];}
 return {intent:{kind,parameters,payer:payer.publicKey.toBase58(),recentBlockhash:key(80),lastValidBlockHeight:500},signers};
}
const builder=i=>({claim:gatedNativeClaimInstruction,return:gatedNativeReturnInstruction,pause:gatedNativePauseInstruction})[i.kind](i.parameters).instruction;
function transaction(f,modify=()=>{}){const tx=new Transaction({feePayer:pk(f.intent.payer),recentBlockhash:f.intent.recentBlockhash}).add(builder(f.intent));modify(tx);tx.sign(...f.signers);return tx;}
const signed=f=>transaction(f).serialize(),checked=(f,raw=signed(f),anchor=describe(f.intent).reviewSHA256)=>review({intent:f.intent,transactionBytes:raw,expectedReviewSHA256:anchor});
const safety=r=>{for(const k of ['chainStateVerified','sourceFinalityVerified','expiryVerified','canPrepareJournal','canSign','canBroadcast','productionReady'])assert.equal(r[k],false,k);};
test('claim signed by exact payer and quorum matches the externally selected full review digest',()=>{
 const f=fixture(),d=describe(f.intent),raw=signed(f),r=checked(f,raw,d.reviewSHA256);assert.equal(r.state,'OFFLINE_GATED_SIGNATURES_VERIFIED');assert.equal(r.signaturesVerified,true);assert.equal(r.messageMatches,true);assert.equal(r.transactionSHA256,hash(raw));assert.equal(r.journalVersionSelected,null);assert.equal(r.signedBytes,raw.length);assert.equal(r.requiredSigners.length,4);assert.equal(r.messageSHA256,hash(transaction(f).serializeMessage()));safety(d);safety(r);
});
test('return remains a one-signer exact message with separate expiry selection',()=>{const f=fixture('return'),r=checked(f);assert.equal(r.requiredSigners.length,1);assert.equal(r.lastValidBlockHeight,500);safety(r);});
test('all three opening pause combinations verify and full pause has no bootstrap selection',()=>{
 for(const flags of [[false,false],[false,true],[true,false],[true,true]]){const f=fixture('pause',flags),r=checked(f);assert.equal(r.requiredSigners.length,4);assert.equal(r.bootstrapRecordSHA256===null,flags.every(Boolean));safety(r);}
});
test('compiled duplicate vault privileges are matched by canonical message bytes, preserving its read-only trailer declaration',()=>{
 const f=fixture(),ix=builder(f.intent),tx=Transaction.from(signed(f));assert.equal(ix.keys[9].isWritable,false);assert.equal(ix.keys[2].isWritable,true);assert.equal(tx.instructions[0].keys[9].isWritable,true);assert.equal(checked(f).messageMatches,true);
});
test('missing, malformed or wrong external digest refuses before signature acceptance',()=>{const f=fixture(),raw=signed(f);for(const a of [undefined,null,'','A'.repeat(64),'0'.repeat(64)])assert.throws(()=>review({intent:f.intent,transactionBytes:raw,expectedReviewSHA256:a}));});
test('full code/policy pins and account snapshots are bound even when instruction bytes stay identical',()=>{
 for(const mutate of [p=>p.context.pins.programDataSHA256='b'.repeat(64),p=>p.context.pins.upgradeAuthority=null,p=>p.context.configurationBytes.writeBigUInt64LE(103_000n,374),p=>p.bootstrap.minimumRentNativeUnits=1_002_241n]){const f=fixture(),d=describe(f.intent),raw=signed(f);mutate(f.intent.parameters);assert.equal(describe(f.intent).messageSHA256,d.messageSHA256);assert.notEqual(describe(f.intent).reviewSHA256,d.reviewSHA256);assert.throws(()=>checked(f,raw,d.reviewSHA256));}
});
test('record selection remains externally bound when a self-consistent replacement has the same trailer addresses',()=>{
 const f=fixture(),d=describe(f.intent),raw=signed(f),b=f.intent.parameters.bootstrap;b.recordBytes[8]^=1;b.expectedRecordSHA256=hash(b.recordBytes);assert.equal(describe(f.intent).messageSHA256,d.messageSHA256);assert.throws(()=>checked(f,raw,d.reviewSHA256));
});
test('blockhash and expiry changes invalidate the review including a height-only change',()=>{
 for(const mutate of [i=>i.recentBlockhash=key(81),i=>i.lastValidBlockHeight++]){const f=fixture(),d=describe(f.intent),raw=signed(f);mutate(f.intent);assert.throws(()=>checked(f,raw,d.reviewSHA256));}
 for(const v of [0,-1,1.5,500n,'500',Number.MAX_SAFE_INTEGER+1]){const f=fixture();f.intent.lastValidBlockHeight=v;assert.throws(()=>describe(f.intent));}
});
test('changed event, amount, nonce, recipient and pause flags cannot reuse a selected signed message',()=>{
 for(const [kind,mutate] of [['claim',p=>p.event.originAmount++],['return',p=>p.originAmount++],['return',p=>p.nonce++],['return',p=>p.recipient=key(90)],['pause',p=>p.newLocksPaused=true]]){const f=fixture(kind),raw=signed(f);mutate(f.intent.parameters);assert.throws(()=>checked(f,raw));}
});
test('additional instruction, reordered accounts, dropped trailer, changed flags or writable gate cannot pass with valid signatures',()=>{
 const changes=[tx=>tx.add(new TransactionInstruction({programId:pk(key(95)),keys:[],data:Buffer.from([1])})),tx=>tx.instructions[0].keys.reverse(),tx=>tx.instructions[0].keys.pop(),tx=>tx.instructions[0].keys[10].isWritable=true,tx=>tx.instructions[0].data[0]=99];
 for(const mutate of changes){const f=fixture();const raw=transaction(f,mutate).serialize();assert(Transaction.from(raw).verifySignatures());assert.throws(()=>checked(f,raw));}
});
test('legacy nine-account native claim is refused and not silently upgraded',()=>{
 const f=fixture(),p=f.intent.parameters,ix=nativeClaimInstruction({event:p.event,expected:{...p.event},payer:p.payer,committee:p.committee});assert.equal(ix.keys.length,9);const tx=new Transaction({feePayer:pk(f.intent.payer),recentBlockhash:f.intent.recentBlockhash}).add(ix);tx.sign(...f.signers);assert.throws(()=>checked(f,tx.serialize()));
});
test('partial, corrupted and missing signatures cannot pass a matching message',()=>{
 const f=fixture(),tx=new Transaction({feePayer:pk(f.intent.payer),recentBlockhash:f.intent.recentBlockhash}).add(builder(f.intent));tx.partialSign(f.signers[0]);assert.throws(()=>checked(f,tx.serialize({requireAllSignatures:false,verifySignatures:false})));
 const raw=signed(f);raw[3]^=1;assert.throws(()=>checked(f,raw));
});
test('noncanonical trailing bytes and oversized or non-byte transaction input refuse',()=>{
 const f=fixture(),raw=signed(f);for(const v of [Buffer.concat([raw,Buffer.from([0])]),Buffer.alloc(1233),Buffer.alloc(0),raw.toString('base64'),[...raw],null])assert.throws(()=>checked(f,v));
});
test('versioned messages refuse rather than changing the legacy signed-message contract',()=>{
 const f=fixture(),message=new TransactionMessage({payerKey:pk(f.intent.payer),recentBlockhash:f.intent.recentBlockhash,instructions:[builder(f.intent)]}).compileToV0Message();const tx=new VersionedTransaction(message);tx.sign(f.signers);assert.throws(()=>checked(f,tx.serialize()));
});
test('exact intent and parameter schemas refuse unknown, missing and wrong-kind fields',()=>{
 for(const mutate of [i=>i.extra=true,i=>delete i.lastValidBlockHeight,i=>i.kind='legacy',i=>i.parameters.extra=true,i=>i.parameters.event.extra=true,i=>delete i.parameters.context,i=>i.recentBlockhash='11111111111111111111111111111111']){const f=fixture();mutate(f.intent);assert.throws(()=>describe(f.intent));}
 const f=fixture();assert.throws(()=>review({intent:f.intent,transactionBytes:signed(f),expectedReviewSHA256:describe(f.intent).reviewSHA256,extra:true}));
 const p=fixture('pause',[true,true]);p.intent.parameters.bootstrap={};assert.throws(()=>describe(p.intent));
});
test('signer aliases and off-curve fee payers refuse before message construction',()=>{
 for(const mutate of [f=>{f.intent.payer=f.intent.parameters.payer=f.intent.parameters.committee[0];},f=>{f.intent.parameters.recipient=f.intent.parameters.event.recipient=f.intent.parameters.committee[0];},f=>{f.intent.payer=f.intent.parameters.payer=f.intent.parameters.recipient;}]){const f=fixture();mutate(f);assert.throws(()=>describe(f.intent));}
 const f=fixture('return');f.intent.payer=f.intent.parameters.sender=pda(key(5),[Buffer.from('offcurve')]).toBase58();assert.throws(()=>describe(f.intent));
 const p=fixture('pause');p.intent.payer=p.intent.parameters.committee[0];assert.throws(()=>describe(p.intent));
 const r=fixture('return');r.intent.payer=Keypair.generate().publicKey.toBase58();assert.throws(()=>describe(r.intent));
});
test('descriptions do not mutate inputs and edited descriptions cannot authorize a different intent',()=>{
 const f=fixture(),snapshot=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x),before=snapshot(f.intent),d=describe(f.intent),raw=signed(f);checked(f,raw,d.reviewSHA256);assert.equal(snapshot(f.intent),before);
 d.messageSHA256='0'.repeat(64);d.requiredSigners.length=0;d.canSign=true;assert.equal(checked(f,raw,d.reviewSHA256).canSign,false);
 f.intent.parameters.context.configurationBytes.writeBigUInt64LE(99n,358);assert.throws(()=>checked(f,raw,d.reviewSHA256));
});

test('legacy journal preparation rejects gated signed bytes before creating any record',t=>{
 const f=fixture(),p=f.intent.parameters,directory=mkdtempSync(join(tmpdir(),'gated-journal-refusal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 assert.throws(()=>preparePendingClaim({directory,sourceRpc:'http://127.0.0.1:18899',rpc:'http://127.0.0.1:18999',event:p.event,expected:p.event,payer:p.payer,committee:p.committee,transaction:signed(f),lastValidBlockHeight:500,originDecimals:6,sourceContextSlot:20,minimumDestinationSlot:1}),/exact claim/);
 assert.deepEqual(readdirSync(directory),[]);
});
test('a rejected old signed claim keeps the existing version1 journal byte-for-byte unchanged',t=>{
 const old=oldFixture(t),summary=preparePendingClaim(old.args),path=join(old.directory,summary.id+'.json'),before=readFileSync(path),f=fixture();
 assert.throws(()=>checked(f,old.args.transaction));assert.deepEqual(readFileSync(path),before);assert.equal(JSON.parse(before).schemaVersion,1);assert.equal(JSON.parse(before).attempts,0);
});
