import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {PublicKey} from '@solana/web3.js';
import {collectReturnedProgramAccounts as collect,parseReturnedProgramAccounts as parse} from './program-account-collector.mjs';
import {reconcileEventInventory} from './event-inventory.mjs';
import {collectionFixture,wire} from './test-fixtures/event-collection.mjs';
const result=(f,side=0)=>f.reply(side,{method:'getProgramAccounts',params:[f.sides[side].pins.program,{minContextSlot:90}]});
const parseResult=(f,value,side=0)=>parse(wire(value),{pins:f.sides[side].pins,minimumContextSlot:90});
const respond=value=>new Response(wire(value),{headers:{'Content-Type':'application/json'}});

test('two stable collected snapshots feed exact returned-event accounting without promotion to production or completeness',async()=>{
 const f=collectionFixture(),before=JSON.stringify(f.sides.map(s=>s.pins));
 const origin=await collect(f.options(0),f.fetcher),native=await collect(f.options(1),f.fetcher);
 const r=reconcileEventInventory({pins:{origin:f.sides[0].pins,native:f.sides[1].pins},originSnapshot:origin.snapshot,nativeSnapshot:native.snapshot,originEscrowUnits:'1500',minimumContextSlots:[90,90]});
 assert.equal(r.pending.nativeClaimOriginUnits,'500');assert.equal(r.pending.originalRedemptionOriginUnits,'400');assert.equal(r.accounting.nativeOutstandingUnits,'600');
 assert.equal(origin.snapshot.accounts.find(a=>a.address===f.sides[0].vaultAddress).lamports,'9007199254740993');
 assert.equal(origin.requestCount,10);assert.equal(origin.observations,2);assert.equal(origin.programmeCodeObservations,4);assert.equal(JSON.stringify(f.sides.map(s=>s.pins)),before);
 for(const value of [origin,native])for(const flag of ['rpcResponseCompletenessVerified','completeSourceEventInventoryVerified','sameLedgerHistoryVerified','simultaneousSnapshotVerified','finalizedCommitmentIndependentlyVerified','freshChainStateVerified','deployedCodeAndCustodyVerified','sourceEconomicMovementsIndependentlyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'])assert.equal(value[flag],false);
 assert.equal(Object.hasOwn(origin,'rpc'),false);assert.equal(Object.hasOwn(origin,'privateKey'),false);
});
test('RPC protocol is unfiltered base64 with contextual finalized monotonic reads and no mutation methods',async()=>{
 const f=collectionFixture();await collect(f.options(0),f.fetcher);
 const reads=f.calls.filter(x=>x.q.method==='getProgramAccounts');assert.equal(reads.length,2);
 for(const {q} of reads)assert.deepEqual(Object.keys(q.params[1]).sort(),['encoding','commitment','withContext','minContextSlot'].sort());
 assert.deepEqual(reads[0].q.params[1],{encoding:'base64',commitment:'finalized',withContext:true,minContextSlot:102});
 assert.equal(reads[1].q.params[1].minContextSlot,103);
 assert(f.calls.every(x=>['getGenesisHash','getMultipleAccounts','getProgramAccounts'].includes(x.q.method)));
});
test('public or soaking pins, nonloopback endpoints, credentials, missing checkpoints and unsafe budgets refuse before any RPC',async()=>{
 const f=collectionFixture(),options=f.options(0),credential=new URL(options.rpc);credential.username='fixture';
 for(const changed of [{rpc:'https://example.com:443'},{rpc:'http://localhost:21899'},{rpc:credential.href},{rpc:options.rpc+'/?key=value'},{minimumContextSlot:0},{minimumContextSlot:90.5},{timeoutMs:99},{timeoutMs:30001},{timeoutMs:true},{pins:{...options.pins,genesis:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}},{pins:{...options.pins,remoteGenesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'}},{pins:{...options.pins,bridge:'11111111111111111111111111111111'}},{unexpected:true}])await assert.rejects(collect({...options,...changed},f.fetcher));
 assert.equal(f.calls.length,0);
});
test('raw native amounts keep exact u64 digits and reject noncanonical numbers',()=>{
 const f=collectionFixture(),r=result(f),a=r.result.value[0].account;
 for(const value of ['9007199254740993','18446744073709551615']){a.lamports=value;assert.equal(parseResult(f,r).accounts.find(x=>x.address===r.result.value[0].pubkey).lamports,value);}
 a.lamports='1000';const original=wire(r);
 for(const value of ['-0','-1','1e3','1.0','0.5','null','true','"1000"','18446744073709551616'])assert.throws(()=>parse(original.replace('"lamports":1000','"lamports":'+value),{pins:f.sides[0].pins,minimumContextSlot:90}));
});
test('malformed envelopes, account types, duplicate rows, missing config/vault and unknown layouts refuse',()=>{
 for(const mode of ['id','error','extra','bare','stale','slot','owner','executable','duplicate','encoding','base64','space','missing','bootstrap','count','size']){
  const f=collectionFixture(),r=result(f),rows=r.result.value;
  if(mode==='id')r.id=true;if(mode==='error')r.error=null;if(mode==='extra')r.result.total=4;if(mode==='bare')r.result=rows;if(mode==='stale')r.result.context.slot=89;if(mode==='slot')r.result.context.slot=9007199254740992;
  if(mode==='owner')rows[0].account.owner=f.sides[1].pins.program;if(mode==='executable')rows[0].account.executable=true;if(mode==='duplicate')rows.push(rows[0]);if(mode==='encoding')rows[0].account.data[1]='base58';if(mode==='base64')rows[0].account.data[0]+=' ';if(mode==='space')rows[0].account.space=1;if(mode==='missing')rows.shift();if(mode==='bootstrap')rows[2].account.data[0]=Buffer.alloc(120).toString('base64');if(mode==='count')while(rows.length<257)rows.push(rows[0]);if(mode==='size')rows[0].account.data[0]='A'.repeat(513);
  assert.throws(()=>parseResult(f,r),mode);
 }
});
test('stale/regressing contexts and changes of a single large native unit between returned sets refuse',async()=>{
 for(const mode of ['stale','changed']){
  const f=collectionFixture();let reads=0;
  const fetcher=async(url,init)=>{const q=JSON.parse(init.body),r=await f.fetcher(url,init);if(q.method!=='getProgramAccounts'||++reads!==2)return r;const value=JSON.parse(await r.text());if(mode==='stale')value.result.context.slot=q.params[1].minContextSlot-1;else value.result.value[1].account.lamports='9007199254740994';return respond(value);};
  await assert.rejects(collect(f.options(0),fetcher));
 }
});
test('late code, authority, policy, genesis or outstanding changes cannot hide behind early success',async()=>{
 for(const mode of ['code','authority','policy','genesis','counter']){
  const f=collectionFixture();let reads=0,genesi=0;
  const fetcher=async(url,init)=>{const q=JSON.parse(init.body);if(q.method==='getMultipleAccounts'&&++reads===3){if(mode==='code')f.sides[0].data[45]^=1;if(mode==='authority')f.sides[0].data[13]^=1;if(mode==='policy')f.sides[0].config[342]^=1;if(mode==='counter')f.sides[0].config.writeBigUInt64LE(1501n,374);}
   const response=await f.fetcher(url,init);if(q.method==='getGenesisHash'&&++genesi===3&&mode==='genesis'){const r=JSON.parse(await response.text());r.result=f.sides[1].pins.genesis;return respond(r);}return response;};
  await assert.rejects(collect(f.options(0),fetcher),undefined,mode);
 }
});
test('caller mutation of expected pins while awaiting RPC cannot authorize replacement code',async()=>{
 const f=collectionFixture(),options=f.options(0);let once=false;
 const fetcher=async(...args)=>{if(!once){once=true;options.pins.elfSHA256='f'.repeat(64);f.sides[0].data[45]^=1;}return f.fetcher(...args);};
 await assert.rejects(collect(options,fetcher));
});
test('unavailable, non-JSON, malformed, oversized declared and oversized streamed responses refuse',async()=>{
 const f=collectionFixture();
 for(const fetcher of [async()=>{throw Error('fixture outage');},async()=>new Response('{}',{status:503}),async()=>new Response('{}'),async()=>new Response('not json',{headers:{'Content-Type':'application/json'}}),async()=>new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'2097153'}}),async()=>new Response(' '.repeat(2097153),{headers:{'Content-Type':'application/json'}})])await assert.rejects(collect(f.options(0),fetcher));
});
test('a transport ignoring cancellation still cannot extend the single overall deadline or trigger later reads',async()=>{
 const f=collectionFixture();let calls=0;const began=performance.now();
 await assert.rejects(collect({...f.options(0),timeoutMs:100},async()=>{calls++;return new Promise(()=>{});}),/single deadline/);
 assert.equal(calls,1);assert(performance.now()-began<1000);
});
async function server(t,f,delay=0){
 const timers=new Set(),sockets=new Set();let requests=0;
 const listener=createServer(async(req,res)=>{
  requests++;let body='';for await(const chunk of req)body+=chunk;
  const reply=()=>{const value=f.reply(0,JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'});res.end(wire(value));};
  if(delay){const timer=setTimeout(()=>{timers.delete(timer);if(!res.destroyed)reply();},delay);timers.add(timer);}else reply();
 });
 listener.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{for(const timer of timers)clearTimeout(timer);listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));});
 return {rpc:`http://127.0.0.1:${listener.address().port}`,requests:()=>requests,sockets};
}
test('actual loopback HTTP preserves large native digits and completes the bounded read-only protocol',async t=>{
 const f=collectionFixture(),s=await server(t,f),r=await collect({...f.options(0),rpc:s.rpc});
 assert.equal(s.requests(),10);assert.equal(r.snapshot.accounts.find(a=>a.address===f.sides[0].vaultAddress).lamports,'9007199254740993');assert.equal(r.productionReady,false);
});
test('one shared deadline expires across individually prompt real HTTP requests',async t=>{
 const f=collectionFixture(),s=await server(t,f,35),began=performance.now();
 await assert.rejects(collect({...f.options(0),rpc:s.rpc,timeoutMs:150}),/single deadline/);
 assert(s.requests()<10);assert(performance.now()-began<1000);
});
test('two matching but coordinated incomplete RPC sets still do not establish complete source history',async()=>{
 const f=collectionFixture();f.sides[0].accounts=f.sides[0].accounts.filter(a=>a.address!==f.pendingLock);f.sides[0].config.writeBigUInt64LE(1000n,374);
 const origin=await collect(f.options(0),f.fetcher),native=await collect(f.options(1),f.fetcher);
 const r=reconcileEventInventory({pins:{origin:f.sides[0].pins,native:f.sides[1].pins},originSnapshot:origin.snapshot,nativeSnapshot:native.snapshot,originEscrowUnits:'1500',minimumContextSlots:[90,90]});
 assert.equal(r.pending.nativeClaimOriginUnits,'0');assert.equal(origin.rpcResponseCompletenessVerified,false);assert.equal(r.completeSourceEventInventoryVerified,false);assert.equal(r.backingVerified,false);
});

