import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PublicKey,Keypair,Transaction} from '@solana/web3.js';
import {encodeEvent,decodeEvent} from './sdk.mjs';
import {GATED_NATIVE_CONTRACT as contract,gatedNativeClaimInstruction as claim,gatedNativeReturnInstruction as returned,gatedNativePauseInstruction as pause} from './gated-native.mjs';
const key=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58(),pk=v=>new PublicKey(v),hash=b=>createHash('sha256').update(b).digest('hex');
const pda=(p,seeds)=>PublicKey.findProgramAddressSync(seeds,pk(p))[0];
const le=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
function fixture(){
 const b=Buffer.alloc(382);b.write('SCCFG001');for(const [o,k] of [[8,1],[40,3],[72,2],[104,4],[136,40]])pk(key(k)).toBuffer().copy(b,o);
 const members=[11,12,13,14,15].map(key);members.forEach((k,i)=>pk(k).toBuffer().copy(b,168+32*i));b.set([6,9,1,3],328);b.writeBigUInt64LE(1n,332);b.writeBigUInt64LE(2_000_000n,342);b.writeBigUInt64LE(4_000_000n,350);b.writeBigUInt64LE(102_000n,374);
 const pins={genesis:key(3),remoteGenesis:key(2),program:key(5),remoteProgram:key(4),bridge:key(1),originMint:key(40),side:1,upgradeAuthority:key(8),elfSHA256:contract.elfSHA256,elfBytes:contract.elfBytes,programDataSHA256:'a'.repeat(64),policySHA256:hash(b.subarray(0,358))};
 const cfg=pda(pins.program,[Buffer.from('config'),pk(pins.bridge).toBuffer()]),vault=pda(pins.program,[Buffer.from('vault'),cfg.toBuffer()]);
 const event={bridge:key(1),sourceChain:key(2),destinationChain:key(3),sourceProgram:key(4),destinationProgram:key(5),sender:key(6),recipient:key(7),originAmount:50_000n,nonce:2n,slot:20n,epoch:1n,direction:0};
 const source=pda(event.sourceProgram,[Buffer.from('config'),pk(event.bridge).toBuffer()]);event.sourceEvent=pda(event.sourceProgram,[Buffer.from('event'),source.toBuffer(),pk(event.sender).toBuffer(),le(event.nonce)]).toBase58();
 const bootEvent=pda(event.sourceProgram,[Buffer.from('event'),source.toBuffer(),pk(event.sender).toBuffer(),le(1n)]);
 const record=Buffer.concat([Buffer.from('SCBST001'),Buffer.alloc(32,42),le(2_000_000n),le(2_000_000_000n),le(100_000_000n),le(1_900_000_000n),bootEvent.toBuffer(),le(102_000n),le(2_000_000n)]);
 return {context:{abi:contract.abi,pins,configurationBytes:b},bootstrap:{recordBytes:record,expectedRecordSHA256:hash(record),expectedSourceEvent:bootEvent.toBase58(),minimumRentNativeUnits:1_002_240n},event,payer:key(8),committee:members.slice(0,3),recipient:key(7),sender:key(7),originAmount:25_000n,nonce:7n,cfg,vault};
}
const repin=f=>{f.context.pins.policySHA256=hash(f.context.configurationBytes.subarray(0,358));f.bootstrap.expectedRecordSHA256=hash(f.bootstrap.recordBytes);return f;};
const safety=r=>{assert.deepEqual(r.signatures,[]);for(const k of ['chainStateVerified','sourceFinalityVerified','canPrepareJournal','canSign','canBroadcast','productionReady'])assert.equal(r[k],false,k);};
test('explicit new ABI and code artifact pin match the selected compiled prototype',()=>{
 assert.equal(contract.elfSHA256,readFileSync(new URL('./gated-program/artifact-sha256.txt',import.meta.url),'utf8').trim());assert.equal(contract.elfBytes,217032);assert(Object.isFrozen(contract));
 const f=fixture(),r=claim(f);assert.equal(r.selectedCodeSHA256,contract.elfSHA256);safety(r);
});
test('native claim retains the exact legacy event bytes and appends three read-only nonsigner gate accounts',()=>{
 const f=fixture(),r=claim(f),ix=r.instruction;assert.equal(ix.programId.toBase58(),f.context.pins.program);assert.equal(ix.data.length,298);assert.equal(ix.data[0],2);assert.deepEqual(decodeEvent(ix.data.subarray(1)),f.event);assert.equal(ix.keys.length,12);
 assert.deepEqual(ix.keys.slice(0,3).map(k=>k.pubkey.toBase58()),[f.payer,f.cfg.toBase58(),f.vault.toBase58()]);assert.deepEqual(ix.keys.slice(6,9).map(k=>k.pubkey.toBase58()),f.committee);
 const tail=ix.keys.slice(-3);assert.equal(tail[0].pubkey.toBase58(),f.vault.toBase58());assert(tail.every(k=>!k.isWritable&&!k.isSigner));assert.equal(tail[2].pubkey.toBase58(),pda(ix.programId,[Buffer.from('claim'),f.cfg.toBuffer(),pk(f.bootstrap.expectedSourceEvent).toBuffer()]).toBase58());safety(r);
});
test('native return encodes exact amount, nonce, recipient and source event with one signer',()=>{
 const f=fixture(),r=returned(f),ix=r.instruction;assert.equal(ix.data.length,49);assert.equal(ix.data[0],1);assert.equal(ix.data.readBigUInt64LE(1),25_000n);assert.equal(ix.data.readBigUInt64LE(9),7n);assert(ix.data.subarray(17).equals(pk(f.recipient).toBuffer()));assert.equal(ix.keys.length,8);assert.equal(ix.keys.filter(k=>k.isSigner).length,1);assert.equal(ix.keys[3].pubkey.toBase58(),pda(f.context.pins.program,[Buffer.from('event'),f.cfg.toBuffer(),pk(f.sender).toBuffer(),le(7n)]).toBase58());safety(r);
});
test('opening either pause flag requires bootstrap; full pause remains available without record inputs',()=>{
 for(const [newLocksPaused,settlementPaused] of [[false,false],[false,true],[true,false]]){
  const f=fixture(),r=pause({...f,newLocksPaused,settlementPaused});assert.equal(r.instruction.keys.length,7);assert.deepEqual([...r.instruction.data],[3,Number(newLocksPaused),Number(settlementPaused)]);assert.throws(()=>pause({...f,bootstrap:undefined,newLocksPaused,settlementPaused}));safety(r);
 }
 const f=fixture(),r=pause({...f,bootstrap:undefined,newLocksPaused:true,settlementPaused:true});assert.equal(r.instruction.keys.length,4);assert.equal(r.selectedBootstrapRecordSHA256,null);safety(r);
 for(const v of [0,1,'false',null])assert.throws(()=>pause({...f,newLocksPaused:v,settlementPaused:true}));
});
test('wrong ABI, old artifact, side, external policy and chain identities refuse',()=>{
 for(const change of [f=>f.context.abi='v2',f=>f.context.pins.elfSHA256='556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53',f=>f.context.pins.elfBytes++,f=>f.context.pins.side=0,f=>f.context.pins.policySHA256='0'.repeat(64),f=>f.context.pins.genesis='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon',f=>f.context.pins.genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',f=>f.context.pins.genesis='11111111111111111111111111111111',f=>f.context.pins.remoteProgram=f.context.pins.program,f=>f.context.extra=true]){const f=fixture();change(f);assert.throws(()=>claim(f));}
});
test('configuration length, identity, committee, epoch, precision, cap and pause checks survive repinned corrupt metadata',()=>{
 for(const change of [b=>b[0]=0,b=>b[8]^=1,b=>b[168]=0,b=>b[329]=8,b=>b[330]=0,b=>b[331]=2,b=>b.writeBigUInt64LE(2n,332),b=>b[341]=2,b=>b.writeBigUInt64LE(0n,342),b=>b.writeBigUInt64LE(1n,350)]){
  const f=fixture();change(f.context.configurationBytes);repin(f);
  if(f.context.configurationBytes[168]===0){f.context.configurationBytes.subarray(168,200).copy(f.context.configurationBytes,200);repin(f);}
  assert.throws(()=>claim(f));
 }
 const f=fixture();f.context.configurationBytes=Buffer.alloc(383);assert.throws(()=>claim(f));
 const p=fixture();p.context.configurationBytes[341]=1;repin(p);assert.throws(()=>returned(p));assert.throws(()=>claim(p));
});
test('external bootstrap hash/source and exact witness arithmetic cannot be skipped',()=>{
 for(const change of [f=>f.bootstrap.expectedRecordSHA256='0'.repeat(64),f=>f.bootstrap.expectedSourceEvent=key(90),f=>f.bootstrap.recordBytes=Buffer.alloc(119),f=>f.bootstrap.minimumRentNativeUnits=3_000_000n,f=>f.bootstrap.minimumRentNativeUnits=1002240]){const f=fixture();change(f);assert.throws(()=>claim(f));}
 for(const change of [b=>b[0]=0,b=>b.fill(0,8,40),b=>b.writeBigUInt64LE(2_000_001n,40),b=>b.writeBigUInt64LE(0n,56),b=>b.writeBigUInt64LE(1_900_000_001n,64),b=>b.writeBigUInt64LE(102_001n,104),b=>b.writeBigUInt64LE(2_000_001n,112)]){const f=fixture();change(f.bootstrap.recordBytes);repin(f);assert.throws(()=>claim(f));}
});
test('only three distinct configured members can construct committee instructions',()=>{
 for(const committee of [[key(11),key(11),key(12)],[key(11),key(12)],[key(11),key(12),key(99)],null]){const f=fixture();f.committee=committee;assert.throws(()=>claim(f));assert.throws(()=>pause({...f,newLocksPaused:true,settlementPaused:true}));}
});
test('claims reject changed domains, recipients, source PDA, consumed bootstrap credit and declared capacity overflow',()=>{
 for(const change of [f=>f.event.sourceChain=key(90),f=>f.event.destinationProgram=key(90),f=>f.event.direction=1,f=>f.event.epoch=2n,f=>f.event.recipient=key(90),f=>f.event.sourceEvent=key(90),f=>f.event.sourceEvent=f.bootstrap.expectedSourceEvent,f=>f.event.originAmount=2_000_001n,f=>f.event.originAmount=1_900_000n]){const f=fixture();change(f);assert.throws(()=>claim(f));}
});
test('returns reject imprecise units, paused policy, cap or obligation excess and protected actor aliases',()=>{
 for(const value of [0n,-1n,25_000,'25000',102_001n,1n<<64n]){const f=fixture();f.originAmount=value;assert.throws(()=>returned(f));}
 for(const name of ['sender','recipient','payer']){
  const f=fixture();f[name]=f.vault.toBase58();assert.throws(()=>name==='payer'?claim(f):returned(f));
 }
 const f=fixture();f.nonce=1;assert.throws(()=>returned(f));f.nonce=7n;f.sender='11111111111111111111111111111111';assert.throws(()=>returned(f));
});
test('u64 values beyond Number precision preserve exact return wire bytes without overflow',()=>{
 const f=fixture(),max=(1n<<64n)-1n,b=f.context.configurationBytes,w=f.bootstrap.recordBytes;b[328]=9;b.writeBigUInt64LE(max,342);b.writeBigUInt64LE(max,350);b.writeBigUInt64LE(9007199254740994n,374);w.writeBigUInt64LE(max,40);w.writeBigUInt64LE(max,48);w.writeBigUInt64LE(max-100_000_000n,64);w.writeBigUInt64LE(102_000_000n,104);repin(f);f.originAmount=9007199254740993n;f.nonce=max;
 const r=returned(f);assert.equal(r.instruction.data.readBigUInt64LE(1),9007199254740993n);assert.equal(r.instruction.data.readBigUInt64LE(9),max);
});
test('builders preserve supplied buffers, pins and event objects; returned instructions remain unsigned drafts',()=>{
 const f=fixture(),snapshot=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x),before=snapshot(f);claim(f);returned(f);pause({...f,newLocksPaused:false,settlementPaused:false});assert.equal(snapshot(f),before);
 const r=claim(f);r.instruction.data[0]=99;assert.equal(snapshot(f),before);assert.equal(r.chainStateVerified,false);
});
test('gated claim fits a real four-signature legacy message with ephemeral test keys',()=>{
 const f=fixture(),signers=Array.from({length:4},()=>Keypair.generate());f.payer=signers[0].publicKey.toBase58();f.committee=signers.slice(1).map(k=>k.publicKey.toBase58());f.committee.forEach((k,i)=>pk(k).toBuffer().copy(f.context.configurationBytes,168+32*i));repin(f);
 const tx=new Transaction({feePayer:signers[0].publicKey,recentBlockhash:key(80)}).add(claim(f).instruction);tx.sign(...signers);assert(tx.serialize().length<=1232);
});
