// Read-only isolated RPC collection. No keys, journals, files or transactions.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins,observePinnedProgram} from './program-pins.mjs';
import {inspectReturnedProgramSnapshot} from './event-inventory.mjs';
const U64=(1n<<64n)-1n,MAX_PROGRAM_WIRE=262144,MAX_CODE_WIRE=2097152,MAX_TOTAL_WIRE=8388608;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function shape(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))throw Error('Exact returned RPC schema required');
}
function checkpoint(value){if(!Number.isSafeInteger(value)||value<1)throw Error('Explicit positive finalized checkpoint required');return value;}
function endpoint(value){
 const u=new URL(value);
 if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.port||u.port==='0')throw Error('Explicit private loopback RPC and port required');
 return u.href;
}
function key(value){if(typeof value!=='string'||value==='11111111111111111111111111111111'||new PublicKey(value).toBase58()!==value)throw Error('Canonical nonzero collector identity required');return value;}
function pins(value){const p=normalizeProgramPins(value);for(const k of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'])key(p[k]);if(p.upgradeAuthority!==null)key(p.upgradeAuthority);return p;}

export function parseReturnedProgramAccounts(raw,{pins:selected,minimumContextSlot}){
 const p=pins(selected),minimum=checkpoint(minimumContextSlot);
 if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_PROGRAM_WIRE)throw Error('Bounded returned programme RPC response required');
 let sourceSupported=false;
 JSON.parse('[9007199254740993]',function(k,v,c){if(k==='0')sourceSupported=c?.source==='9007199254740993';return v;});
 if(!sourceSupported)throw Error('Node24 raw JSON number source support required');
 const wire=JSON.parse(raw,function(k,v,c){
  if(k!=='lamports')return v;
  const digits=c?.source;
  if(typeof v!=='number'||typeof digits!=='string'||digits.length>20||!/^(0|[1-9][0-9]*)$/.test(digits)||BigInt(digits)>U64)throw Error('Exact account native u64 JSON digits required');
  return BigInt(digits);
 });
 shape(wire,['jsonrpc','id','result']);
 if(wire.jsonrpc!=='2.0'||wire.id!==1)throw Error('RPC protocol or request identifier differs');
 shape(wire.result,['context','value']);shape(wire.result.context,['slot'],['apiVersion']);
 const slot=checkpoint(wire.result.context.slot),rows=wire.result.value;
 if(slot<minimum||!Array.isArray(rows)||rows.length<2||rows.length>256)throw Error('Returned context precedes checkpoint or account count exceeds bound');
 const accounts=rows.map(row=>{
  shape(row,['pubkey','account']);shape(row.account,['owner','executable','lamports','data'],['rentEpoch','space']);
  const a=row.account;
  if(typeof a.lamports!=='bigint'||a.owner!==p.program||a.executable!==false||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length>512)throw Error('Returned account owner, native balance or encoding differs');
  const data=Buffer.from(a.data[0],'base64');
  if(data.toString('base64')!==a.data[0]||(a.space!==undefined&&(!Number.isSafeInteger(a.space)||a.space!==data.length)))throw Error('Returned account base64 or declared size differs');
  return {address:key(row.pubkey),owner:a.owner,executable:false,lamports:a.lamports.toString(),dataBase64:a.data[0]};
 }).sort((a,b)=>a.address<b.address?-1:a.address>b.address?1:0);
 const snapshot={genesis:p.genesis,program:p.program,commitment:'finalized',contextSlot:slot,accounts};
 inspectReturnedProgramSnapshot(snapshot,p,minimum);
 return snapshot;
}

export async function collectReturnedProgramAccounts(options,fetcher=fetch){
 shape(options,['rpc','pins','minimumContextSlot'],['timeoutMs']);
 const rpc=endpoint(options.rpc),selected=pins(options.pins),minimum=checkpoint(options.minimumContextSlot),timeout=options.timeoutMs??15000;
 if(!Number.isInteger(timeout)||timeout<100||timeout>30000||typeof fetcher!=='function')throw Error('Bounded collector timeout and transport required');
 const controller=new AbortController(),began=performance.now();let requestCount=0,totalWireBytes=0;
 const timeoutError=()=>Error('Private inventory collection exceeded its single deadline');
 const timer=setTimeout(()=>controller.abort(timeoutError()),timeout);
 const withinDeadline=()=>{
  if(!controller.signal.aborted&&performance.now()-began>=timeout)controller.abort(timeoutError());
  if(controller.signal.aborted)throw controller.signal.reason;
 };
 const cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));
 const guarded=async(url,init)=>{
  withinDeadline();
  const q=JSON.parse(init.body);
  if(url!==rpc||init.method!=='POST'||init.redirect!=='error'||q.jsonrpc!=='2.0'||q.id!==1||!['getGenesisHash','getMultipleAccounts','getProgramAccounts'].includes(q.method)||++requestCount>10)throw Error('Only the bounded read-only collector protocol is permitted');
  const signal=AbortSignal.any([controller.signal,init.signal]);
  const response=await fetcher(rpc,{...init,signal});
  try{withinDeadline();}catch(error){void response.body?.cancel().catch(()=>{});throw error;}
  if(!response.ok||response.redirected||!response.body||response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')throw Error('Private inventory RPC unavailable or content type differs');
  const maximum=q.method==='getProgramAccounts'?MAX_PROGRAM_WIRE:MAX_CODE_WIRE;
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^(0|[1-9][0-9]*)$/.test(declared)||Number(declared)>maximum))throw Error('Declared inventory RPC size exceeds bound');
  const reader=response.body.getReader(),chunks=[];let size=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{
   while(true){
    withinDeadline();if(signal.aborted)throw signal.reason;
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;totalWireBytes+=value.byteLength;
    if(size>maximum||totalWireBytes>MAX_TOTAL_WIRE)throw Error('Inventory RPC response exceeds wire bounds');
    chunks.push(Buffer.from(value));
   }
   withinDeadline();if(signal.aborted)throw signal.reason;
  }finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  return new Response(Buffer.concat(chunks),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const work=async()=>{
  const before=await observePinnedProgram({rpc,pins:selected,minimumContextSlot:minimum},guarded);
  const read=async min=>{
   const response=await guarded(rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getProgramAccounts',params:[selected.program,{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:min}]})});
   const snapshot=parseReturnedProgramAccounts(await response.text(),{pins:selected,minimumContextSlot:min});withinDeadline();return snapshot;
  };
  const first=await read(before.contextSlot),second=await read(first.contextSlot);
  if(digest(first.accounts)!==digest(second.accounts))throw Error('Returned programme accounts changed between observations');
  const after=await observePinnedProgram({rpc,pins:selected,minimumContextSlot:second.contextSlot},guarded);
  const inspected=inspectReturnedProgramSnapshot(second,selected,second.contextSlot);
  if(after.outstandingUnits!==inspected.policy.outstanding.toString())throw Error('Outstanding counter changed during final code observation');
  withinDeadline();
  return {schemaVersion:1,scope:'bounded private RPC returned-account collection; not complete source history or settlement approval',observedAt:new Date().toISOString(),snapshot:second,firstContextSlot:first.contextSlot,finalCodeContextSlot:after.contextSlot,returnedAccounts:second.accounts.length,returnedAccountsSHA256:digest(second.accounts),observations:2,programmeCodeObservations:4,requestCount,totalWireBytes,durationMs:Math.round(performance.now()-began),singleDeadlineMs:timeout,stableReturnedAccountsObserved:true,selectedCodeAndPolicyBracketed:true,rpcResponseCompletenessVerified:false,completeSourceEventInventoryVerified:false,sameLedgerHistoryVerified:false,simultaneousSnapshotVerified:false,finalizedCommitmentIndependentlyVerified:false,freshChainStateVerified:false,deployedCodeAndCustodyVerified:false,sourceEconomicMovementsIndependentlyVerified:false,backingVerified:false,canRetry:false,canRefund:false,canResetAttempt:false,canSign:false,canBroadcast:false,settlementAccepted:false,productionReady:false};
 };
 try{return await Promise.race([work(),cancelled]);}
 finally{clearTimeout(timer);if(!controller.signal.aborted)controller.abort(Error('Private inventory collection closed'));}
}
