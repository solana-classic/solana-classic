// Initial private source metadata capture. No signing, submission or retry interface.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Transaction,PublicKey} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {collectReturnedProgramAccounts} from './program-account-collector.mjs';
import {reviewSelectedSourceTransaction} from './source-economic-review.mjs';
import {createSourceEvidenceWriter} from './source-economic-evidence.mjs';
const require=createRequire(import.meta.url),bs58=createRequire(require.resolve('@solana/web3.js'))('bs58'),hash=b=>createHash('sha256').update(b).digest('hex');
const shape=(v,required,optional=[])=>{assert(v&&typeof v==='object'&&!Array.isArray(v));assert(required.every(k=>Object.hasOwn(v,k)));assert(Object.keys(v).every(k=>required.includes(k)||optional.includes(k)));};
export async function captureInitialSourceConfirmation(options,fetcher=fetch){
 shape(options,['rpc','pins','transactionBase64','sourceEvent','minimumContextSlot','evidenceDirectory'],['timeoutMs']);
 const u=new URL(options.rpc);assert(['http:','https:'].includes(u.protocol)&&['127.0.0.1','[::1]'].includes(u.hostname)&&u.port&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password);
 const rpc=u.href,pins=normalizeProgramPins(options.pins),sourceEvent=options.sourceEvent,minimum=options.minimumContextSlot,directory=options.evidenceDirectory,timeout=options.timeoutMs??15000;
 assert(Number.isSafeInteger(minimum)&&minimum>0);assert(Number.isInteger(timeout)&&timeout>=100&&timeout<=30000);assert.equal(typeof fetcher,'function');assert(typeof options.transactionBase64==='string'&&options.transactionBase64.length<=1644);const signed=Buffer.from(options.transactionBase64,'base64');assert(signed.length<=1232&&signed.toString('base64')===options.transactionBase64);const tx=Transaction.from(signed);assert(tx.verifySignatures()&&tx.instructions.length===1);assert(tx.serialize().equals(signed));
 const ix=tx.instructions[0];assert.equal(ix.programId.toBase58(),pins.program);assert.equal(ix.data.length,49);assert.equal(ix.data[0],1);assert.equal(ix.keys[3]?.pubkey.toBase58(),sourceEvent);assert.equal(new PublicKey(sourceEvent).toBase58(),sourceEvent);const signature=bs58.encode(tx.signature),signedSourceSHA256=hash(signed);
 const began=performance.now(),controller=new AbortController();let calls=0,wireBytes=0;
 const evidence=createSourceEvidenceWriter(directory,{scope:'private-initial-source-confirmation-v1',pins,signature,sourceEvent,signedSourceSHA256,minimumSelectedContextSlot:minimum});
 const expire=()=>Error('Selected source history exceeded its single deadline');
 const check=()=>{if(!controller.signal.aborted&&performance.now()-began>=timeout)controller.abort(expire());if(controller.signal.aborted)throw controller.signal.reason;};
 const timer=setTimeout(()=>controller.abort(expire()),timeout),cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
 const guarded=async(url,init)=>{
  check();const q=JSON.parse(init.body);assert.equal(url,rpc);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(q.jsonrpc,'2.0');assert.equal(q.id,1);assert(['getGenesisHash','getMultipleAccounts','getProgramAccounts','getTransaction','getSignatureStatuses'].includes(q.method)&&++calls<=14);
  const signal=AbortSignal.any([controller.signal,init.signal]),response=await fetcher(rpc,{...init,signal});
  try{check();}catch(error){void response.body?.cancel().catch(()=>{});throw error;}
  assert(response.ok&&!response.redirected&&response.body&&response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()==='application/json');
  const maximum=q.method==='getProgramAccounts'?262144:['getGenesisHash','getMultipleAccounts'].includes(q.method)?2097152:65536,declared=response.headers.get('content-length');if(declared!==null)assert(/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=maximum);
  const reader=response.body.getReader(),chunks=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){check();if(signal.aborted)throw signal.reason;const {done,value}=await reader.read();if(done)break;size+=value.byteLength;wireBytes+=value.byteLength;assert(size<=maximum&&wireBytes<=8388608,'Selected history wire bounds exceeded');chunks.push(Buffer.from(value));}check();if(signal.aborted)throw signal.reason;}
  finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  return new Response(Buffer.concat(chunks),{headers:{'Content-Type':'application/json'}});
 };
 const work=async()=>{
  const request=async(method,params)=>{const reply=await guarded(rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const raw=await reply.text();check();return raw;};
  const decode=raw=>{const d=JSON.parse(raw);shape(d,['jsonrpc','id','result']);assert.equal(d.jsonrpc,'2.0');assert.equal(d.id,1);return d.result;};
  assert.equal(decode(await request('getGenesisHash',[])),pins.genesis);
  const raw=await request('getTransaction',[signature,{commitment:'finalized',encoding:'json',maxSupportedTransactionVersion:0}]);
  evidence.response(raw,{minimumSelectedContextSlot:minimum});check();const transaction=decode(raw);assert(transaction,'Initial finalized source metadata unavailable; retain source obligation');assert(Number.isSafeInteger(transaction.slot)&&transaction.slot>=minimum);assert.equal(transaction.transaction?.signatures?.[0],signature);
  const statusDirectory=join(directory,'signature-status');fs.mkdirSync(statusDirectory,{mode:0o700});const statusEvidence=createSourceEvidenceWriter(statusDirectory,{method:'getSignatureStatuses',signature,pins,minimumSelectedContextSlot:minimum});let status;
  try{const statusRaw=await request('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);statusEvidence.response(statusRaw,{minimumSelectedContextSlot:minimum});check();status=decode(statusRaw);shape(status,['context','value']);assert(Number.isSafeInteger(status.context?.slot)&&status.context.slot>=transaction.slot);assert(Array.isArray(status.value)&&status.value.length===1);const selected=status.value[0];shape(selected,['slot','confirmationStatus','confirmations','err'],['status']);if(Object.hasOwn(selected,'status'))assert.deepEqual(selected.status,{Ok:null});assert(selected.slot===transaction.slot&&selected.confirmationStatus==='finalized'&&selected.confirmations===null&&selected.err===null,'Initial source signature must report finalized success');}finally{statusEvidence.close();}
  assert.equal(decode(await request('getGenesisHash',[])),pins.genesis);check();
  const collected=await collectReturnedProgramAccounts({rpc,pins,minimumContextSlot:Math.max(minimum,transaction.slot),timeoutMs:timeout},guarded);check();
  const review=reviewSelectedSourceTransaction({raw,pins,snapshot:collected.snapshot,signature,sourceEvent});assert.equal(review.transactionSHA256,signedSourceSHA256,'Returned source bytes differ from original signed request');check();
  const result={...review,scope:'Initial finalized source RPC metadata durably retained before later account collection and claim preparation; not independent finality, historical code or settlement approval',rpcObservationExecuted:true,captureCompleted:true,rawResponseRetainedBeforeCollection:true,initialSourceFinalizedRPCStatusObserved:true,signedSourceSHA256,sourceSnapshotContextSlot:collected.snapshot.contextSlot,selectedCurrentCodeBracketsObserved:true,readOnlyRequests:calls,wireBytes,singleDeadlineMs:timeout,durationMs:Math.round(performance.now()-began),canPrepareProductionClaim:false};
  evidence.observation({...result,privateSourceSnapshot:collected.snapshot});check();return result;
 };
 try{return await Promise.race([work(),cancelled]);}finally{try{evidence.close();}finally{clearTimeout(timer);if(!controller.signal.aborted)controller.abort(Error('Initial source capture closed'));}}
}