test('the complete collection has an aggregate wire budget in addition to per-response bounds',async()=>{
 const f=collectionFixture();
 const fetcher=async(url,init)=>{
  const response=await f.fetcher(url,init);if(JSON.parse(init.body).method==='getProgramAccounts')return response;
  const value=JSON.parse(await response.text());value.padding='x'.repeat(1800000);return respond(value);
 };
 await assert.rejects(collect(f.options(0),fetcher),/wire bounds/);
 assert(f.calls.length<10);
});
test('actual HTTP redirects cannot contact a different RPC endpoint',async t=>{
 const f=collectionFixture(),target=await server(t,f);
 const redirect=createServer((req,res)=>{req.resume();res.writeHead(307,{Location:target.rpc}).end();});
 await new Promise(resolve=>redirect.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{redirect.closeAllConnections();await new Promise(resolve=>redirect.close(resolve));});
 await assert.rejects(collect({...f.options(0),rpc:`http://127.0.0.1:${redirect.address().port}`}));
 assert.equal(target.requests(),0);
});
test('slow streaming HTTP bodies cannot extend the deadline and the connection closes',async t=>{
 const f=collectionFixture();let finishClose;const closed=new Promise(resolve=>{finishClose=resolve;});let interval;
 const listener=createServer((req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.write(' ');interval=setInterval(()=>res.write(' '),20);res.once('close',()=>{clearInterval(interval);finishClose();});});
 await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clearInterval(interval);listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));});
 await assert.rejects(collect({...f.options(0),rpc:`http://127.0.0.1:${listener.address().port}`,timeoutMs:150}),/single deadline/);
 let timer;try{await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Streaming connection stayed open')),1000);})]);}finally{clearTimeout(timer);}
});


test('synchronous transport work cannot finish after budget before the timer receives an event-loop turn',async()=>{
 const f=collectionFixture();let calls=0;
 await assert.rejects(collect({...f.options(0),timeoutMs:100},async(url,init)=>{
  calls++;const began=performance.now();while(performance.now()-began<120){}
  return f.fetcher(url,init);
 }),/single deadline/);
 assert.equal(calls,1);
});
