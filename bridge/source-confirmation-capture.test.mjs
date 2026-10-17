import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {captureInitialSourceConfirmation as capture} from './source-confirmation-capture.mjs';
import {prepareReviewedClaimWithSourceCapture as prepare} from './captured-source-claim.mjs';
import {sourceConfirmationFixture} from './test-fixtures/source-confirmation.mjs';
const json=result=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}),{headers:{'Content-Type':'application/json'}});
const record=(f,name)=>JSON.parse(fs.readFileSync(join(f.evidence,name),'utf8'));
test('both source directions retain complete exact metadata before any account collection with fourteen reads',async t=>{
 for(const side of [0,1]){const f=sourceConfirmationFixture(t,side),r=await capture(f.source,f.fetcher);assert(r.captureCompleted&&r.rawResponseRetainedBeforeCollection&&r.selectedEconomicMetadataMatched);assert.equal(r.readOnlyRequests,14);assert.equal(r.rpcObservationExecuted,true);assert.equal(r.chainInclusionVerified,false);assert.equal(r.canPrepareProductionClaim,false);assert.equal(r.canBroadcast,false);assert.deepEqual(f.calls.slice(0,4).map(q=>q.method),['getGenesisHash','getTransaction','getSignatureStatuses','getGenesisHash']);assert(fs.readFileSync(join(f.evidence,'response.rpc.json'),'utf8').includes('9007199254740993'));assert.equal(record(f,'response-record.json').minimumSelectedContextSlot,1);assert(!Object.hasOwn(record(f,'response-record.json'),'firstCodeContextSlot'));assert.equal(record(f,'observation.json').observation.privateSourceSnapshot.commitment,'finalized');assert.deepEqual(fs.readdirSync(f.journal),[]);}
});
test('null finalized lookup retains raw evidence without later reads or a destination record',async t=>{
 const f=sourceConfirmationFixture(t);await assert.rejects(prepare({source:f.source,claim:f.claim},async(url,init)=>JSON.parse(init.body).method==='getTransaction'?json(null):f.fetcher(url,init)),/metadata unavailable/);assert.equal(record(f,'response-record.json').reviewAccepted,false);assert.equal(JSON.parse(fs.readFileSync(join(f.evidence,'response.rpc.json'))).result,null);assert.deepEqual(fs.readdirSync(f.journal),[]);assert(!fs.existsSync(join(f.evidence,'observation.json')));
});
test('confirmed-only, failed, missing and wrong-slot statuses retain evidence and refuse claim preparation',async t=>{
 for(const mode of ['confirmed','failed','null','slot','contradictory']){const f=sourceConfirmationFixture(t,1);await assert.rejects(prepare({source:f.source,claim:f.claim},async(url,init)=>{const q=JSON.parse(init.body);if(q.method!=='getSignatureStatuses')return f.fetcher(url,init);const row={slot:mode==='slot'?51:50,confirmationStatus:mode==='confirmed'?'confirmed':'finalized',confirmations:mode==='confirmed'?0:null,err:mode==='failed'?{Custom:1}:null,...(mode==='contradictory'?{status:{Err:{Custom:1}}}:{})};return json({context:{slot:101},value:[mode==='null'?null:row]});}));assert(fs.existsSync(join(f.evidence,'signature-status/response.rpc.json')));assert(!fs.existsSync(join(f.evidence,'observation.json')));assert.deepEqual(fs.readdirSync(f.journal),[]);assert(!f.calls.some(q=>q.method==='getProgramAccounts'));}
});
test('a later collection failure cannot discard an earlier successful transaction/status response',async t=>{
 const f=sourceConfirmationFixture(t);await assert.rejects(capture(f.source,async(url,init)=>{if(JSON.parse(init.body).method==='getProgramAccounts')throw Error('collection interrupted');return f.fetcher(url,init);}),/collection interrupted/);assert(fs.existsSync(join(f.evidence,'response.rpc.json')));assert(fs.existsSync(join(f.evidence,'signature-status/response.rpc.json')));assert(!fs.existsSync(join(f.evidence,'observation.json')));
});
test('changed code, counter, genesis and economic metadata cannot create a completed capture or claim',async t=>{
 for(const mode of ['code','counter','genesis','economics']){const f=sourceConfirmationFixture(t);let reads=0,geneses=0;await assert.rejects(prepare({source:f.source,claim:f.claim},async(url,init)=>{const q=JSON.parse(init.body);if(q.method==='getGenesisHash'&&++geneses===2&&mode==='genesis')return json('11111111111111111111111111111111');if(q.method==='getMultipleAccounts'&&++reads===3){if(mode==='code')f.s.data[45]^=1;if(mode==='counter')f.s.config.writeBigUInt64LE(999n,374);}if(q.method==='getTransaction'&&mode==='economics')f.f.payload.result.meta.postBalances[0]=1n;return f.fetcher(url,init);}));assert(fs.existsSync(join(f.evidence,'response.rpc.json')));assert(!fs.existsSync(join(f.evidence,'observation.json')));assert.deepEqual(fs.readdirSync(f.journal),[]);}
});
test('unsafe endpoints, canonical/public pins, malformed signed bytes or wrong event refuse before writes and RPC',async t=>{
 const f=sourceConfirmationFixture(t);for(const patch of [{rpc:'http://localhost:21899'},{rpc:'https://example.com:443'},{rpc:'http://127.0.0.1:21899?secret=1'},{pins:{...f.source.pins,genesis:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}},{transactionBase64:'AAAA'},{sourceEvent:f.f.event.sender},{minimumContextSlot:0},{timeoutMs:30001},{extra:true}])await assert.rejects(capture({...f.source,...patch},f.fetcher));assert.equal(f.calls.length,0);assert.deepEqual(fs.readdirSync(f.evidence),[]);
});
test('only after durable capture can either direction create an unused version3 reviewed claim',async t=>{
 for(const side of [0,1]){const f=sourceConfirmationFixture(t,side),r=await prepare({source:f.source,claim:f.claim},async(url,init)=>{assert.deepEqual(fs.readdirSync(f.journal),[]);return f.fetcher(url,init);});assert(r.capture.captureCompleted&&r.sourceCaptureRequired);assert.equal(r.operation.state,'PREPARED');assert.equal(r.operation.attempts,0);assert.equal(r.canBroadcast,false);const j=JSON.parse(fs.readFileSync(join(f.journal,r.operation.id+'.json')));assert.equal(j.schemaVersion,3);assert.equal(j.attempts,0);assert.equal(j.programmePinHandoffAttempted,false);assert.equal(j.eventHash,r.capture.eventSHA256);assert(record(f,'observation.json').observation.captureCompleted);assert(f.calls.every(q=>!['sendTransaction','simulateTransaction','getLatestBlockhash'].includes(q.method)));}
});
test('caller mutation during capture cannot replace the captured source or destination event',async t=>{
 const f=sourceConfirmationFixture(t);let changed=false;const r=await prepare({source:f.source,claim:f.claim},async(url,init)=>{if(!changed){changed=true;f.source.transactionBase64='AAAA';f.claim.event={...f.claim.event,originAmount:1n};f.claim.transaction=Buffer.alloc(0);}return f.fetcher(url,init);});assert.equal(r.capture.originAmount,'10000');assert.equal(JSON.parse(fs.readFileSync(join(f.journal,r.operation.id+'.json'))).eventHash,r.capture.eventSHA256);
});
test('used evidence and shared or nested evidence/journal directories cannot prepare again',async t=>{
 const f=sourceConfirmationFixture(t);await prepare({source:f.source,claim:f.claim},f.fetcher);const original=fs.readdirSync(f.journal).map(n=>[n,fs.readFileSync(join(f.journal,n))]);await assert.rejects(prepare({source:f.source,claim:f.claim},f.fetcher));assert.equal(f.calls.length,14);for(const [n,b] of original)assert(fs.readFileSync(join(f.journal,n)).equals(b));const g=sourceConfirmationFixture(t);await assert.rejects(prepare({source:g.source,claim:{...g.claim,directory:g.evidence}},g.fetcher));assert.equal(g.calls.length,0);
});
test('an evidence write failure refuses before further queries and cannot prepare a destination record',async t=>{
 const f=sourceConfirmationFixture(t);await assert.rejects(prepare({source:f.source,claim:f.claim},async(url,init)=>{if(JSON.parse(init.body).method==='getTransaction')fs.writeFileSync(join(f.evidence,'response.rpc.json'),'retained',{mode:0o600});return f.fetcher(url,init);}));assert.equal(f.calls.length,2);assert.equal(fs.readFileSync(join(f.evidence,'response.rpc.json'),'utf8'),'retained');assert.deepEqual(fs.readdirSync(f.journal),[]);
});
async function serve(t,handler){const s=createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(async()=>{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));});return `http://127.0.0.1:${s.address().port}`;}
test('actual loopback HTTP completes capture and exact original-byte binding without mutation methods',async t=>{
 const f=sourceConfirmationFixture(t);let calls=0;const rpc=await serve(t,async(req,res)=>{calls++;let body='';for await(const b of req)body+=b;res.writeHead(200,{'Content-Type':'application/json'}).end(f.reply(JSON.parse(body)));});const r=await capture({...f.source,rpc});assert(r.captureCompleted);assert.equal(calls,14);assert.equal(r.productionReady,false);
});
test('redirects and one overall deadline refuse without allowing destination preparation',async t=>{
 const f=sourceConfirmationFixture(t);let reached=0;const target=await serve(t,(req,res)=>{reached++;req.resume();res.end('{}');}),redirect=await serve(t,(req,res)=>{req.resume();res.writeHead(307,{Location:target}).end();});await assert.rejects(capture({...f.source,rpc:redirect}));assert.equal(reached,0);const g=sourceConfirmationFixture(t);let reads=0;await assert.rejects(prepare({source:{...g.source,timeoutMs:100},claim:g.claim},async()=>{reads++;return new Promise(()=>{});}),/single deadline/);assert.equal(reads,1);assert.deepEqual(fs.readdirSync(g.journal),[]);assert(!fs.existsSync(join(g.evidence,'observation.json')));
});

