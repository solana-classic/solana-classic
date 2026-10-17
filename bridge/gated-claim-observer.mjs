// Bounded read-only isolated destination observation. No keys, journals or submissions.
import {performance} from 'node:perf_hooks';
import {observePinnedProgram} from './program-pins.mjs';
import {gatedClaimDestinationSelection,reviewGatedClaimDestinationAccounts} from './gated-claim-accounts.mjs';
export async function observeGatedClaimDestination(options,fetcher=fetch){
 const required=['rpc','intent','expectedReviewSHA256','minimumContextSlot'];
 if(!options||typeof options!=='object'||!required.every(k=>Object.hasOwn(options,k))||Object.keys(options).some(k=>!required.includes(k)&&k!=='timeoutMs'))throw Error('Exact destination observer schema required');
 const u=new URL(options.rpc);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||!u.port||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error('Explicit isolated loopback RPC required');
 const rpc=u.href,intent=structuredClone(options.intent),expectedReviewSHA256=options.expectedReviewSHA256,minimum=options.minimumContextSlot,timeout=options.timeoutMs??15000;
 const {review,addresses}=gatedClaimDestinationSelection({intent,expectedReviewSHA256});
 if(!Number.isSafeInteger(minimum)||minimum<1||!Number.isInteger(timeout)||timeout<100||timeout>30000||typeof fetcher!=='function')throw Error('Bounded destination deadline/checkpoint required');
 const began=performance.now(),controller=new AbortController();let calls=0,wireBytes=0;
 const check=()=>{if(!controller.signal.aborted&&performance.now()-began>=timeout)controller.abort(Error('Destination observation deadline exceeded'));if(controller.signal.aborted)throw controller.signal.reason;};
 const timer=setTimeout(()=>controller.abort(Error('Destination observation deadline exceeded')),timeout),cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
 const guarded=async(url,init)=>{
  check();const q=JSON.parse(init.body);if(url!==rpc||init.method!=='POST'||init.redirect!=='error'||q.jsonrpc!=='2.0'||q.id!==1||!['getGenesisHash','getMultipleAccounts','getFeeForMessage','getBlockHeight','isBlockhashValid'].includes(q.method)||++calls>15)throw Error('Destination read-only RPC contract differs');
  const signal=AbortSignal.any([controller.signal,init.signal]),response=await fetcher(rpc,{...init,signal});
  try{check();}catch(e){void response.body?.cancel().catch(()=>{});throw e;}
  if(!response.ok||response.redirected||!response.body||response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json'){void response.body?.cancel().catch(()=>{});throw Error('Destination JSON RPC unavailable or redirected');}
  const maximum=q.method==='getMultipleAccounts'?(q.params[0][0]===intent.parameters.context.pins.program?2097152:32768):2048,declared=response.headers.get('content-length');
  if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>maximum)){void response.body.cancel().catch(()=>{});throw Error('Destination declared response exceeds bound');}
  const reader=response.body.getReader(),chunks=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){check();if(signal.aborted)throw signal.reason;const {done,value}=await reader.read();if(done)break;size+=value.byteLength;wireBytes+=value.byteLength;if(size>maximum||wireBytes>8388608)throw Error('Destination response exceeds wire bound');chunks.push(Buffer.from(value));}check();if(signal.aborted)throw signal.reason;}
  finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  return new Response(Buffer.concat(chunks),{headers:{'Content-Type':'application/json'}});
 };
 const request=async(method,params)=>{const response=await guarded(rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const raw=await response.text();check();const w=JSON.parse(raw);if(w.jsonrpc!=='2.0'||w.id!==1||Object.hasOwn(w,'error')||!Object.hasOwn(w,'result'))throw Error('Destination RPC envelope rejected');return {raw,result:w.result};};
 const context=(r,min)=>{if(!Number.isSafeInteger(r?.context?.slot)||r.context.slot<min)throw Error('Destination context regressed');return r.context.slot;};
 const height=async min=>{const {result}=await request('getBlockHeight',[{commitment:'finalized',minContextSlot:min}]);if(!Number.isSafeInteger(result)||result<0||result>intent.lastValidBlockHeight)throw Error('Selected claim expiry height exceeded');return result;};
 const valid=async min=>{const {result}=await request('isBlockhashValid',[intent.recentBlockhash,{commitment:'finalized',minContextSlot:min}]);const slot=context(result,min);if(result.value!==true)throw Error('Selected claim blockhash is no longer valid');return slot;};
 const work=async()=>{
  const pins=intent.parameters.context.pins,before=await observePinnedProgram({rpc,pins,minimumContextSlot:minimum},guarded),checkpoint=before.contextSlot;
  const first=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:checkpoint}]);context(first.result,checkpoint);
  const feeReply=await request('getFeeForMessage',[review.unsignedMessageBase64,{commitment:'finalized',minContextSlot:first.result.context.slot}]);const feeSlot=context(feeReply.result,first.result.context.slot),fee=feeReply.result.value;
  if(!Number.isSafeInteger(fee)||fee<0)throw Error('Exact supported message fee unavailable');
  const a=reviewGatedClaimDestinationAccounts({intent,expectedReviewSHA256,minimumContextSlot:checkpoint,feeNativeUnits:BigInt(fee),raw:first.raw});
  const initialHeight=await height(feeSlot),validSlot=await valid(feeSlot);
  const second=await request('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:validSlot}]);
  const b=reviewGatedClaimDestinationAccounts({intent,expectedReviewSHA256,minimumContextSlot:validSlot,feeNativeUnits:BigInt(fee),raw:second.raw});
  if(a.snapshotSHA256!==b.snapshotSHA256||BigInt(b.clockSlot)<BigInt(a.clockSlot)||BigInt(b.clockUnixTimestamp)<BigInt(a.clockUnixTimestamp))throw Error('Selected destination accounts or clock changed incompatibly');
  const after=await observePinnedProgram({rpc,pins,minimumContextSlot:b.contextSlot},guarded),outstanding=Buffer.from(intent.parameters.context.configurationBytes).readBigUInt64LE(374).toString();
  if(before.outstandingUnits!==outstanding||after.outstandingUnits!==outstanding)throw Error('Destination obligations changed during code observation');
  const finalHeight=await height(after.contextSlot);if(finalHeight<initialHeight)throw Error('Destination block height regressed');await valid(after.contextSlot);check();
  return {...b,state:'GATED_CLAIM_DESTINATION_OBSERVED',scope:'Bounded same-endpoint finalized-commitment destination observations; not independent finality, source backing, historical code or submission admission',rpcObservationExecuted:true,deployedCodeObserved:true,selectedCurrentCodeBracketsObserved:true,firstContextSlot:a.contextSlot,finalCodeContextSlot:after.contextSlot,blockHeight:finalHeight,blockHeightAndBlockhashObservedValid:true,readOnlyRequests:calls,wireBytes,singleDeadlineMs:timeout,durationMs:Math.round(performance.now()-began)};
 };
 try{return await Promise.race([work(),cancelled]);}finally{clearTimeout(timer);if(!controller.signal.aborted)controller.abort(Error('Destination observation closed'));}
}
