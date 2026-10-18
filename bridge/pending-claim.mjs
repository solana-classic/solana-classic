// Private rehearsal two-direction claim journal. No key creation, signing, broadcasts,
// fresh transaction construction or production endpoints. Keep records private.
import { constants, openSync, closeSync, fsyncSync, writeFileSync, readFileSync, renameSync, unlinkSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PublicKey, Transaction } from '@solana/web3.js';
import { encodeEvent, decodeEvent, validateEvent, nativeClaimInstruction, originClaimInstruction, TOKEN_2022, exactNativeUnits, observeLocalEvent, PUBLIC_GENESIS } from './sdk.mjs';
import { parseNativeTransactionRPC } from './lossless-native-rpc.mjs';
import { observePinnedProgram } from './program-pins.mjs';
import { checkedReviewedOriginMintPolicy, observeReviewedOriginAssets } from './reviewed-origin-mint.mjs';
import { inspectImmutableMint } from './mint-metadata.mjs';
import { claimReviewedMintPolicy, claimMintSnapshot, claimMintAdmission, checkClaimMintAdmission } from './claim-mint-policy.mjs';
import { claimPinPolicy, checkedClaimPinPolicy, checkClaimPinObservations } from './claim-pin-policy.mjs';
const soaking='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const states=new Set(['PREPARED','SUBMISSION_ATTEMPTED','PENDING','EXPIRED_UNRESOLVED','CONSUMED_REVIEW_REQUIRED','FAILED_REVIEW_REQUIRED','FINALIZED']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=v=>new PublicKey(v);
function base58(bytes) {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=BigInt('0x'+Buffer.from(bytes).toString('hex')), result='';
  while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}
  for(const b of bytes){if(b!==0)break;result='1'+result;}return result;
}
function endpoint(value) {
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Only explicit loopback rehearsal RPCs are supported');
  return u.href;
}
function privateDirectory(directory) {
  const path=resolve(directory),stat=lstatSync(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(path)!==path||(stat.mode&0o077)!==0)throw new Error('A real private directory with mode0700 is required');
  return path;
}
function persist(path,record,create=false) {
  const temporary=create?path:path+'.new';
  const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(record));fsyncSync(fd);}finally{closeSync(fd);}
  if(!create)renameSync(temporary,path);
  const parent=openSync(resolve(path,'..'),constants.O_RDONLY);try{fsyncSync(parent);}finally{closeSync(parent);}
}
function instruction(record,event) {
  return event.direction===0?nativeClaimInstruction({event,expected:event,payer:record.payer,committee:record.committee}):originClaimInstruction({event,expected:event,payer:record.payer,committee:record.committee,mint:record.originMint,destinationToken:record.destinationToken});
}
function verified(record) {
  if(![1,2,3].includes(record.schemaVersion)||!['isolated-native-claim','isolated-origin-redemption'].includes(record.scope)||!states.has(record.state))throw new Error('Invalid private claim record');
  if(!Number.isSafeInteger(record.lastValidBlockHeight)||record.lastValidBlockHeight<1||!Number.isSafeInteger(record.minimumDestinationSlot)||record.minimumDestinationSlot<0||!Number.isSafeInteger(record.sourceContextSlot)||record.sourceContextSlot<1)throw new Error('Invalid finality/expiry checkpoint');
  if(record.attempts!==0&&record.attempts!==1)throw new Error('Invalid submission count');
  if((record.state==='PREPARED')!==(record.attempts===0))throw new Error('Submission state/count mismatch');
  endpoint(record.rpc);endpoint(record.sourceRpc);
  const event=decodeEvent(Buffer.from(record.eventBase64,'base64'));
  validateEvent(event,event);
  if(record.scope!==(event.direction===0?'isolated-native-claim':'isolated-origin-redemption'))throw new Error('Claim direction/scope mismatch');
  if(BigInt(record.sourceContextSlot)<event.slot)throw new Error('Source checkpoint precedes the signed event');
  for(const g of [event.sourceChain,event.destinationChain])if(PUBLIC_GENESIS.has(g)||g===soaking)throw new Error('Public and soaking chains are forbidden');
  if(record.expectedGenesis!==event.destinationChain||record.eventHash!==hash(encodeEvent(event)))throw new Error('Claim chain/message mismatch');
  if(record.payer===event.recipient||record.committee.includes(record.payer))throw new Error('Rehearsal payer must be separate from recipient/committee');
  exactNativeUnits(event.originAmount,record.originDecimals);
  if(record.schemaVersion===1&&(record.programmePinPolicy!==undefined||record.programmePinAdmission!==undefined))throw new Error('Legacy records cannot declare unenforced programme pins');
  if(record.schemaVersion<3&&(record.reviewedMintPolicy!==undefined||record.reviewedMintAdmission!==undefined))throw new Error('Older records cannot declare unenforced reviewed mint admission');
  if(record.schemaVersion>=2){
    const policy=checkedClaimPinPolicy(record.programmePinPolicy,event,record.originMint);
    if(typeof record.programmePinHandoffAttempted!=='boolean'||!Number.isSafeInteger(record.preparedDestinationSlot)||record.preparedDestinationSlot<0||record.preparedDestinationSlot>record.minimumDestinationSlot)throw new Error('Invalid original pin-admission checkpoint');
    if(!record.programmePinHandoffAttempted&&(record.state==='SUBMISSION_ATTEMPTED'||record.attemptedAt!==undefined))throw new Error('Signed handoff lacks mandatory pin admission');
    if(!record.programmePinHandoffAttempted&&record.programmePinAdmission!==undefined)throw new Error('Unsubmitted pinned claim cannot have an attempt admission');
    if(record.programmePinHandoffAttempted){
      if(record.attempts!==1)throw new Error('Pinned handoff count differs');
      const admission=record.programmePinAdmission;
      if(!admission||admission.schemaVersion!==1||admission.scope!=='isolated-claim-pin-admission-v1'||admission.policySHA256!==policy.sha256||typeof admission.at!=='string'||!Number.isFinite(Date.parse(admission.at)))throw new Error('Pinned attempt admission is missing or changed');
      checkClaimPinObservations(policy,event,{...record,minimumDestinationSlot:record.preparedDestinationSlot},admission.source,admission.destination);
    }
  }
  if(record.schemaVersion===3){
    const programmePolicy=checkedClaimPinPolicy(record.programmePinPolicy,event,record.originMint);
    const mintPolicy=claimReviewedMintPolicy(record.reviewedMintPolicy,programmePolicy,event,record.originDecimals);
    if(!record.programmePinHandoffAttempted&&record.state==='FINALIZED')throw new Error('Reviewed finalization lacks mandatory handoff admission');
    if(record.programmePinHandoffAttempted)checkClaimMintAdmission(record.reviewedMintAdmission,mintPolicy,event,record,record.programmePinAdmission);
    else if(record.reviewedMintAdmission!==undefined)throw new Error('Unsubmitted reviewed claim cannot have mint handoff admission');
  }
  const ix=instruction(record,event);
  if(record.id!==ix.keys[3].pubkey.toBase58())throw new Error('Wrong receipt-derived operation ID');
  const raw=Buffer.from(record.transactionBase64,'base64');
  if(raw.length>1232||raw.toString('base64')!==record.transactionBase64||hash(raw)!==record.transactionHash)throw new Error('Signed transaction bytes changed');
  const tx=Transaction.from(raw);
  if(!tx.verifySignatures()||!tx.serialize().equals(raw)||!tx.feePayer?.equals(key(record.payer))||tx.instructions.length!==1||base58(tx.signature)!==record.signature)throw new Error('Signed transaction authority/signature mismatch');
  const actual=tx.instructions[0];
  if(!actual.programId.equals(ix.programId)||!actual.data.equals(ix.data)||actual.keys.length!==ix.keys.length||actual.keys.some((m,i)=>!m.pubkey.equals(ix.keys[i].pubkey)||m.isSigner!==ix.keys[i].isSigner||m.isWritable!==ix.keys[i].isWritable))throw new Error('Signed transaction does not match the exact claim');
  return {event,raw,tx,ix};
}
function locked(directory,id,action) {
  const root=privateDirectory(directory);
  if(typeof id!=='string'||! /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id))throw new Error('Invalid receipt ID');
  const path=join(root,id+'.json'),lock=path+'.lock';
  const fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);closeSync(fd);
  return (async()=>{
    try{
      const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>16384)throw new Error('Invalid private record file');
      const record=JSON.parse(readFileSync(path,'utf8'));const checked=verified(record);
      return await action(record,checked,next=>persist(path,next));
    }finally{unlinkSync(lock);}
  })();
}
async function rpc(record,method,params,fetcher,source=false) {
  const r=await fetcher(source?record.sourceRpc:record.rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error('Rehearsal RPC unavailable');
  const raw=await r.text();if(raw.length>65536)throw new Error('Rehearsal response exceeds bound');
  const d=method==='getTransaction'?parseNativeTransactionRPC(raw):JSON.parse(raw);if(d.jsonrpc!=='2.0'||d.id!==1||d.error||!Object.hasOwn(d,'result'))throw new Error('RPC rejected reconciliation');return d.result;
}
async function admit(record,fetcher) {
  if(await rpc(record,'getGenesisHash',[],fetcher)!==record.expectedGenesis)throw new Error('Destination genesis mismatch');
}
async function admitOriginalAccounts(record,event,ix,config,fetcher) {
  if(!config.subarray(136,168).equals(key(record.originMint).toBuffer()))throw new Error('Configured origin mint mismatch');
  const result=await rpc(record,'getMultipleAccounts',[[record.originMint,ix.keys[6].pubkey.toBase58(),record.destinationToken],{encoding:'base64',commitment:'finalized',minContextSlot:record.minimumDestinationSlot}],fetcher);
  if(!Number.isSafeInteger(result?.context?.slot)||result.context.slot<record.minimumDestinationSlot||result.value?.length!==3)throw new Error('Original account context is invalid');
  const [mint,escrow,recipient]=result.value.map(a=>{
    if(a?.owner!==TOKEN_2022||a.executable||a.data?.[1]!=='base64')throw new Error('Original account programme owner is invalid');
    const b=Buffer.from(a.data[0],'base64');if(b.toString('base64')!==a.data[0])throw new Error('Invalid original account encoding');return b;
  });
  // Older journals keep plain-mint admission. Version3 additionally requires
  // the exact committed immutable metadata review; account rules stay strict.
  if(record.schemaVersion===3){
    const policy=checkedReviewedOriginMintPolicy(record.reviewedMintPolicy),inspected=inspectImmutableMint(mint,record.originMint);
    if(inspected.layout!=='immutable-self-metadata-v1'||hash(mint)!==policy.expectedMintDataSHA256||inspected.supplyUnits!==policy.expectedSupplyUnits||inspected.decimals!==record.originDecimals||BigInt(inspected.supplyUnits)<event.originAmount)throw new Error('Original mint differs from reviewed metadata policy');
  }else if(mint.length!==82||mint.readUInt32LE(0)!==0||mint.readUInt32LE(46)!==0||mint[44]!==record.originDecimals||mint[45]!==1||mint.readBigUInt64LE(36)<event.originAmount)throw new Error('Original mint is mutable, unsupported or has wrong precision');
  for(const [bytes,owner] of [[escrow,ix.keys[2].pubkey],[recipient,key(event.recipient)]]) {
    const layout=bytes.length===165||(bytes.length===170&&bytes[165]===2&&bytes.readUInt16LE(166)===7&&bytes.readUInt16LE(168)===0);
    if(!layout||!bytes.subarray(0,32).equals(key(record.originMint).toBuffer())||!bytes.subarray(32,64).equals(owner.toBuffer())||bytes[108]!==1||bytes.readUInt32LE(72)!==0||bytes.readUInt32LE(109)!==0||bytes.readUInt32LE(129)!==0)throw new Error('Original escrow/recipient account authority or layout mismatch');
  }
  if(escrow.readBigUInt64LE(64)<event.originAmount)throw new Error('Original escrow is insufficient');
}
function verifyOriginalMovement(record,event,tx,ix,meta) {
  const keys=tx.compileMessage().accountKeys;
  const escrow=keys.findIndex(k=>k.equals(ix.keys[6].pubkey)),recipient=keys.findIndex(k=>k.equals(ix.keys[7].pubkey));
  const amount=(balances,index,owner)=>{
    if(!Array.isArray(balances))throw new Error('Missing original token balance metadata');
    const matches=balances.filter(v=>v.accountIndex===index);
    if(matches.length!==1)throw new Error('Ambiguous original token balance');
    const b=matches[0],value=b.uiTokenAmount?.amount;
    if(b.mint!==record.originMint||b.owner!==owner.toBase58()||b.programId!==TOKEN_2022||b.uiTokenAmount?.decimals!==record.originDecimals||typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>0xffffffffffffffffn)throw new Error('Original token balance identity/precision mismatch');
    return BigInt(value);
  };
  const change=(index,owner)=>amount(meta.postTokenBalances,index,owner)-amount(meta.preTokenBalances,index,owner);
  if(change(escrow,ix.keys[2].pubkey)!==-event.originAmount||change(recipient,key(event.recipient))!==event.originAmount)throw new Error('Finalized original token movement differs from signed return');
}
function summary(record) {return {id:record.id,signature:record.signature,eventHash:record.eventHash,transactionHash:record.transactionHash,state:record.state,attempts:record.attempts,productionReady:false};}

// Verified, read-only review input. Never return signed bytes, endpoints or keys.
// The existing exclusive lock coordinates with reconciliation; no save occurs.
export function inspectPendingClaim(directory,id) {
  return locked(directory,id,async(record,{event,ix})=>({
    ...summary(record),schemaVersion:record.schemaVersion,scope:record.scope,journalHash:hash(JSON.stringify(record)),
    bridge:event.bridge,sourceChain:event.sourceChain,destinationChain:event.destinationChain,
    sourceProgram:event.sourceProgram,destinationProgram:event.destinationProgram,
    sourceEvent:event.sourceEvent,recipient:event.recipient,nonce:event.nonce.toString(),
    epoch:event.epoch.toString(),originAmount:event.originAmount.toString(),
    nativeAmount:exactNativeUnits(event.originAmount,record.originDecimals).toString(),
    originDecimals:record.originDecimals,originMint:record.originMint,
    destinationToken:record.destinationToken,sourceContextSlot:record.sourceContextSlot,
    minimumDestinationSlot:record.minimumDestinationSlot,
    lastValidBlockHeight:record.lastValidBlockHeight,
    instructionHash:hash(ix.data),inspectionOnly:true,
    ...(record.schemaVersion>=2?{programmePinsHash:record.programmePinPolicy.sha256}:{}),
    ...(record.schemaVersion===3?{reviewedMintPolicySHA256:record.reviewedMintPolicy.sha256}:{}),
  }));
}

function prepareClaim({directory,sourceRpc,rpc:destinationRpc,event,expected,payer,committee,transaction,lastValidBlockHeight,originDecimals,sourceContextSlot,minimumDestinationSlot=0,originMint=null,destinationToken=null},programmePinPolicy=null,reviewedMintPolicy=null) {
  validateEvent(event,expected);
  const raw=Buffer.from(transaction),tx=Transaction.from(raw);
  const ix=event.direction===0?nativeClaimInstruction({event,expected,payer,committee}):originClaimInstruction({event,expected,payer,committee,mint:originMint,destinationToken});
  const record={schemaVersion:1,scope:event.direction===0?'isolated-native-claim':'isolated-origin-redemption',state:'PREPARED',attempts:0,id:ix.keys[3].pubkey.toBase58(),sourceRpc:endpoint(sourceRpc),rpc:endpoint(destinationRpc),expectedGenesis:event.destinationChain,payer:key(payer).toBase58(),committee:committee.map(k=>key(k).toBase58()),originDecimals,originMint:originMint?key(originMint).toBase58():null,destinationToken:destinationToken?key(destinationToken).toBase58():null,eventBase64:encodeEvent(event).toString('base64'),eventHash:hash(encodeEvent(event)),transactionBase64:raw.toString('base64'),transactionHash:hash(raw),signature:base58(tx.signature),lastValidBlockHeight,sourceContextSlot,minimumDestinationSlot,preparedAt:new Date().toISOString()};
  if(programmePinPolicy){record.schemaVersion=2;record.programmePinPolicy=programmePinPolicy;record.preparedDestinationSlot=minimumDestinationSlot;record.programmePinHandoffAttempted=false;}
  if(reviewedMintPolicy){record.schemaVersion=3;record.reviewedMintPolicy=reviewedMintPolicy;}
  verified(record);
  const root=privateDirectory(directory);persist(join(root,record.id+'.json'),record,true);
  return summary(record);
}
export function preparePendingClaim(args){if(Object.hasOwn(args,'reviewedMintPolicy'))throw new Error('Reviewed metadata requires explicit version3 preparation');return prepareClaim(args);}
export function preparePinnedPendingClaim(args){
  if(Object.hasOwn(args,'reviewedMintPolicy'))throw new Error('Reviewed metadata requires explicit version3 preparation');
  const policy=claimPinPolicy(args.programmePins,args.event,args.originMint?key(args.originMint).toBase58():null);
  return prepareClaim({...args,originMint:policy.source.originMint},policy);
}

export function prepareReviewedPendingClaim(args){
  const policy=claimPinPolicy(args.programmePins,args.event,args.originMint?key(args.originMint).toBase58():null);
  const reviewed=claimReviewedMintPolicy(args.reviewedMintPolicy,policy,args.event,args.originDecimals);
  return prepareClaim({...args,originMint:policy.source.originMint},policy,reviewed);
}

// Returns the existing signed bytes once only. The caller may submit exactly
// those bytes to the pinned private RPC. A crash before submission remains
// uncertain; this API never authorizes another attempt or signs replacements.
function takeAttempt(directory,id,fetcher,pinnedOnly,reviewedOnly=false) {
  return locked(directory,id,async(record,{event,raw,ix},save)=>{
    if(record.state!=='PREPARED')throw new Error('An attempt already exists; reconcile it, do not submit again');
    if(pinnedOnly&&record.schemaVersion<2)throw new Error('Pinned handoff requires a prepared version2 or version3 claim');
    if(reviewedOnly&&record.schemaVersion!==3)throw new Error('Reviewed handoff requires a prepared version3 claim');
    const policy=record.schemaVersion>=2?checkedClaimPinPolicy(record.programmePinPolicy,event,record.originMint):null;
    const reviewed=record.schemaVersion===3?claimReviewedMintPolicy(record.reviewedMintPolicy,policy,event,record.originDecimals):null;
    const observeMint=async minimum=>claimMintSnapshot(await observeReviewedOriginAssets({rpc:event.direction===0?record.sourceRpc:record.rpc,policy:reviewed,minimumContextSlot:minimum},fetcher),reviewed,event,minimum);
    const observePins=async(sourceMinimum,destinationMinimum)=>{
      // Sequential fixed private endpoints, while the receipt journal stays locked.
      const source=await observePinnedProgram({rpc:record.sourceRpc,pins:policy.source,minimumContextSlot:sourceMinimum},fetcher);
      const destination=await observePinnedProgram({rpc:record.rpc,pins:policy.destination,minimumContextSlot:destinationMinimum},fetcher);
      checkClaimPinObservations(policy,event,record,source,destination);
      return {source,destination};
    };
    const initialPins=policy?await observePins(record.sourceContextSlot,record.minimumDestinationSlot):null;
    const initialMint=reviewed?await observeMint(event.direction===0?Math.max(record.sourceContextSlot,initialPins.source.contextSlot):Math.max(record.minimumDestinationSlot,initialPins.destination.contextSlot)):null;
    const destinationMinimum=Math.max(record.minimumDestinationSlot,initialPins?.destination.contextSlot??0,event.direction===1?initialMint?.finalTokenContextSlot??0:0);
    await admit(record,fetcher);
    const height=await rpc(record,'getBlockHeight',[{commitment:'finalized'}],fetcher);
    if(!Number.isSafeInteger(height)||height<0||height>record.lastValidBlockHeight)throw new Error('Signed transaction expiry is not admissible');
    const receipt=await rpc(record,'getAccountInfo',[record.id,{encoding:'base64',commitment:'finalized',minContextSlot:destinationMinimum}],fetcher);
    if(!Number.isSafeInteger(receipt?.context?.slot)||receipt.context.slot<destinationMinimum||receipt.value!==null)throw new Error('Receipt already exists or destination context is invalid; reconcile first');
    const config=await rpc(record,'getAccountInfo',[ix.keys[1].pubkey.toBase58(),{encoding:'base64',commitment:'finalized',minContextSlot:destinationMinimum}],fetcher);
    const c=config.value?.data?.[1]==='base64'?Buffer.from(config.value.data[0],'base64'):Buffer.alloc(0);
    if(!Number.isSafeInteger(config.context?.slot)||config.context.slot<record.minimumDestinationSlot||config.value?.owner!==event.destinationProgram||config.value.executable||c.length!==382||c.subarray(0,8).toString()!=='SCCFG001'||!c.subarray(8,40).equals(key(event.bridge).toBuffer())||!c.subarray(40,72).equals(key(event.destinationChain).toBuffer())||!c.subarray(72,104).equals(key(event.sourceChain).toBuffer())||!c.subarray(104,136).equals(key(event.sourceProgram).toBuffer())||c[328]!==record.originDecimals||c[329]!==9||c[330]!==1-event.direction||c[331]!==3||c.readBigUInt64LE(332)!==event.epoch||c[341]!==0||record.committee.some(member=>![0,1,2,3,4].some(i=>c.subarray(168+i*32,200+i*32).equals(key(member).toBuffer()))))throw new Error('Configuration/precision/quorum differs from signed claim');
    if(policy&&(config.context.slot<destinationMinimum||hash(c.subarray(0,358))!==policy.destination.policySHA256))throw new Error('Current claim configuration differs from pinned policy');
    if(event.direction===1)await admitOriginalAccounts({...record,minimumDestinationSlot:destinationMinimum},event,ix,c,fetcher);
    const observation=await observeLocalEvent({rpc:record.sourceRpc,expectedGenesis:event.sourceChain,eventAddress:event.sourceEvent,expected:event,minimumContextSlot:Math.max(record.sourceContextSlot,initialPins?.source.contextSlot??0,event.direction===0?initialMint?.finalTokenContextSlot??0:0)},fetcher);
    if(!encodeEvent(observation.event).equals(encodeEvent(event)))throw new Error('Source event bytes changed');
    const finalMint=reviewed?await observeMint(Math.max(initialMint.finalTokenContextSlot,event.direction===0?observation.contextSlot:config.context.slot)):null;
    let finalPins;
    if(policy){
      finalPins=await observePins(Math.max(observation.contextSlot,initialPins.source.contextSlot,event.direction===0?finalMint?.finalTokenContextSlot??0:0),Math.max(config.context.slot,receipt.context.slot,initialPins.destination.contextSlot,event.direction===1?finalMint?.finalTokenContextSlot??0:0));
      const lateHeight=await rpc(record,'getBlockHeight',[{commitment:'finalized'}],fetcher);
      if(!Number.isSafeInteger(lateHeight)||lateHeight<height||lateHeight>record.lastValidBlockHeight)throw new Error('Signed transaction expired or height regressed during pin admission');
      const lateReceipt=await rpc(record,'getAccountInfo',[record.id,{encoding:'base64',commitment:'finalized',minContextSlot:finalPins.destination.contextSlot}],fetcher);
      if(!Number.isSafeInteger(lateReceipt?.context?.slot)||lateReceipt.context.slot<finalPins.destination.contextSlot||lateReceipt.value!==null)throw new Error('Receipt changed during pin admission; reconcile first');
    }
    await admit(record,fetcher);
    if(policy){record.programmePinAdmission={schemaVersion:1,scope:'isolated-claim-pin-admission-v1',policySHA256:policy.sha256,at:new Date().toISOString(),...finalPins};record.programmePinHandoffAttempted=true;}
    if(reviewed){record.reviewedMintAdmission=claimMintAdmission(reviewed,initialMint,finalMint);checkClaimMintAdmission(record.reviewedMintAdmission,reviewed,event,record,record.programmePinAdmission);}
    record.state='SUBMISSION_ATTEMPTED';record.attempts=1;record.attemptedAt=new Date().toISOString();save(record);
    return {rpc:record.rpc,rawTransaction:raw,signature:record.signature};
  });
}
export function takeSubmissionAttempt(directory,id,fetcher=fetch){return takeAttempt(directory,id,fetcher,false);}
export function takePinnedSubmissionAttempt(directory,id,fetcher=fetch){return takeAttempt(directory,id,fetcher,true);}
export function takeReviewedSubmissionAttempt(directory,id,fetcher=fetch){return takeAttempt(directory,id,fetcher,true,true);}

export function reconcilePendingClaim(directory,id,fetcher=fetch) {
  return locked(directory,id,async(record,{event,raw,tx,ix},save)=>{
    await admit(record,fetcher);
    const receipt=await rpc(record,'getAccountInfo',[record.id,{encoding:'base64',commitment:'finalized',minContextSlot:record.minimumDestinationSlot}],fetcher);
    if(!Number.isSafeInteger(receipt?.context?.slot)||receipt.context.slot<record.minimumDestinationSlot)throw new Error('Destination context precedes recovery checkpoint');
    if(receipt.value&&(receipt.value.owner!==event.destinationProgram||receipt.value.executable||receipt.value.data?.[1]!=='base64'||!Buffer.from(receipt.value.data[0],'base64').equals(key(event.sourceEvent).toBuffer())))throw new Error('Conflicting consumed receipt; retain pending state for review');
    const statuses=await rpc(record,'getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}],fetcher);
    if(!Array.isArray(statuses?.value)||statuses.value.length!==1)throw new Error('Invalid signature status response');
    const status=statuses.value[0];let next='PENDING';
    if(status?.confirmationStatus==='finalized'&&status.err)next='FAILED_REVIEW_REQUIRED';
    else if(status?.confirmationStatus==='finalized'&&status.err===null) {
      const landed=await rpc(record,'getTransaction',[record.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}],fetcher);
      if(!landed)next=receipt.value?'CONSUMED_REVIEW_REQUIRED':'PENDING';
      else {
        if(!receipt.value||landed.meta?.err!==null||!Number.isSafeInteger(landed.slot)||landed.slot!==status.slot||landed.slot>receipt.context.slot||landed.transaction?.[1]!=='base64'||!Buffer.from(landed.transaction[0],'base64').equals(raw))throw new Error('Finalized transaction/receipt mismatch');
        const keys=tx.compileMessage().accountKeys;const recipient=keys.findIndex(k=>k.toBase58()===event.recipient),vault=keys.findIndex(k=>k.equals(ix.keys[2].pubkey));
        if(landed.meta.preBalances.length!==keys.length||landed.meta.postBalances.length!==keys.length)throw new Error('Economic metadata does not match signed account count');
        const delta=index=>{const a=landed.meta.preBalances?.[index],b=landed.meta.postBalances?.[index];if(typeof a!=='bigint'||typeof b!=='bigint'||a<0n||b<0n||a>(1n<<64n)-1n||b>(1n<<64n)-1n)throw new Error('Invalid economic balance metadata');return b-a;};
        const amount=exactNativeUnits(event.originAmount,record.originDecimals);
        if(event.direction===0) {
          if(delta(recipient)!==amount||delta(vault)!==-amount)throw new Error('Finalized native movement differs from signed event');
        } else {
          if(delta(recipient)!==0n||delta(vault)!==0n)throw new Error('Unexpected native movement during original redemption');
          verifyOriginalMovement(record,event,tx,ix,landed.meta);
        }
        if(record.schemaVersion===3&&!record.programmePinHandoffAttempted)next='CONSUMED_REVIEW_REQUIRED';
        else{record.finalizedSlot=landed.slot;next='FINALIZED';}
      }
    } else if(receipt.value)next='CONSUMED_REVIEW_REQUIRED';
    else {
      const height=await rpc(record,'getBlockHeight',[{commitment:'finalized'}],fetcher);
      if(!Number.isSafeInteger(height)||height<0)throw new Error('Invalid finalized block height');
      next=height>record.lastValidBlockHeight?'EXPIRED_UNRESOLVED':record.state==='PREPARED'?'PREPARED':'PENDING';
    }
    await admit(record,fetcher);
    // Never regress a known finalized record because a later RPC is missing
    // history. Conflicting observations stop reconciliation and keep evidence.
    if(record.state==='FINALIZED'&&next!=='FINALIZED')throw new Error('Previously finalized claim is no longer verifiable');
    record.state=next;if(next!=='PREPARED')record.attempts=1;record.minimumDestinationSlot=receipt.context.slot;record.reconciledAt=new Date().toISOString();save(record);
    return summary(record);
  });
}
