// Actual origin-side bridge code replacement on fresh private metadata copies.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction,SYSVAR_RENT_PUBKEY,SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID as TOKEN,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {PUBLIC_GENESIS,decodeEvent,observeLocalEvent,nativeClaimInstruction} from './sdk.mjs';
import {checkedClaimPinPolicy} from './claim-pin-policy.mjs';
import {checkedReviewedOriginMintPolicy} from './reviewed-origin-mint.mjs';
import {observePinnedProgram} from './program-pins.mjs';
import {verifyPrivateCodeReplacement} from './upgrade-observation.mjs';
import {prepareReviewedPendingClaim,takeReviewedSubmissionAttempt,takePinnedSubmissionAttempt,takeSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
const root='/data/bridge-metadata-origin-code-v1',hash=b=>createHash('sha256').update(b).digest('hex'),phase=process.argv[2],resultPath=root+'/private-result.json';
assert.equal(phase,'run');assert(!fs.existsSync(resultPath));
function persist(name,value){const fd=fs.openSync(root+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(root,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
persist('phase-'+phase+'-reserved-private.json',{phase});
const input=JSON.parse(fs.readFileSync(root+'/private-input.json')),baseline=JSON.parse(fs.readFileSync(root+'/baseline-result-private.json')),prior=JSON.parse(fs.readFileSync(root+'/baseline-claim-private.json'));
assert.equal(input.scope,'fresh-private-metadata-journal');assert.deepEqual(input.ports,[26899,27899]);assert.equal(baseline.state,'passed');assert(baseline.processes.allStopped);assert.equal(prior.schemaVersion,3);assert.equal(prior.state,'FINALIZED');assert.equal(baseline.completeGenesisBackingVerified,false);
assert.equal(new Set(input.genesi).size,2);assert(input.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const key=n=>new PublicKey(Uint8Array.from(input.keys[n].slice(32))),fixtureKey=n=>Keypair.fromSecretKey(Uint8Array.from(input.keys[n]));
const payer=key('payer'),sender=key('originUser'),recipient=key('nativeUser'),mint=key('mint'),members=[0,1,2].map(i=>key('member'+i)),bridge=new PublicKey(input.bridge);
const oldEvent=decodeEvent(Buffer.from(prior.eventBase64,'base64'));assert.equal(oldEvent.direction,1);const oldPins=checkedClaimPinPolicy(prior.programmePinPolicy,oldEvent,mint.toBase58()),pins={source:oldPins.destination,destination:oldPins.source},review=checkedReviewedOriginMintPolicy(JSON.parse(fs.readFileSync(root+'/selected-review-private.json')));
assert.deepEqual(review.pins,pins.source);assert.equal(review.sha256,prior.reviewedMintPolicy.sha256);
const sides=[0,1].map(i=>{const program=new PublicKey(input.programs[i]),config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],program)[0];return {i,program,config,genesis:input.genesi[i],connection:new Connection('http://127.0.0.1:'+input.ports[i],'finalized'),vault:PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],program)[0]};});
const [origin,native]=sides,tokens=getAssociatedTokenAddressSync(mint,sender,false,TOKEN),escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),origin.config.toBuffer()],origin.program)[0];
assert.equal(pins.source.genesis,origin.genesis);assert.equal(pins.destination.genesis,native.genesis);assert.equal(pins.source.program,origin.program.toBase58());assert.equal(pins.destination.program,native.program.toBase58());
let proof={schemaVersion:1,state:'running',scope:'One actual incompatible origin bridge code replacement after preparing a version3 metadata native claim on fresh private copies',startedAt:new Date().toISOString(),checks:[],sourceBroadcasts:0,claimBroadcasts:0,handoffs:0,codeSetupBroadcasts:0,codeUpgradeBroadcasts:0,negativeHandoffs:0,canonicalNetworkChanged:false,productionReady:false,completeGenesisBackingVerified:false,independentVerification:false};
const save=()=>fs.writeFileSync(resultPath,JSON.stringify(proof,null,2)),pass=name=>{proof.checks.push(name);save();},u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;},meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
async function admit(s){assert.equal(await s.connection.getGenesisHash(),s.genesis);}
async function state(){for(const s of sides)await admit(s);const [a,b,e,u,v]=await Promise.all([origin.connection.getAccountInfo(origin.config,'finalized'),native.connection.getAccountInfo(native.config,'finalized'),origin.connection.getAccountInfo(escrow,'finalized'),origin.connection.getAccountInfo(tokens,'finalized'),native.connection.getAccountInfo(native.vault,'finalized')]);assert(a.owner.equals(origin.program)&&b.owner.equals(native.program)&&a.data.length===382&&b.data.length===382);assert(e.owner.equals(TOKEN)&&u.owner.equals(TOKEN)&&v.owner.equals(native.program)&&v.data.length===16&&v.data.subarray(0,8).toString()==='SCVLT002');return {originOutstandingUnits:String(a.data.readBigUInt64LE(374)),nativeOutstandingUnits:String(b.data.readBigUInt64LE(374)),originEscrowUnits:String(e.data.readBigUInt64LE(64)),originUserUnits:String(u.data.readBigUInt64LE(64)),reserveNativeUnits:String(v.lamports),protectedFloorNativeUnits:String(v.data.readBigUInt64LE(8))};}

