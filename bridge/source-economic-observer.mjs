// Bounded read-only private transaction lookup. Results and raw responses are private.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {normalizeProgramPins,observePinnedProgram} from './program-pins.mjs';
import {inspectReturnedProgramSnapshot} from './event-inventory.mjs';
import {createSourceEvidenceWriter} from './source-economic-evidence.mjs';
import {reviewSelectedSourceTransaction} from './source-economic-review.mjs';
export async function observeSelectedSourceTransaction(options,fetcher=fetch){
 assert(options&&typeof options==='object'&&!Array.isArray(options));const required=['rpc','pins','snapshot','signature','sourceEvent'];assert(required.every(k=>Object.hasOwn(options,k)));assert(Object.keys(options).every(k=>required.includes(k)||['timeoutMs','evidenceDirectory'].includes(k)));
 const u=new URL(options.rpc);assert(['http:','https:'].includes(u.protocol)&&['127.0.0.1','[::1]'].includes(u.hostname)&&u.port&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password);
 const rpc=u.href,pins=normalizeProgramPins(options.pins),snapshot=structuredClone(options.snapshot),signature=options.signature,sourceEvent=options.sourceEvent,timeout=options.timeoutMs??15000;
 assert(Number.isInteger(timeout)&&timeout>=100&&timeout<=30000);assert.equal(typeof fetcher,'function');assert(typeof signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature));
 const selected=inspectReturnedProgramSnapshot(snapshot,pins,1);assert(selected.events.has(sourceEvent));
 const began=performance.now(),controller=new AbortController();let calls=0,wireBytes=0;
 const evidence=options.evidenceDirectory===undefined?undefined:createSourceEvidenceWriter(options.evidenceDirectory,{pins,snapshot,signature,sourceEvent});
 const expire=()=>Error('Selected source history exceeded its single deadline');
 const check=()=>{if(!controller.signal.aborted&&performance.now()-began>=timeout)controller.abort(expire());if(controller.signal.aborted)throw controller.signal.reason;};
 const timer=setTimeout(()=>controller.abort(expire()),timeout),cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
 const guarded=async(url,init)=>{
  check();const q=JSON.parse(init.body);assert.equal(url,rpc);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(q.jsonrpc,'2.0');assert.equal(q.id,1);assert(['getGenesisHash','getMultipleAccounts','getTransaction'].includes(q.method)&&++calls<=9);
  const signal=AbortSignal.any([controller.signal,init.signal]),response=await fetcher(rpc,{...init,signal});
  try{check();}catch(error){void response.body?.cancel().catch(()=>{});throw error;}
  assert(response.ok&&!response.redirected&&response.body&&response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()==='application/json');
  const maximum=q.method==='getTransaction'?65536:2097152,declared=response.headers.get('content-length');if(declared!==null)assert(/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=maximum);
  const reader=response.body.getReader(),chunks=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){check();if(signal.aborted)throw signal.reason;const {done,value}=await reader.read();if(done)break;size+=value.byteLength;wireBytes+=value.byteLength;assert(size<=maximum&&wireBytes<=8388608,'Selected history wire bounds exceeded');chunks.push(Buffer.from(value));}check();if(signal.aborted)throw signal.reason;}
  finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  return new Response(Buffer.concat(chunks),{headers:{'Content-Type':'application/json'}});
 };
 const work=async()=>{
  const before=await observePinnedProgram({rpc,pins,minimumContextSlot:snapshot.contextSlot},guarded);assert.equal(before.outstandingUnits,selected.policy.outstanding.toString());
  const reply=await guarded(rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[signature,{commitment:'finalized',encoding:'json',maxSupportedTransactionVersion:0}]})});
  const raw=await reply.text();check();evidence?.response(raw,before.contextSlot);check();
  const review=reviewSelectedSourceTransaction({raw,pins,snapshot,signature,sourceEvent});check();
  const after=await observePinnedProgram({rpc,pins,minimumContextSlot:before.contextSlot},guarded);assert.equal(after.outstandingUnits,before.outstandingUnits);check();
  const result={...review,scope:'Bounded private selected source-transaction lookup with current programme brackets; not independent chain inclusion, historical code, complete history or recovery approval',rpcObservationExecuted:true,selectedCurrentCodeBracketsObserved:true,firstCodeContextSlot:before.contextSlot,finalCodeContextSlot:after.contextSlot,readOnlyRequests:calls,wireBytes,singleDeadlineMs:timeout,durationMs:Math.round(performance.now()-began),privateTransactionResponse:raw};
  if(evidence){const {privateTransactionResponse,...retained}=result;evidence.observation(retained);check();}
  return result;
 };
 try{return await Promise.race([work(),cancelled]);}finally{try{evidence?.close();}finally{clearTimeout(timer);if(!controller.signal.aborted)controller.abort(Error('Selected source history closed'));}}
}