test('a captured source cannot be attached to a different destination event amount',async t=>{
 const f=sourceConfirmationFixture(t);await assert.rejects(prepare({source:f.source,claim:{...f.claim,event:{...f.claim.event,originAmount:1n}}},f.fetcher));assert.equal(f.calls.length,14);assert(record(f,'observation.json').observation.captureCompleted);assert.deepEqual(fs.readdirSync(f.journal),[]);
});
test('unsafe or conflicting destination endpoints and changed source pins refuse before capture',async t=>{
 for(const mode of ['public','noport','same','pins','extra']){const f=sourceConfirmationFixture(t),claim={...f.claim};if(mode==='public')claim.rpc='https://example.com:443';if(mode==='noport')claim.rpc='http://127.0.0.1';if(mode==='same')claim.rpc=f.source.rpc;if(mode==='pins')claim.programmePins={...claim.programmePins,source:{...claim.programmePins.source,elfSHA256:'f'.repeat(64)}};await assert.rejects(prepare({source:f.source,claim,...(mode==='extra'?{canBroadcast:true}:{})},f.fetcher));assert.equal(f.calls.length,0);assert.deepEqual(fs.readdirSync(f.evidence),[]);assert.deepEqual(fs.readdirSync(f.journal),[]);}
});
test('changed original signed source or oversized returned metadata cannot prepare a claim',async t=>{
 for(const mode of ['resigned','oversized']){const f=sourceConfirmationFixture(t);await assert.rejects(prepare({source:f.source,claim:f.claim},async(url,init)=>{if(JSON.parse(init.body).method==='getTransaction'){if(mode==='oversized')return new Response(' '.repeat(65537),{headers:{'Content-Type':'application/json'}});const ix=f.f.payload.result.transaction.message.instructions[0],bytes=f.f.decode(ix.data);bytes[1]^=1;ix.data=f.f.encode(bytes);f.f.resign();}return f.fetcher(url,init);}));assert.deepEqual(fs.readdirSync(f.journal),[]);assert(!fs.existsSync(join(f.evidence,'observation.json')));}
});
test('late synchronous work and actual slow streams cannot extend the capture deadline',async t=>{
 const f=sourceConfirmationFixture(t);await assert.rejects(capture({...f.source,timeoutMs:100},async(url,init)=>{const until=performance.now()+120;while(performance.now()<until){}return f.fetcher(url,init);}),/single deadline/);assert.equal(f.calls.length,1);assert(!fs.existsSync(join(f.evidence,'observation.json')));
 const g=sourceConfirmationFixture(t),timers=[];const rpc=await serve(t,(req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.write(' ');const timer=setInterval(()=>res.write(' '),20);timers.push(timer);res.once('close',()=>clearInterval(timer));});try{await assert.rejects(capture({...g.source,rpc,timeoutMs:150}),/single deadline/);}finally{for(const timer of timers)clearInterval(timer);}assert(!fs.existsSync(join(g.evidence,'observation.json')));assert.deepEqual(fs.readdirSync(g.journal),[]);
});

