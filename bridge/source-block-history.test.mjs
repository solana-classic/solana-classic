import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import {PublicKey} from '@solana/web3.js';
import {extractSelectedBlockTransaction as extract,observeSelectedBlockHistory as observe} from './source-block-history.mjs';
import {sourceEconomicFixture} from './test-fixtures/source-economic.mjs';
import {reviewSelectedSourceTransaction} from './source-economic-review.mjs';
const envelope=result=>JSON.stringify({jsonrpc:'2.0',id:1,result});
function fixture(t){
 const f=sourceEconomicFixture(1),s=f.codeFixture,calls=[];let slot=100;
 const exact=JSON.parse(f.options().raw,(_k,v,c)=>typeof v==='number'?JSON.rawJSON(c.source):v).result;
 const block={blockhash:s.pins.program,previousBlockhash:s.pins.originMint,parentSlot:49,blockTime:1,blockHeight:49,rewards:[],transactions:[{transaction:exact.transaction,meta:exact.meta,version:exact.version}]};
 const directory=fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(),'block-history-')));fs.chmodSync(directory,0o700);t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const options=()=>{const {raw,...selected}=f.options();return {...selected,rpc:'http://127.0.0.1:21899',evidenceDirectory:directory};};
 const reply=q=>{
  if(q.method==='getTransaction')return envelope(null);if(q.method==='getBlock')return envelope(block);
  if(q.method==='getBlocks')return envelope([50]);if(q.method==='getFirstAvailableBlock'||q.method==='minimumLedgerSlot')return envelope(0);
  if(q.method==='getSignatureStatuses')return envelope({context:{slot:++slot},value:[null]});
  const account=(bytes,owner,executable=false)=>({owner,executable,lamports:1000,data:[bytes.toString('base64'),'base64']});
  return envelope(q.method==='getGenesisHash'?s.pins.genesis:{context:{slot:++slot},value:[account(s.pointer,'BPFLoaderUpgradeab1e11111111111111111111111',true),account(s.data,'BPFLoaderUpgradeab1e11111111111111111111111'),account(s.config,s.pins.program)]});
 };
 const fetcher=async(url,init)=>{const q=JSON.parse(init.body);calls.push(q);return new Response(reply(q),{headers:{'Content-Type':'application/json'}});};return {f,s,calls,block,directory,options,reply,fetcher};
}
test('block extraction preserves exact large native digits through the existing signed economic verifier',t=>{
 const x=fixture(t),o=x.f.options(),raw=extract({raw:envelope(x.block),signature:o.signature,slot:50});assert(raw.includes('9007199254740993'));assert(reviewSelectedSourceTransaction({...o,raw}).selectedEconomicMetadataMatched);
});
test('missing, repeated, non-first, failed and versioned selected transactions refuse',t=>{
 for(const mode of ['missing','duplicate','nonfirst','version','meta','error','null','parent','rewards']){const x=fixture(t),o=x.f.options();let raw;
  if(mode==='missing')x.block.transactions=[];if(mode==='duplicate')x.block.transactions.push(x.block.transactions[0]);if(mode==='nonfirst')x.block.transactions[0].transaction.signatures.reverse();if(mode==='version')x.block.transactions[0].version=0;if(mode==='meta')x.block.transactions[0].meta=null;if(mode==='parent')x.block.parentSlot=50;if(mode==='rewards')x.block.rewards=[{}];raw=mode==='error'?JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-1,message:'unavailable'}}):envelope(mode==='null'?null:x.block);
  assert.throws(()=>extract({raw,signature:o.signature,slot:50}));
 }
});
test('oversized or mismatched block and selected-slot inputs refuse',t=>{
 const x=fixture(t),o=x.f.options();for(const patch of [{raw:' '.repeat(65537)},{slot:0},{slot:2**53},{signature:'invalid'},{raw:JSON.stringify({jsonrpc:'1.0',id:1,result:x.block})},{raw:JSON.stringify({jsonrpc:'2.0',id:2,result:x.block})}])assert.throws(()=>extract({raw:envelope(x.block),signature:o.signature,slot:50,...patch}));
});
test('a missing transaction index can retain and review the exact selected finalized block with fourteen reads',async t=>{
 const x=fixture(t),r=await observe(x.options(),x.fetcher);assert.equal(r.state,'selected-block-metadata-matched');assert(r.selectedEconomicMetadataMatched&&r.selectedBlockMetadataMatched&&r.transactionLookupReturnedNull);assert.equal(r.readOnlyRequests,14);assert.equal(r.chainInclusionVerified,false);assert.equal(r.canBroadcast,false);assert.equal(r.productionReady,false);
 const q=x.calls.find(q=>q.method==='getBlock');assert.deepEqual(q.params,[50,{commitment:'finalized',encoding:'json',transactionDetails:'full',rewards:true,maxSupportedTransactionVersion:0}]);assert(x.calls.every(q=>!q.method.startsWith('send')&&!q.method.startsWith('simulate')));for(const name of ['transaction','status','block','range','first','minimum']){assert.equal(fs.statSync(join(x.directory,name,'response.rpc.json')).mode&0o777,0o600);assert.equal(JSON.parse(fs.readFileSync(join(x.directory,name,'response-record.json'))).reviewAccepted,false);}
});
test('unavailable finalized block remains explicitly blocked with null and RPC error evidence retained',async t=>{
 for(const nullBlock of [false,true]){const x=fixture(t);const r=await observe(x.options(),async(url,init)=>{const q=JSON.parse(init.body);if(q.method==='getBlock')return new Response(nullBlock?envelope(null):JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32009,message:'Unavailable history'}}),{headers:{'Content-Type':'application/json'}});return x.fetcher(url,init);});assert.equal(r.state,'blocked-history-unavailable');assert.equal(r.selectedBlockMetadataMatched,false);assert.equal(r.blockRPCErrorCode,nullBlock?null:-32009);assert.equal(r.canRetry,false);assert.equal(r.settlementAccepted,false);assert.equal(JSON.parse(fs.readFileSync(join(x.directory,'observation.json'))).observation.state,'blocked-history-unavailable');}
});
test('unsafe endpoints, public pins, malformed options or used evidence refuse before RPC',async t=>{
 const x=fixture(t);for(const patch of [{rpc:'http://localhost:21899'},{rpc:'http://127.0.0.1:21899?secret=value'},{pins:{...x.s.pins,genesis:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}},{timeoutMs:30001},{extra:true}])await assert.rejects(observe({...x.options(),...patch},x.fetcher));assert.equal(x.calls.length,0);await observe(x.options(),x.fetcher);await assert.rejects(observe(x.options(),x.fetcher));assert.equal(x.calls.length,14);
});
test('late code, genesis and counter changes cannot promote retained block metadata',async t=>{
 for(const mode of ['code','genesis','counter']){const x=fixture(t);let codeReads=0,genesi=0;await assert.rejects(observe(x.options(),async(url,init)=>{const q=JSON.parse(init.body);if(q.method==='getMultipleAccounts'&&++codeReads===3){if(mode==='code')x.s.data[45]^=1;if(mode==='counter')x.s.config.writeBigUInt64LE(1n,374);}if(q.method==='getGenesisHash'&&++genesi===3&&mode==='genesis')return new Response(envelope(PublicKey.default.toBase58()),{headers:{'Content-Type':'application/json'}});return x.fetcher(url,init);}));assert(fs.existsSync(join(x.directory,'block/response.rpc.json')));assert(!fs.existsSync(join(x.directory,'observation.json')));}
});
test('changed economic movements remain blocked even with matching signed transaction and block request',async t=>{
 const x=fixture(t);x.block.transactions[0].meta.postBalances[0]=JSON.rawJSON('1');const r=await observe(x.options(),x.fetcher);assert.equal(r.state,'blocked-history-unavailable');assert.equal(r.selectedBlockMetadataMatched,false);assert.equal(r.sourceEconomicMovementsIndependentlyVerified,false);
});
test('oversized history response refuses before a later query and retains prior responses',async t=>{
 const x=fixture(t);await assert.rejects(observe(x.options(),async(url,init)=>{if(JSON.parse(init.body).method==='getBlock')return new Response(' '.repeat(65537),{headers:{'Content-Type':'application/json'}});return x.fetcher(url,init);}));assert(fs.existsSync(join(x.directory,'transaction/response.rpc.json')));assert(!fs.existsSync(join(x.directory,'range')));assert(!fs.existsSync(join(x.directory,'observation.json')));
});
async function serve(t,handler){const s=createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(async()=>{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));});return `http://127.0.0.1:${s.address().port}`;}
test('actual loopback HTTP preserves the block record and never follows redirects',async t=>{
 const x=fixture(t);let requests=0;const rpc=await serve(t,async(req,res)=>{requests++;let body='';for await(const b of req)body+=b;res.writeHead(200,{'Content-Type':'application/json'}).end(x.reply(JSON.parse(body)));});assert.equal((await observe({...x.options(),rpc})).state,'selected-block-metadata-matched');assert.equal(requests,14);
 const y=fixture(t);let targetReached=0;const target=await serve(t,(req,res)=>{targetReached++;req.resume();res.end('{}');});const redirect=await serve(t,(req,res)=>{req.resume();res.writeHead(307,{Location:target}).end();});await assert.rejects(observe({...y.options(),rpc:redirect}));assert.equal(targetReached,0);
});
test('the single deadline can expire during preparation before any RPC',async t=>{
 const x=fixture(t);let reads=0,requests=0;
 t.mock.method(performance,'now',()=>reads++===0?0:100);
 await assert.rejects(observe({...x.options(),timeoutMs:100},async()=>{requests++;throw Error('Unexpected request');}),/single deadline/);
 assert.equal(requests,0);assert(!fs.existsSync(join(x.directory,'observation.json')));
});
test('the deadline timer aborts a fetcher that ignores cancellation',async t=>{
 const x=fixture(t);let requests=0;
 // Isolate the real abort timer from preparation-time expiry, covered above.
 t.mock.method(performance,'now',()=>0);
 await assert.rejects(observe({...x.options(),timeoutMs:100},async()=>{requests++;return new Promise(()=>{});}),/single deadline/);
 assert.equal(requests,1);assert(!fs.existsSync(join(x.directory,'observation.json')));
});
test('the deadline timer cancels a started response stream without a completed result',async t=>{
 const x=fixture(t);let requests=0,cancellations=0;
 t.mock.method(performance,'now',()=>0);
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(' '));},cancel(){cancellations++;}});
 await assert.rejects(observe({...x.options(),timeoutMs:100},async()=>{requests++;return new Response(body,{headers:{'Content-Type':'application/json'}});}),/single deadline/);
 assert.equal(requests,1);assert.equal(cancellations,1);assert(!fs.existsSync(join(x.directory,'observation.json')));
});

test('complete block rewards are retained while omitted transaction rewards remain refused',async t=>{
 const x=fixture(t);x.block.rewards=[{pubkey:x.s.pins.program,lamports:5000,postBalance:100000,rewardType:'Fee',commission:null}];const r=await observe(x.options(),x.fetcher);assert(r.selectedEconomicMetadataMatched);assert.equal(r.feeScheduleIndependentlyVerified,false);
 const y=fixture(t);y.block.transactions[0].meta.rewards=null;const blocked=await observe(y.options(),y.fetcher);assert.equal(blocked.state,'blocked-history-unavailable');assert.equal(blocked.selectedBlockMetadataMatched,false);
});
