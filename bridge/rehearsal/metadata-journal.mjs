// Fresh private metadata round trip and known-finalized restart recovery only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID as TOKEN,ExtensionType,getMintLen,TYPE_SIZE,LENGTH_SIZE,createInitializeMetadataPointerInstruction,createInitializeMintInstruction,createMintToInstruction,createSetAuthorityInstruction,AuthorityType,getAssociatedTokenAddressSync,createAssociatedTokenAccountInstruction} from '@solana/spl-token';
import {pack,createInitializeInstruction,createUpdateAuthorityInstruction} from '@solana/spl-token-metadata';
import {PUBLIC_GENESIS,observeLocalEvent,nativeClaimInstruction,originClaimInstruction} from './sdk.mjs';
import {inspectImmutableMint} from './mint-metadata.mjs';
import {genesisTokenCodePins} from './origin-token-code.mjs';
import {reviewedOriginMintPolicy} from './reviewed-origin-mint.mjs';
import {prepareReviewedPendingClaim,takeReviewedSubmissionAttempt,takeSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
const root='/data/bridge-metadata-journal-v2',hash=b=>createHash('sha256').update(b).digest('hex');
const bs58=createRequire(import.meta.resolve('@solana/web3.js'))('bs58');
const input=JSON.parse(fs.readFileSync(root+'/private-input.json'));
assert.equal(input.scope,'fresh-private-metadata-journal');assert.deepEqual(input.ports,[26899,27899]);
assert.equal(input.genesi.length,2);assert.notEqual(input.genesi[0],input.genesi[1]);assert(input.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const key=n=>Keypair.fromSecretKey(Uint8Array.from(input.keys[n])),payer=key('payer'),originUser=key('originUser'),nativeUser=key('nativeUser'),mint=key('mint'),members=Array.from({length:5},(_,i)=>key('member'+i)),co=members.slice(0,3),bridge=new PublicKey(input.bridge),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;},meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const sides=[0,1].map(i=>{const program=new PublicKey(input.programs[i]),config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],program)[0];return {i,program,config,vault:PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],program)[0],escrow:PublicKey.findProgramAddressSync([Buffer.from('escrow'),config.toBuffer()],program)[0],genesis:input.genesi[i],connection:new Connection('http://127.0.0.1:'+input.ports[i],'finalized')};});
const [origin,native]=sides,tokens=getAssociatedTokenAddressSync(mint.publicKey,originUser.publicKey,false,TOKEN),phase=process.argv[2]??'run',resultPath=root+'/private-result.json';
assert(['run','offline-0','offline-1','recover-0','recover-1'].includes(phase),'Unknown private phase');
if(phase==='run')assert(!fs.existsSync(resultPath),'Retain existing attempt result');
persist('phase-'+phase+'-reserved-private.json',{phase});
let proof=phase==='run'?{schemaVersion:1,state:'running',scope:'Fresh synthetic metadata journal round trip and known-finalized process restart recovery',startedAt:new Date().toISOString(),checks:[],transactions:[],operations:[],sourceBroadcasts:0,claimBroadcasts:0,negativeHandoffs:0,productionReady:false,canonicalNetworkChanged:false,completeGenesisBackingVerified:false,independentVerification:false}:JSON.parse(fs.readFileSync(resultPath));
const save=()=>fs.writeFileSync(resultPath,JSON.stringify(proof,null,2)),pass=name=>{proof.checks.push(name);save();};
function persist(name,value){const fd=fs.openSync(root+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(root,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
async function admit(s){assert.equal(await s.connection.getGenesisHash(),s.genesis);}
async function finalized(s,signature,latest){const r=await s.connection.confirmTransaction({...latest,signature},'finalized');assert.equal(r.value.err,null);await admit(s);}
async function send(s,label,instructions,signers=[]){
 assert.equal(phase,'run');assert(proof.transactions.length<16&&!proof.transactions.some(t=>t.label===label));await admit(s);
 const latest=await s.connection.getLatestBlockhash('finalized'),tx=new Transaction({feePayer:payer.publicKey,...latest}).add(...instructions);tx.sign(...[...new Map([payer,...signers].map(k=>[k.publicKey.toBase58(),k])).values()]);
 const raw=tx.serialize(),signature=(bs58.default??bs58).encode(tx.signature);assert(raw.length<=1232);const simulation=await s.connection.simulateTransaction(tx);assert.equal(simulation.value.err,null,JSON.stringify(simulation.value.logs));await admit(s);
 persist('transaction-'+label+'-private.json',{signature,rawBase64:raw.toString('base64'),...latest});proof.transactions.push({label,side:s.i,signature,state:'submission-attempted'});save();
 assert.equal(await s.connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:0}),signature);await finalized(s,signature,latest);proof.transactions.at(-1).state='finalized';save();return signature;
}
function configBytes(s){return Buffer.concat([Buffer.from('SCCFG001'),bridge.toBuffer(),new PublicKey(s.genesis).toBuffer(),new PublicKey(sides[1-s.i].genesis).toBuffer(),sides[1-s.i].program.toBuffer(),mint.publicKey.toBuffer(),...members.map(k=>k.publicKey.toBuffer()),Buffer.from([6,9,s.i,3]),u64(1n),Buffer.from([1,1]),u64(2000000n),u64(4000000n),u64(0n),u64(0n),u64(0n)]);}
const ix=(s,keys,data)=>new TransactionInstruction({programId:s.program,keys,data});
async function state(){
 for(const s of sides)await admit(s);
 const [a,b,e,u,v]=await Promise.all([origin.connection.getAccountInfo(origin.config,'finalized'),native.connection.getAccountInfo(native.config,'finalized'),origin.connection.getAccountInfo(origin.escrow,'finalized'),origin.connection.getAccountInfo(tokens,'finalized'),native.connection.getAccountInfo(native.vault,'finalized')]);
 assert(a.owner.equals(origin.program)&&b.owner.equals(native.program)&&a.data.length===382&&b.data.length===382);assert(e.owner.equals(TOKEN)&&u.owner.equals(TOKEN));assert(v.owner.equals(native.program)&&v.data.length===16&&v.data.subarray(0,8).toString()==='SCVLT002');
 return {originOutstandingUnits:String(a.data.readBigUInt64LE(374)),nativeOutstandingUnits:String(b.data.readBigUInt64LE(374)),originEscrowUnits:String(e.data.readBigUInt64LE(64)),originUserUnits:String(u.data.readBigUInt64LE(64)),reserveNativeUnits:String(v.lamports),protectedFloorNativeUnits:String(v.data.readBigUInt64LE(8))};
}
async function run(){
 assert(!fs.existsSync(resultPath));save();for(const s of sides)await admit(s);
 const metadata={updateAuthority:payer.publicKey,mint:mint.publicKey,name:'Private fixture',symbol:'TEST',uri:'https://example.invalid/m',additionalMetadata:[]},space=getMintLen([ExtensionType.MetadataPointer]),full=space+TYPE_SIZE+LENGTH_SIZE+pack(metadata).length;
 const rent=await origin.connection.getMinimumBalanceForRentExemption(full,'finalized');
 await send(origin,'metadata-mint',[
  SystemProgram.createAccount({fromPubkey:payer.publicKey,newAccountPubkey:mint.publicKey,space,lamports:rent,programId:TOKEN}),createInitializeMetadataPointerInstruction(mint.publicKey,null,mint.publicKey,TOKEN),createInitializeMintInstruction(mint.publicKey,6,payer.publicKey,null,TOKEN),createInitializeInstruction({programId:TOKEN,metadata:mint.publicKey,updateAuthority:payer.publicKey,mint:mint.publicKey,mintAuthority:payer.publicKey,name:metadata.name,symbol:metadata.symbol,uri:metadata.uri}),createAssociatedTokenAccountInstruction(payer.publicKey,tokens,originUser.publicKey,mint.publicKey,TOKEN),createMintToInstruction(mint.publicKey,tokens,payer.publicKey,2000000n,[],TOKEN),createSetAuthorityInstruction(mint.publicKey,payer.publicKey,AuthorityType.MintTokens,null,[],TOKEN),createUpdateAuthorityInstruction({programId:TOKEN,metadata:mint.publicKey,oldAuthority:payer.publicKey,newAuthority:null})
 ],[mint]);
 const mintAccount=await origin.connection.getAccountInfo(mint.publicKey,'finalized');assert(mintAccount.owner.equals(TOKEN)&&!mintAccount.executable);const inspected=inspectImmutableMint(mintAccount.data,mint.publicKey.toBase58());assert.equal(inspected.supplyUnits,'2000000');assert.equal(inspected.layout,'immutable-self-metadata-v1');pass('Fresh immutable metadata mint and canonical recipient token account finalized');
 const elf=fs.readFileSync(root+'/bridge.so');assert.equal(hash(elf),'556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53');
 for(const s of sides){
  await send(s,'initialize-'+s.i,[ix(s,[meta(payer.publicKey,true,true),meta(s.config,true),meta(s.vault,true),meta(s.i===0?s.escrow:payer.publicKey,true),meta(s.i===0?mint.publicKey:payer.publicKey),meta(TOKEN),meta(SystemProgram.programId),meta(s.program),meta(PublicKey.findProgramAddressSync([s.program.toBuffer()],loader)[0])],Buffer.concat([Buffer.from([0]),configBytes(s)]))]);
  const holder=s.i===0?originUser:nativeUser;await send(s,'fund-user-'+s.i,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:holder.publicKey,lamports:100000000})]);
  await send(s,'enable-'+s.i,[ix(s,[meta(s.config,true),...co.map(k=>meta(k.publicKey,false,true))],Buffer.from([3,0,0]))],co);
  const header=Buffer.alloc(45);header.writeUInt32LE(3);header[12]=1;payer.publicKey.toBuffer().copy(header,13);const policy=configBytes(s);policy[340]=policy[341]=0;
  s.pins={genesis:s.genesis,remoteGenesis:sides[1-s.i].genesis,program:s.program.toBase58(),remoteProgram:sides[1-s.i].program.toBase58(),bridge:bridge.toBase58(),originMint:mint.publicKey.toBase58(),side:s.i,upgradeAuthority:payer.publicKey.toBase58(),elfBytes:elf.length,elfSHA256:hash(elf),programDataSHA256:hash(Buffer.concat([header,elf])),policySHA256:hash(policy.subarray(0,358))};
 }
 const v=await native.connection.getAccountInfo(native.vault,'finalized');await send(native,'fund-reserve',[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:native.vault,lamports:52000000-v.lamports})]);
 const tokenPins=genesisTokenCodePins({genesis:origin.genesis,artifact:fs.readFileSync(root+'/token2022.so'),upgradeAuthority:SystemProgram.programId.toBase58(),expectedSHA256:'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68',expectedBytes:506896});
 const review=reviewedOriginMintPolicy({pins:origin.pins,tokenPins,expectedSupplyUnits:'2000000',expectedDecimals:6,expectedMintDataSHA256:hash(mintAccount.data)});persist('selected-review-private.json',review);
 proof.initial=await state();assert.equal(proof.initial.originEscrowUnits,'0');assert.equal(proof.initial.originOutstandingUnits,'0');assert.equal(proof.initial.nativeOutstandingUnits,'0');assert.equal(proof.initial.originUserUnits,'2000000');assert.equal(proof.initial.reserveNativeUnits,'52000000');fs.mkdirSync(root+'/journal',{mode:0o700});pass('Both fresh bridge domains, selected genesis code pins and bounded synthetic reserve initialized');
 for(const direction of [0,1]){
  const source=sides[direction],destination=sides[1-direction],sender=direction===0?originUser:nativeUser,recipient=direction===0?nativeUser:originUser,nonce=BigInt(direction+1),eventAddress=PublicKey.findProgramAddressSync([Buffer.from('event'),source.config.toBuffer(),sender.publicKey.toBuffer(),u64(nonce)],source.program)[0];
  assert.equal(await source.connection.getAccountInfo(eventAddress,'finalized'),null);const beforeSource=await source.connection.getBalance(sender.publicKey,'finalized');
  const keys=[meta(sender.publicKey,true,true),meta(source.config,true),meta(source.vault,true),meta(eventAddress,true),meta(SystemProgram.programId)];if(direction===0)keys.push(meta(tokens,true),meta(origin.escrow,true),meta(mint.publicKey),meta(TOKEN));
  await send(source,'source-'+direction,[ix(source,keys,Buffer.concat([Buffer.from([1]),u64(10000n),u64(nonce),recipient.publicKey.toBuffer()]))],[sender]);proof.sourceBroadcasts++;
  const expected={bridge:bridge.toBase58(),sourceChain:source.genesis,destinationChain:destination.genesis,sourceProgram:source.program.toBase58(),destinationProgram:destination.program.toBase58(),recipient:recipient.publicKey.toBase58(),epoch:1n,direction},observed=await observeLocalEvent({rpc:source.connection.rpcEndpoint,expectedGenesis:source.genesis,eventAddress:eventAddress.toBase58(),expected});assert.equal(observed.event.originAmount,10000n);
  const eventAccount=await source.connection.getAccountInfo(eventAddress,'finalized');assert.equal(beforeSource-await source.connection.getBalance(sender.publicKey,'finalized'),eventAccount.lamports+(direction===1?10000000:0));
  const latest=await destination.connection.getLatestBlockhash('finalized'),claimIx=direction===0?nativeClaimInstruction({event:observed.event,expected,payer:payer.publicKey,committee:co.map(k=>k.publicKey)}):originClaimInstruction({event:observed.event,expected,payer:payer.publicKey,committee:co.map(k=>k.publicKey),mint:mint.publicKey,destinationToken:tokens});
  const claim=new Transaction({feePayer:payer.publicKey,...latest}).add(claimIx);claim.sign(payer,...co);
  const args={directory:root+'/journal',sourceRpc:source.connection.rpcEndpoint,rpc:destination.connection.rpcEndpoint,event:observed.event,expected,payer:payer.publicKey,committee:co.map(k=>k.publicKey),transaction:claim.serialize(),lastValidBlockHeight:latest.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await destination.connection.getSlot('finalized'),originMint:mint.publicKey,destinationToken:direction===1?tokens:null,programmePins:{source:source.pins,destination:destination.pins},reviewedMintPolicy:review};
  const before=await state();
  for(const [j,change] of [{expectedMintDataSHA256:'0'.repeat(64)},{tokenPins:{...tokenPins,programDataSHA256:'0'.repeat(64)}}].entries()){
   const directory=root+'/negative-'+direction+'-'+j;fs.mkdirSync(directory,{mode:0o700});const op=prepareReviewedPendingClaim({...args,directory,reviewedMintPolicy:reviewedOriginMintPolicy({...review,...change})}),file=directory+'/'+op.id+'.json',bytes=fs.readFileSync(file);
   await assert.rejects(takeReviewedSubmissionAttempt(directory,op.id));assert(fs.readFileSync(file).equals(bytes));assert.equal((await inspectPendingClaim(directory,op.id)).attempts,0);assert.deepEqual(await state(),before);proof.negativeHandoffs++;
  }
  pass('Direction'+direction+' wrong reviewed mint digest and token implementation refuse actual handoff with unchanged journal/economics');
  const op=prepareReviewedPendingClaim(args),handoff=await takeReviewedSubmissionAttempt(root+'/journal',op.id),record=JSON.parse(fs.readFileSync(root+'/journal/'+op.id+'.json'));assert.equal(record.schemaVersion,3);assert.equal(record.reviewedMintAdmission.policySHA256,review.sha256);assert.equal(record.attempts,1);assert.equal(hash(handoff.rawTransaction),op.transactionHash);
  proof.operations.push({...op,direction,latest,preparedJournalSHA256:hash(fs.readFileSync(root+'/journal/'+op.id+'.json'))});proof.claimBroadcasts++;save();
  await admit(destination);assert.equal(await destination.connection.sendRawTransaction(handoff.rawTransaction,{skipPreflight:false,maxRetries:0}),handoff.signature);await finalized(destination,handoff.signature,latest);
  // Known-finalized reconciliation here; later recovery exercises real RPC outage/restart.
  const settled=await reconcilePendingClaim(root+'/journal',op.id);assert.equal(settled.state,'FINALIZED');assert.equal(settled.signature,handoff.signature);proof.operations[direction]={...proof.operations[direction],...settled};
  for(const take of [takeReviewedSubmissionAttempt,takeSubmissionAttempt])await assert.rejects(take(root+'/journal',op.id),/attempt already exists/);
  const after=await state();if(direction===0){assert.equal(after.originEscrowUnits,'10000');assert.equal(after.originOutstandingUnits,'10000');assert.equal(after.nativeOutstandingUnits,'10000');assert.equal(after.originUserUnits,'1990000');assert.equal(after.reserveNativeUnits,'42000000');}else assert.deepEqual(after,proof.initial);
  proof.final=after;pass('Direction'+direction+' exact metadata settlement finalizes once, reconciles original signature and refuses another handoff');
 }
 assert.equal(proof.sourceBroadcasts,2);assert.equal(proof.claimBroadcasts,2);assert.equal(proof.negativeHandoffs,4);proof.state='awaiting-recovery';save();
}
async function recovery(side,offline){
 assert.equal(proof.state,'awaiting-recovery');assert(side===0||side===1);const op=proof.operations.find(o=>1-o.direction===side);assert(op&&op.state==='FINALIZED');const file=root+'/journal/'+op.id+'.json',before=fs.readFileSync(file),inspected=await inspectPendingClaim(root+'/journal',op.id);assert.equal(inspected.schemaVersion,3);
 if(offline){await assert.rejects(reconcilePendingClaim(root+'/journal',op.id));assert(fs.readFileSync(file).equals(before));await assert.rejects(takeReviewedSubmissionAttempt(root+'/journal',op.id),/attempt already exists/);pass('Side'+side+' actual destination RPC outage retains original finalized journal and forbids retry');}
 else{const recovered=await reconcilePendingClaim(root+'/journal',op.id);assert.equal(recovered.state,'FINALIZED');assert.equal(recovered.signature,op.signature);assert.equal(recovered.transactionHash,op.transactionHash);assert.equal((await inspectPendingClaim(root+'/journal',op.id)).reviewedMintPolicySHA256,inspected.reviewedMintPolicySHA256);await assert.rejects(takeReviewedSubmissionAttempt(root+'/journal',op.id),/attempt already exists/);assert.deepEqual(await state(),proof.initial);proof.recoveredSides??=[];assert(!proof.recoveredSides.includes(side));proof.recoveredSides.push(side);pass('Side'+side+' same-genesis restart reconciles exact original signature, economic deltas and review admission');if(proof.recoveredSides.length===2){proof.state='passed';proof.completedAt=new Date().toISOString();save();}}
}
try{if(phase==='run')await run();else if(['offline-0','offline-1','recover-0','recover-1'].includes(phase))await recovery(Number(phase.at(-1)),phase.startsWith('offline'));else throw Error('Unknown private phase');}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1000);save();throw error;}
