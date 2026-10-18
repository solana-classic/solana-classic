// Private archive-restore verification only. Simulations never broadcast.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Connection,PublicKey,Keypair,Transaction} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID as TOKEN,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {PUBLIC_GENESIS,decodeEvent,observeLocalEvent,nativeClaimInstruction,originClaimInstruction} from './sdk.mjs';
import {checkedClaimPinPolicy} from './claim-pin-policy.mjs';
import {checkedReviewedOriginMintPolicy,observeReviewedOriginAssets} from './reviewed-origin-mint.mjs';
import {observePinnedProgram} from './program-pins.mjs';
import {inspectPendingClaim} from './pending-claim.mjs';
import {parseNativeAccountsRPC} from './lossless-native-rpc.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function checkMetadataRestore({directory:root,phase}){
 assert.equal(typeof root,'string');assert(['baseline','verify'].includes(phase));
 assert(fs.lstatSync(root).isDirectory());assert.equal(fs.statSync(root).mode&0o777,0o700);
 function persist(name,value){const fd=fs.openSync(root+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 const read=name=>JSON.parse(fs.readFileSync(root+'/'+name));
 persist('phase-'+phase+'-reserved-private.json',{phase});
 const input=read('private-input.json'),prior=read('baseline-result-private.json'),review=checkedReviewedOriginMintPolicy(read('selected-review-private.json'));
 assert.equal(input.scope,'fresh-private-metadata-journal');assert.deepEqual(input.ports,[26899,27899]);assert.equal(prior.state,'passed');assert(prior.processes.allStopped&&prior.settlementAccepted);
 assert.equal(prior.operation.state,'FINALIZED');assert.equal(prior.canonicalNetworkChanged,false);assert.equal(prior.productionReady,false);
 assert.equal(new Set(input.genesi).size,2);assert(input.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
 const pub=name=>new PublicKey(Uint8Array.from(input.keys[name].slice(32))),payer=pub('payer'),user=pub('originUser'),nativeUser=pub('nativeUser'),mint=pub('mint'),bridge=new PublicKey(input.bridge),members=[0,1,2].map(i=>pub('member'+i));
 const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),pda=(seeds,program)=>PublicKey.findProgramAddressSync(seeds,program)[0];
 const sides=[0,1].map(i=>{const program=new PublicKey(input.programs[i]),config=pda([Buffer.from('config'),bridge.toBuffer()],program);return {i,program,config,genesis:input.genesi[i],vault:pda([Buffer.from('vault'),config.toBuffer()],program),programData:pda([program.toBuffer()],loader),connection:new Connection('http://127.0.0.1:'+input.ports[i],'finalized')};});
 const [origin,native]=sides,tokens=getAssociatedTokenAddressSync(mint,user,false,TOKEN),escrow=pda([Buffer.from('escrow'),origin.config.toBuffer()],origin.program);
 const records=[];
 for(const id of read('selected-journals-private.json')){
  const inspected=await inspectPendingClaim(root+'/journal',id),record=JSON.parse(fs.readFileSync(root+'/journal/'+id+'.json'));assert.equal(hash(JSON.stringify(record)),inspected.journalHash);assert.equal(record.schemaVersion,3);assert.equal(record.state,'FINALIZED');assert.equal(record.attempts,1);
  const event=decodeEvent(Buffer.from(record.eventBase64,'base64')),nativeClaim=record.scope==='isolated-native-claim';
  assert(nativeClaim||record.scope==='isolated-origin-redemption');assert.equal(event.direction,nativeClaim?0:1);
  const source=nativeClaim?origin:native,destination=nativeClaim?native:origin;
  assert.equal(event.sourceChain,source.genesis);assert.equal(event.destinationChain,destination.genesis);assert.equal(event.sourceProgram,source.program.toBase58());assert.equal(event.destinationProgram,destination.program.toBase58());
  const pins=checkedClaimPinPolicy(record.programmePinPolicy,event,mint.toBase58());assert.deepEqual(review.pins,nativeClaim?pins.source:pins.destination);assert.equal(record.reviewedMintPolicy.sha256,review.sha256);
  const eventKey=new PublicKey(event.sourceEvent);
  const receipt=pda([Buffer.from('claim'),destination.config.toBuffer(),eventKey.toBuffer()],destination.program);assert.equal(receipt.toBase58(),record.id);
  records.push({record,inspected,event,eventKey,receipt,source,destination,pins});
 }
 assert.equal(records.length,2);assert.equal(new Set(records.map(row=>row.source.i)).size,2);
 origin.addresses=[origin.config,origin.vault,origin.program,origin.programData,mint,escrow,tokens,user,payer];
 native.addresses=[native.config,native.vault,native.program,native.programData,nativeUser,payer];
 for(const row of records){row.source.addresses.push(row.eventKey);row.destination.addresses.push(row.receipt);}
 let proof=phase==='baseline'?{schemaVersion:1,state:'running',scope:'Selected metadata-token accounts and consumed receipts across private same-host archive restore',checks:[],broadcasts:0,simulations:0,canonicalNetworkChanged:false,actualConsensusVerified:false,completeGenesisBackingVerified:false,productionReady:false}:read('private-result.json');
 const save=()=>fs.writeFileSync(root+'/private-result.json',JSON.stringify(proof,null,2)),pass=name=>{proof.checks.push(name);save();};
 const previous=phase==='verify'?read('checkpoint-private.json'):null;
 async function snapshot(side,minimum){
  assert.equal(await side.connection.getGenesisHash(),side.genesis);
  const response=await fetch(side.connection.rpcEndpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[side.addresses.map(key=>key.toBase58()),{encoding:'base64',commitment:'finalized',minContextSlot:minimum}]}),signal:AbortSignal.timeout(5000)});
  assert(response.ok&&response.body);const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;assert(bytes<=2*1024*1024,'Account snapshot exceeds bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel();reader.releaseLock();}
  const current=parseNativeAccountsRPC(Buffer.concat(chunks).toString('utf8')).result;assert(current.context.slot>=minimum);assert.equal(current.value.length,side.addresses.length);assert(current.value.every(Boolean));
  current.value=current.value.map(value=>{assert.equal(typeof value.executable,'boolean');assert(Array.isArray(value.data)&&value.data.length===2&&value.data[1]==='base64');const data=Buffer.from(value.data[0],'base64');assert(data.length<=1024*1024&&data.toString('base64')===value.data[0]);return {...value,owner:new PublicKey(value.owner),data};});
  const values=current.value;assert(values[0].owner.equals(side.program));assert.equal(values[0].data.length,382);assert.equal(values[0].data.readBigUInt64LE(374),0n);
  assert(values[1].owner.equals(side.program));assert.equal(values[1].data.length,16);assert.equal(values[1].data.subarray(0,8).toString(),'SCVLT002');
  if(side.i===0){assert(values[4].owner.equals(TOKEN));assert.equal(hash(values[4].data),review.expectedMintDataSHA256);assert(values[5].owner.equals(TOKEN));assert.equal(values[5].data.readBigUInt64LE(64),0n);assert(values[6].owner.equals(TOKEN));assert.equal(values[6].data.readBigUInt64LE(64),2000000n);}
  else{assert.equal(String(values[1].lamports),prior.final.reserveNativeUnits);assert.equal(String(values[1].data.readBigUInt64LE(8)),prior.final.protectedFloorNativeUnits);}
  const accounts=values.map((value,i)=>{assert.equal(typeof value.lamports,'bigint');return {address:side.addresses[i].toBase58(),owner:value.owner.toBase58(),executable:value.executable,lamports:String(value.lamports),dataSHA256:hash(value.data),bytes:value.data.length};});
  assert.equal(await side.connection.getGenesisHash(),side.genesis);return {contextSlot:current.context.slot,accounts};
 }
 try{
  save();const snapshots=[];
  for(const side of sides)snapshots.push(await snapshot(side,previous?.[side.i].contextSlot??1));
  for(const row of records){
   const observed=await observeLocalEvent({rpc:row.source.connection.rpcEndpoint,expectedGenesis:row.source.genesis,eventAddress:row.eventKey.toBase58(),minimumContextSlot:previous?.[row.source.i].contextSlot??row.record.sourceContextSlot,expected:row.event});assert.deepEqual(observed.event,row.event);
   const receipt=await row.destination.connection.getAccountInfo(row.receipt,'finalized');assert(receipt.owner.equals(row.destination.program));assert(receipt.data.equals(row.eventKey.toBuffer()));
   for(const [side,pins] of [[row.source,row.pins.source],[row.destination,row.pins.destination]])assert.equal((await observePinnedProgram({rpc:side.connection.rpcEndpoint,pins,minimumContextSlot:previous?.[side.i].contextSlot??1})).outstandingUnits,'0');
  }
  await observeReviewedOriginAssets({rpc:origin.connection.rpcEndpoint,policy:review,minimumContextSlot:previous?.[0].contextSlot??1});
  pass('Selected immutable metadata, token and bridge code/authority pins, exact settled counters, protected reserve and both consumed receipts match retained private policy');
  if(phase==='baseline'){
   persist('checkpoint-private.json',snapshots);proof.accountCounts=snapshots.map(row=>row.accounts.length);proof.baselineSlots=snapshots.map(row=>row.contextSlot);save();return proof;
  }
  assert.deepEqual(snapshots.map(row=>row.accounts),previous.map(row=>row.accounts));pass('Archive-restored selected account bytes, owners and balances match working-copy baseline at or above its finalized checkpoints');
  for(const row of records){
   assert.equal(await row.destination.connection.getGenesisHash(),row.destination.genesis);
   const recent=await row.destination.connection.getLatestBlockhash('finalized'),args={event:row.event,expected:row.event,payer,committee:members};
   const instruction=row.source.i===0?nativeClaimInstruction(args):originClaimInstruction({...args,mint,destinationToken:tokens});
   const tx=new Transaction({feePayer:payer,...recent}).add(instruction);tx.sign(...['payer','member0','member1','member2'].map(name=>Keypair.fromSecretKey(Uint8Array.from(input.keys[name]))));
   const result=await row.destination.connection.simulateTransaction(tx);assert.deepEqual(result.value.err,{InstructionError:[0,'AccountAlreadyInitialized']});assert(result.value.logs.some(line=>line.includes(row.destination.program.toBase58())&&line.includes('invoke')));proof.simulations++;save();
  }
  pass('Actual compiled bridge rejects both consumed settlements in simulations after archive restore; no broadcasts');
  for(const side of sides)assert.deepEqual((await snapshot(side,previous[side.i].contextSlot)).accounts,previous[side.i].accounts);
  for(const row of records)assert.equal((await inspectPendingClaim(root+'/journal',row.record.id)).journalHash,row.inspected.journalHash);
  pass('Rejected simulations preserve selected account state and both exact version3 signed journals');
  proof.state='passed';proof.completedAt=new Date().toISOString();save();return proof;
 }catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1000);save();throw error;}
}