test('signature-status observation context does not become a finalized bank checkpoint',async t=>{
 for(const side of [0,1]){const f=sourceConfirmationFixture(t,side);f.source.minimumContextSlot=40;const requests=[];
  const result=await prepare({source:f.source,claim:f.claim},async(url,init)=>{const q=JSON.parse(init.body);requests.push(q);
   if(q.method==='getSignatureStatuses')return json({context:{slot:10000},value:[{slot:50,confirmationStatus:'finalized',confirmations:null,err:null,status:{Ok:null}}]});
   if(['getMultipleAccounts','getProgramAccounts'].includes(q.method)&&q.params[1].minContextSlot>200)return new Response(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32016,message:'Minimum context slot has not been reached'}}),{headers:{'Content-Type':'application/json'}});
   return f.fetcher(url,init);
  });
  assert.equal(result.operation.state,'PREPARED');assert.equal(result.operation.attempts,0);assert.equal(result.capture.readOnlyRequests,14);assert(result.capture.initialSourceFinalizedRPCStatusObserved);assert(result.capture.sourceSnapshotContextSlot>=f.claim.sourceContextSlot);assert(result.capture.sourceSnapshotContextSlot<10000);
  assert.equal(requests.find(q=>q.method==='getMultipleAccounts').params[1].minContextSlot,50);assert(requests.filter(q=>['getMultipleAccounts','getProgramAccounts'].includes(q.method)).every(q=>q.params[1].minContextSlot>=50));
 }
});