async function finalized(s,signature,recent){const r=await s.connection.confirmTransaction({...recent,signature},'finalized');assert.equal(r.value.err,null);await admit(s);}
async function criticalSnapshot(){
 const result=[];for(const [s,address] of [[origin,origin.config],[native,native.config],[origin,escrow],[origin,tokens],[native,native.vault],[origin,mint]]){
  await admit(s);const a=await s.connection.getAccountInfo(address,'finalized');assert(a);result.push({owner:a.owner.toBase58(),executable:a.executable,lamports:a.lamports,dataSHA256:hash(a.data)});
 }return result;
}

try{
 save();
 {
  proof.initial=await state();assert.deepEqual(proof.initial,baseline.final);assert.equal(proof.initial.originOutstandingUnits,'0');assert.equal(proof.initial.nativeOutstandingUnits,'0');assert.equal(proof.initial.originEscrowUnits,'0');assert.equal(proof.initial.originUserUnits,'2000000');assert.equal(proof.initial.reserveNativeUnits,'52000000');
  for(const [s,p] of [[origin,pins.source],[native,pins.destination]])assert.equal((await observePinnedProgram({rpc:s.connection.rpcEndpoint,pins:p})).outstandingUnits,'0');pass('New copies match completed metadata fixture and retained version3 code/review policy before unused source nonce');
  const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
  const replacement=fs.readFileSync(root+'/replacement.so'),replacementReview=JSON.parse(fs.readFileSync(root+'/replacement-artifact-public.json'));
  assert.equal(replacement.length,3504);assert.equal(replacementReview.bytes,replacement.length);assert.equal(replacementReview.sha256,'cbf999bb25f5ac09468603499ac499b742e7891b091cadd0d47ffb34e572eca3');assert.equal(hash(replacement),replacementReview.sha256);assert.equal(replacement.subarray(0,4).toString('hex'),'7f454c46');
  const buffer=Keypair.generate();persist('buffer-key-private.json',Array.from(buffer.secretKey));
  const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
  async function sendLoader(name,ix,extra=[],upgrading=false){
    await admit(origin);const block=await origin.connection.getLatestBlockhash('finalized');
    const tx=new Transaction({feePayer:payer,...block}).add(...(Array.isArray(ix)?ix:[ix]));tx.sign(fixtureKey('payer'),...extra);
    persist('loader-'+name+'-private.json',{raw:tx.serialize().toString('base64'),lastValidBlockHeight:block.lastValidBlockHeight,state:'ATTEMPT_AUTHORIZED'});
    await admit(origin);const sig=await origin.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});
    if(upgrading)proof.codeUpgradeBroadcasts++;else proof.codeSetupBroadcasts++;save();await finalized(origin,sig,block);return sig;
  }
  const rent=await origin.connection.getMinimumBalanceForRentExemption(37+replacement.length,'finalized');
  await sendLoader('create',[SystemProgram.createAccount({fromPubkey:payer,newAccountPubkey:buffer.publicKey,lamports:rent,space:37+replacement.length,programId:loader}),new TransactionInstruction({programId:loader,keys:[meta(buffer.publicKey,true),meta(payer)],data:u32(0)})],[buffer]);
  for(let offset=0;offset<replacement.length;offset+=800){const chunk=replacement.subarray(offset,offset+800);await sendLoader('write-'+offset,new TransactionInstruction({programId:loader,keys:[meta(buffer.publicKey,true),meta(payer,false,true)],data:Buffer.concat([u32(1),u32(offset),u64(BigInt(chunk.length)),chunk])}));}
  const staged=await origin.connection.getAccountInfo(buffer.publicKey,'finalized');assert(staged.owner.equals(loader)&&!staged.executable&&staged.data.length===37+replacement.length&&staged.data.readUInt32LE()===1&&staged.data[4]===1&&staged.data.subarray(5,37).equals(payer.toBuffer())&&staged.data.subarray(37).equals(replacement));
  assert.deepEqual(await state(),proof.initial);
  pass('Six one-shot private buffer setup transactions finalize the exact reviewed counter ELF without changing bridge accounts, obligations or reserve');
  fs.mkdirSync(root+'/journal',{mode:0o700});const nonce=7n,event=PublicKey.findProgramAddressSync([Buffer.from('event'),origin.config.toBuffer(),sender.toBuffer(),u64(nonce)],origin.program)[0];assert.equal(await origin.connection.getAccountInfo(event,'finalized'),null);
  const beforeSender=await origin.connection.getBalance(sender,'finalized');proof.recipientBefore=await native.connection.getBalance(recipient,'finalized');
  const lock=new TransactionInstruction({programId:origin.program,keys:[meta(sender,true,true),meta(origin.config,true),meta(origin.vault,true),meta(event,true),meta(SystemProgram.programId),meta(tokens,true),meta(escrow,true),meta(mint),meta(TOKEN)],data:Buffer.concat([Buffer.from([1]),u64(10000n),u64(nonce),recipient.toBuffer()])});
  await admit(origin);const recent=await origin.connection.getLatestBlockhash('finalized'),source=new Transaction({feePayer:payer,...recent}).add(lock);source.sign(fixtureKey('payer'),fixtureKey('originUser'));persist('source-private.json',{rawBase64:source.serialize().toString('base64'),lastValidBlockHeight:recent.lastValidBlockHeight,nonce:String(nonce)});
  await admit(origin);proof.sourceSignature=await origin.connection.sendRawTransaction(source.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceBroadcasts=1;save();const done=await origin.connection.confirmTransaction({...recent,signature:proof.sourceSignature},'finalized');assert.equal(done.value.err,null);
  const expected={bridge:bridge.toBase58(),sourceChain:origin.genesis,destinationChain:native.genesis,sourceProgram:origin.program.toBase58(),destinationProgram:native.program.toBase58(),recipient:recipient.toBase58(),epoch:1n,direction:0},observed=await observeLocalEvent({rpc:origin.connection.rpcEndpoint,expectedGenesis:origin.genesis,eventAddress:event.toBase58(),expected});assert.equal(observed.event.originAmount,10000n);
  const e=await origin.connection.getAccountInfo(event,'finalized');assert.equal(beforeSender-await origin.connection.getBalance(sender,'finalized'),e.lamports);proof.afterLock=await state();assert.equal(proof.afterLock.originEscrowUnits,'10000');assert.equal(proof.afterLock.originOutstandingUnits,'10000');assert.equal(proof.afterLock.nativeOutstandingUnits,'0');assert.equal(proof.afterLock.originUserUnits,'1990000');pass('One new metadata-token source lock finalizes with exact escrow/counter and separately accounted source-event rent');
  const latest=await native.connection.getLatestBlockhash('finalized'),claim=new Transaction({feePayer:payer,...latest}).add(nativeClaimInstruction({event:observed.event,expected,payer,committee:members}));claim.sign(fixtureKey('payer'),...[0,1,2].map(i=>fixtureKey('member'+i)));
  proof.operation=prepareReviewedPendingClaim({directory:root+'/journal',sourceRpc:origin.connection.rpcEndpoint,rpc:native.connection.rpcEndpoint,event:observed.event,expected,payer,committee:members,transaction:claim.serialize(),lastValidBlockHeight:latest.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await native.connection.getSlot('finalized'),originMint:mint,programmePins:{source:pins.source,destination:pins.destination},reviewedMintPolicy:review});save();
  const journalPath=root+'/journal/'+proof.operation.id+'.json',prepared=JSON.parse(fs.readFileSync(journalPath)),preparedBytes=fs.readFileSync(journalPath);
  assert.equal(prepared.scope,'isolated-native-claim');assert.equal(prepared.schemaVersion,3);assert.equal(prepared.state,'PREPARED');assert.equal(prepared.attempts,0);assert.equal(prepared.programmePinHandoffAttempted,false);assert.equal(prepared.programmePinAdmission,undefined);assert.equal(prepared.reviewedMintAdmission,undefined);await inspectPendingClaim(root+'/journal',proof.operation.id);
  const critical=await criticalSnapshot();proof.recipientBefore=await native.connection.getBalance(recipient,'finalized');pass('Original signed version3 metadata claim stays PREPARED with exact selected review and zero handoffs before origin code replacement');
  const programData=PublicKey.findProgramAddressSync([origin.program.toBuffer()],loader)[0],before=await origin.connection.getAccountInfoAndContext(programData,'finalized');assert.equal(hash(before.value.data),pins.source.programDataSHA256);
  const upgrade=new TransactionInstruction({programId:loader,keys:[meta(programData,true),meta(origin.program,true),meta(buffer.publicKey,true),meta(payer,true),meta(SYSVAR_RENT_PUBKEY),meta(SYSVAR_CLOCK_PUBKEY),meta(payer,false,true)],data:u32(3)});
  const signature=await sendLoader('upgrade',upgrade,[],true),after=await origin.connection.getAccountInfoAndContext(programData,{commitment:'finalized',minContextSlot:before.context.slot});
  const wire=v=>({context:v.context,value:{...v.value,owner:v.value.owner.toBase58(),data:[v.value.data.toString('base64'),'base64']}});
  proof.codeChange=verifyPrivateCodeReplacement({pins:pins.source,replacementSHA256:replacementReview.sha256,replacementBytes:replacement.length,before:wire(before),after:wire(after)});proof.codeChange.side=0;proof.codeChange.signature=signature;
  assert(proof.codeChange.authorityUnchanged&&proof.codeChange.capacityUnchanged);assert.equal(proof.codeChange.replacementApprovedForSettlement,false);assert.notEqual(proof.codeChange.newElfSHA256,proof.codeChange.oldElfSHA256);
  assert.equal((await observePinnedProgram({rpc:native.connection.rpcEndpoint,pins:pins.destination})).outstandingUnits,'0');proof.nativePinsStillMatch=true;
  await assert.rejects(observePinnedProgram({rpc:origin.connection.rpcEndpoint,pins:pins.source,minimumContextSlot:after.context.slot}),/programme account differs/);
  pass('Actual origin Loader-v3 replacement finalizes with unchanged authority/capacity and different reviewed ELF; old source pins reject while destination pins still match');
  const takes=[takeReviewedSubmissionAttempt,takePinnedSubmissionAttempt,takeSubmissionAttempt];proof.refusalHeights=[];
  for(const take of takes){
   const height=await native.connection.getBlockHeight('finalized');assert(height<=latest.lastValidBlockHeight,'Claim must remain unexpired for actual code-change refusal');
   await assert.rejects(take(root+'/journal',proof.operation.id),/programme account differs/);proof.negativeHandoffs++;proof.refusalHeights.push(height);assert(fs.readFileSync(journalPath).equals(preparedBytes));save();
  }
  assert((await native.connection.getBlockHeight('finalized'))<=latest.lastValidBlockHeight);proof.claimStillUnexpiredAtEveryRefusal=true;
  const retained=await inspectPendingClaim(root+'/journal',proof.operation.id);assert.equal(retained.state,'PREPARED');assert.equal(retained.attempts,0);assert.equal(retained.transactionHash,proof.operation.transactionHash);proof.operation=retained;
  assert.equal((await native.connection.getSignatureStatuses([prepared.signature],{searchTransactionHistory:true})).value[0],null);assert.equal(await native.connection.getTransaction(prepared.signature,{commitment:'finalized',maxSupportedTransactionVersion:0}),null);assert.equal(await native.connection.getAccountInfo(new PublicKey(prepared.id),'finalized'),null);
  pass('All three mandatory-review handoffs refuse changed origin code while signed claim remains unexpired; journal bytes unchanged, attempts0 and no destination transaction or receipt');
  assert.deepEqual(await criticalSnapshot(),critical);proof.final=await state();assert.deepEqual(proof.final,proof.afterLock);assert.equal(await native.connection.getBalance(recipient,'finalized'),proof.recipientBefore);
  proof.originCodeReplacementVerified=true;proof.criticalAssetsUnchanged=true;proof.signedBytesAndReviewUnchanged=true;proof.settlementAccepted=false;
  assert.equal(proof.sourceBroadcasts,1);assert.equal(proof.codeSetupBroadcasts,6);assert.equal(proof.codeUpgradeBroadcasts,1);assert.equal(proof.claimBroadcasts,0);assert.equal(proof.handoffs,0);assert.equal(proof.negativeHandoffs,3);
  pass('Exact mint, escrow, token recipient, both configurations and native reserve stay unchanged; pending source liability remains without payout, refund or retry');
  proof.state='passed';proof.completedAt=new Date().toISOString();save();
 }
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1000);save();throw error;}
