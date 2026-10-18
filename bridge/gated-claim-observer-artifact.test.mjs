// Explicit optional test command: selected public ELF required; never silently skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {destinationFixture} from './test-fixtures/gated-destination.mjs';
import {observeGatedClaimDestination as observe} from './gated-claim-observer.mjs';
const path=process.env.SC_GATED_OBSERVER_ELF;assert(path,'Explicit selected public ELF path required');assert(statSync(path).isFile()&&statSync(path).size===217032);const elf=readFileSync(path);assert.equal(createHash('sha256').update(elf).digest('hex'),'19424e0679c8d2d801fcb6ab015860b7b8f487cf0b1c6e2e7b41ca3d40efc16b');
async function server(t,f,slow=false){const s=createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const q=JSON.parse(body);res.setHeader('Content-Type','application/json');if(slow&&q.method==='getMultipleAccounts'){res.write('{');return;}res.end(f.reply(q));});await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{s.closeAllConnections();s.close(resolve);}));return 'http://127.0.0.1:'+s.address().port;}
test('actual local HTTP transport brackets exact selected public code and two claim snapshots with fee and expiry checks',async t=>{
 const f=destinationFixture(elf),rpc=await server(t,f),r=await observe({...f.options,rpc});assert.equal(r.readOnlyRequests,15);assert.equal(r.rpcObservationExecuted,true);assert.equal(r.selectedCurrentCodeBracketsObserved,true);assert.equal(r.blockHeightAndBlockhashObservedValid,true);assert.equal(r.blockHeight,20);assert.equal(r.nativeAmount,'50000000');assert.equal(r.canPrepareSubmission,false);assert.equal(r.sourceFinalityVerified,false);assert.equal(r.canBroadcast,false);assert.equal(r.productionReady,false);assert(f.calls.every(q=>['getGenesisHash','getMultipleAccounts','getFeeForMessage','getBlockHeight','isBlockhashValid'].includes(q.method)));assert(!Object.hasOwn(r,'raw'));assert(!Object.hasOwn(r,'rpc'));
});
test('selected code corruption and late receipt consumption cannot inherit earlier destination success',async()=>{
 const bad=destinationFixture(elf);bad.code[45]^=1;await assert.rejects(observe(bad.options,bad.fetcher),/programme account/);
 const f=destinationFixture(elf);f.mutate((q,w,n)=>{if(q.method==='getMultipleAccounts'&&q.params[0][0]!==f.pins.program&&n===2)w.result.value[4]=f.rows[3];});await assert.rejects(observe(f.options,f.fetcher),/receipt/);
});
test('late expiry, invalid blockhash, unavailable fee and regressed context refuse',async()=>{
 for(const mode of ['expiry','blockhash','fee','context']){const f=destinationFixture(elf);let heights=0;f.mutate((q,w)=>{if(q.method==='getBlockHeight'&&++heights===2&&mode==='expiry')w.result=501;if(q.method==='isBlockhashValid'&&mode==='blockhash')w.result.value=false;if(q.method==='getFeeForMessage'&&mode==='fee')w.result.value=null;if(q.method==='getMultipleAccounts'&&mode==='context')w.result.context.slot=0;});await assert.rejects(observe(f.options,f.fetcher),{expiry:/expiry height/,blockhash:/blockhash/,fee:/fee unavailable/,context:/checkpoint/}[mode]);}
});
test('stalled real HTTP response body is cancelled by the single overall deadline',async t=>{
 const f=destinationFixture(elf),rpc=await server(t,f,true),start=performance.now();await assert.rejects(observe({...f.options,rpc,timeoutMs:150}),/deadline/);assert(performance.now()-start<2000);
});

test('caller mutation cannot replace captured intent and later balance or clock movement refuses stable admission',async()=>{
 const f=destinationFixture(elf);let changed=false;f.mutate(q=>{if(!changed&&q.method==='getGenesisHash'){changed=true;f.intent.parameters.context.configurationBytes.fill(0);f.intent.parameters.bootstrap.recordBytes.fill(0);f.intent.parameters.event.originAmount=1n;}});const r=await observe(f.options,f.fetcher);assert.equal(r.reviewSHA256,f.expectedReviewSHA256);
 for(const mode of ['balance','clock','height']){const g=destinationFixture(elf);let heights=0;g.mutate((q,w,n)=>{if(q.method==='getMultipleAccounts'&&q.params[0][0]!==g.pins.program&&n===2){if(mode==='balance')w.result.value[1].lamports++;if(mode==='clock'){const b=Buffer.from(w.result.value[6].data[0],'base64');b.writeBigInt64LE(86400n,32);w.result.value[6].data[0]=b.toString('base64');}}if(q.method==='getBlockHeight'&&++heights===2&&mode==='height')w.result=19;});await assert.rejects(observe(g.options,g.fetcher),/changed incompatibly|height regressed/);}
});
