// Finalized selected-block diagnostics on private copies; no signing or submissions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins,observePinnedProgram} from './program-pins.mjs';
import {inspectReturnedProgramSnapshot} from './event-inventory.mjs';
import {reviewSelectedSourceTransaction} from './source-economic-review.mjs';
import {createSourceEvidenceWriter} from './source-economic-evidence.mjs';
const shape=(v,required,optional=[])=>{assert(v&&typeof v==='object'&&!Array.isArray(v));assert(required.every(k=>Object.hasOwn(v,k)));assert(Object.keys(v).every(k=>required.includes(k)||optional.includes(k)));};
const key=v=>{assert.equal(typeof v,'string');assert.equal(new PublicKey(v).toBase58(),v);};
export function extractSelectedBlockTransaction({raw,signature,slot}){
 assert(typeof raw==='string'&&Buffer.byteLength(raw)<=65536);assert(typeof signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature));assert(Number.isSafeInteger(slot)&&slot>0);
 const data=JSON.parse(raw);shape(data,['jsonrpc','id','result']);assert.equal(data.jsonrpc,'2.0');assert.equal(data.id,1);
 const b=data.result;assert(b,'Selected finalized block unavailable');shape(b,['blockhash','previousBlockhash','parentSlot','transactions'],['blockTime','blockHeight','rewards','numRewardPartitions']);key(b.blockhash);key(b.previousBlockhash);assert(Number.isSafeInteger(b.parentSlot)&&b.parentSlot>=0&&b.parentSlot<slot);assert(b.blockTime===undefined||b.blockTime===null||Number.isSafeInteger(b.blockTime));assert(b.blockHeight===undefined||b.blockHeight===null||Number.isSafeInteger(b.blockHeight)&&b.blockHeight>=0);
 if(b.rewards!==undefined){assert(Array.isArray(b.rewards)&&b.rewards.length<=256);for(const reward of b.rewards){shape(reward,['pubkey','lamports','postBalance','rewardType','commission']);key(reward.pubkey);assert(Number.isSafeInteger(reward.lamports)&&Number.isFinite(reward.postBalance)&&reward.postBalance>=0);assert(['Fee','Rent','Voting','Staking'].includes(reward.rewardType)||reward.rewardType===null);assert(reward.commission===null||Number.isInteger(reward.commission)&&reward.commission>=0&&reward.commission<=100);}}assert(Array.isArray(b.transactions)&&b.transactions.length>0&&b.transactions.length<=256);
 const matches=[];b.transactions.forEach((v,i)=>{shape(v,['transaction','meta','version']);assert(Array.isArray(v.transaction?.signatures));if(v.transaction.signatures.includes(signature))matches.push(i);});assert.equal(matches.length,1,'Exact selected signature must occur once in returned block');
 const index=matches[0];assert.equal(b.transactions[index].transaction.signatures[0],signature);assert.equal(b.transactions[index].version,'legacy');assert(b.transactions[index].meta);
 // Re-emit original number tokens before Number can round native balances or fees.
 const exact=JSON.parse(raw,(_k,v,c)=>typeof v==='number'?JSON.rawJSON(c.source):v),row=exact.result.transactions[index];
 const result={slot,transaction:row.transaction,meta:row.meta,version:row.version};if(Object.hasOwn(b,'blockTime'))result.blockTime=exact.result.blockTime;
 const selected=JSON.stringify({jsonrpc:'2.0',id:1,result});assert(Buffer.byteLength(selected)<=65536);return selected;
}
export async function observeSelectedBlockHistory(options,fetcher=fetch){
 shape(options,['rpc','pins','snapshot','signature','sourceEvent','evidenceDirectory'],['timeoutMs']);
 const u=new URL(options.rpc);assert(['http:','https:'].includes(u.protocol)&&['127.0.0.1','[::1]'].includes(u.hostname)&&u.port&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password);
 const rpc=u.href,pins=normalizeProgramPins(options.pins),snapshot=structuredClone(options.snapshot),signature=options.signature,sourceEvent=options.sourceEvent,timeout=options.timeoutMs??15000;
 assert(Number.isInteger(timeout)&&timeout>=100&&timeout<=30000);assert.equal(typeof fetcher,'function');assert(typeof signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature));
 const selected=inspectReturnedProgramSnapshot(snapshot,pins,1),event=selected.events.get(sourceEvent);assert(event);const slot=Number(event.slot);assert(Number.isSafeInteger(slot)&&slot>0);
 const directory=options.evidenceDirectory,began=performance.now(),controller=new AbortController();let calls=0,wireBytes=0;
 const evidence=createSourceEvidenceWriter(directory,{pins,snapshot,signature,sourceEvent,slot,scope:'private-selected-finalized-block-diagnostic-v1'});
 const expire=()=>Error('Selected source history exceeded its single deadline');
 const check=()=>{if(!controller.signal.aborted&&performance.now()-began>=timeout)controller.abort(expire());if(controller.signal.aborted)throw controller.signal.reason;};
 const timer=setTimeout(()=>controller.abort(expire()),timeout),cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
 const guarded=async(url,init)=>{
  check();const q=JSON.parse(init.body);assert.equal(url,rpc);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(q.jsonrpc,'2.0');assert.equal(q.id,1);assert(['getGenesisHash','getMultipleAccounts','getTransaction','getSignatureStatuses','getBlock','getBlocks','getFirstAvailableBlock','minimumLedgerSlot'].includes(q.method)&&++calls<=14);
  const signal=AbortSignal.any([controller.signal,init.signal]),response=await fetcher(rpc,{...init,signal});
  try{check();}catch(error){void response.body?.cancel().catch(()=>{});throw error;}
  assert(response.ok&&!response.redirected&&response.body&&response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()==='application/json');
  const maximum=['getGenesisHash','getMultipleAccounts'].includes(q.method)?2097152:65536,declared=response.headers.get('content-length');if(declared!==null)assert(/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=maximum);
  const reader=response.body.getReader(),chunks=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){check();if(signal.aborted)throw signal.reason;const {done,value}=await reader.read();if(done)break;size+=value.byteLength;wireBytes+=value.byteLength;assert(size<=maximum&&wireBytes<=8388608,'Selected history wire bounds exceeded');chunks.push(Buffer.from(value));}check();if(signal.aborted)throw signal.reason;}
  finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  return new Response(Buffer.concat(chunks),{headers:{'Content-Type':'application/json'}});
 };
 const work=async()=>{
  const before=await observePinnedProgram({rpc,pins,minimumContextSlot:snapshot.contextSlot},guarded);assert.equal(before.outstandingUnits,selected.policy.outstanding.toString());
  const queries=[['transaction','getTransaction',[signature,{commitment:'finalized',encoding:'json',maxSupportedTransactionVersion:0}]],['status','getSignatureStatuses',[[signature],{searchTransactionHistory:true}]],['block','getBlock',[slot,{commitment:'finalized',encoding:'json',transactionDetails:'full',rewards:true,maxSupportedTransactionVersion:0}]],['range','getBlocks',[slot,slot,{commitment:'finalized'}]],['first','getFirstAvailableBlock',[]],['minimum','minimumLedgerSlot',[]]];
  const responses={},raws={};
  for(const [name,method,params] of queries){
   check();const child=join(directory,name);fs.mkdirSync(child,{mode:0o700});const saved=createSourceEvidenceWriter(child,{method,params,pins,signature,sourceEvent,slot});
   try{const reply=await guarded(rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const raw=await reply.text();check();saved.response(raw,before.contextSlot);check();const decoded=JSON.parse(raw);assert.equal(decoded.jsonrpc,'2.0');assert.equal(decoded.id,1);assert(Object.hasOwn(decoded,'result')!==Object.hasOwn(decoded,'error'));if(Object.hasOwn(decoded,'error')){shape(decoded.error,['code','message'],['data']);assert(Number.isInteger(decoded.error.code)&&typeof decoded.error.message==='string');}responses[name]=decoded;raws[name]=raw;}finally{saved.close();}
  }
  evidence.response(raws.block,before.contextSlot);check();
  let review,reason='';try{const raw=extractSelectedBlockTransaction({raw:raws.block,signature,slot});review=reviewSelectedSourceTransaction({raw,pins,snapshot,signature,sourceEvent});}catch(error){reason=String(error.message).slice(0,400);}
  const after=await observePinnedProgram({rpc,pins,minimumContextSlot:before.contextSlot},guarded);assert.equal(after.outstandingUnits,before.outstandingUnits);check();
  const permissions=Object.fromEntries(['chainInclusionVerified','transactionMetadataIndependentlyVerified','historicalCodeVerified','historicalCountersVerified','feeScheduleIndependentlyVerified','completeSourceEventInventoryVerified','sourceEconomicMovementsIndependentlyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'].map(k=>[k,false]));
  const range=responses.range.result,first=responses.first.result,minimum=responses.minimum.result,status=responses.status.result;
  assert(responses.range.error||Array.isArray(range)&&range.length<=1&&range.every(v=>v===slot));assert(responses.first.error||Number.isSafeInteger(first)&&first>=0);assert(responses.minimum.error||Number.isSafeInteger(minimum)&&minimum>=0);assert(responses.status.error||Number.isSafeInteger(status?.context?.slot)&&status.context.slot>=before.contextSlot&&Array.isArray(status.value)&&status.value.length===1);
  const result={...review,...permissions,scope:'Selected finalized block metadata on same-host private copies; not independent history, consensus, historical code or recovery approval',state:review?'selected-block-metadata-matched':'blocked-history-unavailable',selectedBlockMetadataMatched:!!review,selectedCurrentCodeBracketsObserved:true,transactionLookupReturnedNull:responses.transaction.result===null,selectedSlotReturnedByFinalizedRange:Array.isArray(range)&&range.includes(slot),firstAvailableBlock:first??null,minimumLedgerSlot:minimum??null,selectedSlot:slot,selectedSlotPrecedesFirstAvailableBlock:Number.isSafeInteger(first)&&slot<first,statusLookupReturnedNull:status?.value?.[0]===null,blockRPCErrorCode:responses.block.error?.code??null,blockResponseReturnedNull:responses.block.result===null,readOnlyRequests:calls,wireBytes,firstCodeContextSlot:before.contextSlot,finalCodeContextSlot:after.contextSlot,singleDeadlineMs:timeout,durationMs:Math.round(performance.now()-began),failure:reason};
  evidence.observation(result);check();return result;
 };
 try{return await Promise.race([work(),cancelled]);}finally{try{evidence.close();}finally{clearTimeout(timer);if(!controller.signal.aborted)controller.abort(Error('Selected block history closed'));}}
}
