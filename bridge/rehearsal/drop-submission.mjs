// Deliberately drop one complete local submission. No node endpoint or forwarder.
import http from 'node:http';
import assert from 'node:assert/strict';
export const DROP_PORT=28898;
export async function dropOriginalSubmission(rawTransaction){
 assert(Buffer.isBuffer(rawTransaction)||rawTransaction instanceof Uint8Array,'Signed transaction bytes required');
 const raw=Buffer.from(rawTransaction);assert(raw.length>0&&raw.length<=1232,'Bounded signed transaction required');
 const encoded=raw.toString('base64'),sockets=new Set();let requests=0,complete=0,invalid=false,transportError;
 const server=http.createServer(async(req,res)=>{
  requests++;
  try{
   assert.equal(requests,1);assert.equal(req.method,'POST');assert.equal(req.url,'/');assert.equal(req.headers['content-type'],'application/json');
   const chunks=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;assert(bytes<=4096);chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString());
   assert.deepEqual(body,{jsonrpc:'2.0',id:1,method:'sendTransaction',params:[encoded,{encoding:'base64',skipPreflight:false,maxRetries:0}]});
   complete++;
  }catch{invalid=true;}
  // Never respond, forward, retry or contact a validator. The complete body is
  // discarded, so the caller sees a real connection loss without an RPC result.
  req.socket.destroy();
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(DROP_PORT,'127.0.0.1',resolve);});
  try{
   await fetch('http://127.0.0.1:'+DROP_PORT+'/',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[encoded,{encoding:'base64',skipPreflight:false,maxRetries:0}]}),signal:AbortSignal.timeout(5000)});
  }catch(error){transportError=error.name;}
  assert.equal(transportError,'TypeError','A lost connection, not an RPC acknowledgement, is required');
  assert.equal(requests,1);assert.equal(complete,1);assert.equal(invalid,false);
 }finally{
  for(const socket of sockets)socket.destroy();
  if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
 return {completeSubmissionRequests:1,forwardedRequests:0,rpcAcknowledgements:0,clientTransportFailed:true,transportErrorType:transportError,dropServerClosed:true,controlledDrop:true,arbitraryUnknownLandingVerified:false};
}
