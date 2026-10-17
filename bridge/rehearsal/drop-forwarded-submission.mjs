// Controlled private transport fault: forward once, then withhold the upstream reply.
import http from 'node:http';
import assert from 'node:assert/strict';
import {PublicKey,Transaction} from '@solana/web3.js';
import {PUBLIC_GENESIS} from '../sdk.mjs';
export const FORWARDED_DROP_PORT=19898;
const canonical='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
export async function dropForwardedSubmission({rpc,expectedGenesis,rawTransaction,timeoutMs=5000}){
 const url=new URL(rpc);assert(['http:','https:'].includes(url.protocol)&&['127.0.0.1','[::1]'].includes(url.hostname)&&url.port&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,'Explicit private fault RPC required');
 assert(typeof expectedGenesis==='string'&&new PublicKey(expectedGenesis).toBase58()===expectedGenesis&&expectedGenesis!=='11111111111111111111111111111111'&&expectedGenesis!==canonical&&!PUBLIC_GENESIS.has(expectedGenesis),'Private fault genesis required');
 assert(rawTransaction instanceof Uint8Array&&rawTransaction.byteLength>0&&rawTransaction.byteLength<=1232&&Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=10000,'Bounded private signed request and deadline required');
 const raw=Buffer.from(rawTransaction),transaction=Transaction.from(raw);assert(transaction.verifySignatures()&&transaction.serialize().equals(raw),'Exact valid signed legacy bytes required');
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let number=BigInt('0x'+transaction.signature.toString('hex')),signature='';while(number){signature=alphabet[Number(number%58n)]+signature;number/=58n;}for(const b of transaction.signature){if(b!==0)break;signature='1'+signature;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('Private fault deadline exceeded')),timeoutMs),signal=controller.signal,sockets=new Set();let requests=0,complete=0,forwarded=0,acknowledgements=0,clientTransportError=null,server,handlerFailure;
 const check=()=>{if(signal.aborted)throw signal.reason;};
 const aborted=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 async function rpcRead(method,params,maximum){
  check();const response=await fetch(url.href,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});
  try{check();assert(response.ok&&!response.redirected&&response.body&&response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()==='application/json','Fault upstream JSON unavailable');const n=response.headers.get('content-length');assert(n===null||/^(0|[1-9][0-9]*)$/.test(n)&&Number(n)<=maximum,'Fault upstream declared bound exceeded');}catch(e){void response.body?.cancel().catch(()=>{});throw e;}
  const reader=response.body.getReader(),chunks=[];let length=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});try{while(true){if(signal.aborted)throw signal.reason;const {done,value}=await reader.read();if(done)break;length+=value.byteLength;assert(length<=maximum,'Fault upstream body bound exceeded');chunks.push(Buffer.from(value));}}finally{signal.removeEventListener('abort',cancel);cancel();reader.releaseLock();}
  check();const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));assert(result?.jsonrpc==='2.0'&&result.id===1&&!Object.hasOwn(result,'error')&&Object.hasOwn(result,'result'),'Fault upstream RPC refusal');return result.result;
 }
 const work=async()=>{
  assert.equal(await rpcRead('getGenesisHash',[],256),expectedGenesis,'Wrong private fault genesis');
  check();const body={jsonrpc:'2.0',id:1,method:'sendTransaction',params:[raw.toString('base64'),{encoding:'base64',skipPreflight:false,maxRetries:0}]};
  let handlerDone;const handled=new Promise(resolve=>handlerDone=resolve);
  server=http.createServer(async(req,res)=>{
   requests++;
   try{
    assert.equal(requests,1);assert.equal(req.method,'POST');assert.equal(req.url,'/');assert.equal(req.headers['content-type'],'application/json');
    const parts=[];let length=0;for await(const chunk of req){length+=chunk.length;assert(length<=4096);parts.push(chunk);}assert.deepEqual(JSON.parse(Buffer.concat(parts).toString('utf8')),body);complete++;
    assert.equal(await rpcRead('getGenesisHash',[],256),expectedGenesis,'Private fault genesis changed before submission');
    check();forwarded++;const reply=await rpcRead('sendTransaction',body.params,4096);assert.equal(reply,signature,'Fault upstream signature differs');acknowledgements++;
   }catch(e){handlerFailure=e;}finally{req.socket.destroy();handlerDone();}
  });
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  check();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(FORWARDED_DROP_PORT,'127.0.0.1',resolve);});
  try{await fetch('http://127.0.0.1:'+FORWARDED_DROP_PORT+'/',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});}catch(e){clientTransportError=e.name;}
  await handled;check();if(handlerFailure)throw handlerFailure;assert.equal(clientTransportError,'TypeError','Actual client connection loss required');assert.equal(requests,1);assert.equal(complete,1);assert.equal(forwarded,1);assert.equal(acknowledgements,1);
  return {controlledFault:true,completeClientRequests:1,upstreamSubmissionRequests:1,harnessObservedUpstreamAcknowledgements:1,clientRPCAcknowledgements:0,clientTransportFailed:true,clientTransportErrorType:clientTransportError,automaticRetries:0,arbitraryUnknownLandingVerified:false,productionReady:false};
 };
 try{return await Promise.race([work(),aborted]);}finally{clearTimeout(timer);controller.abort(Error('Private transport fault closed'));for(const socket of sockets)socket.destroy();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
}
