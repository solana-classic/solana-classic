import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createSourceEvidenceWriter as writer} from './source-economic-evidence.mjs';
function temp(t){const path=fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(),'source-evidence-')));fs.chmodSync(path,0o700);t.after(()=>fs.rmSync(path,{recursive:true,force:true}));return path;}
const read=(p,n)=>fs.readFileSync(join(p,n),'utf8');
const observation=()=>Object.fromEntries(['chainInclusionVerified','transactionMetadataIndependentlyVerified','historicalCodeVerified','completeSourceEventInventoryVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'].map(k=>[k,false]));
test('raw response digits and incomplete-review status survive close with owner-only files',t=>{
 const p=temp(t),w=writer(p,{signature:'synthetic-private-selection'}),raw=' {"jsonrpc":"2.0","id":1,"result":{"balance":18446744073709551615}}\n';w.response(raw,5);w.close();
 assert.equal(read(p,'response.rpc.json'),raw);const r=JSON.parse(read(p,'response-record.json'));assert.equal(r.responseSHA256,createHash('sha256').update(raw).digest('hex'));assert.equal(r.reviewAccepted,false);assert.equal(r.settlementAccepted,false);assert(!fs.existsSync(join(p,'observation.json')));for(const n of fs.readdirSync(p))assert.equal(fs.statSync(join(p,n)).mode&0o777,0o600);
});
test('a completed observation binds the retained response without elevating permissions',t=>{
 const p=temp(t),w=writer(p,{});w.response('null',1);w.observation(observation());w.close();const r=JSON.parse(read(p,'observation.json'));assert.equal(r.responseSHA256,JSON.parse(read(p,'response-record.json')).responseSHA256);assert.equal(r.observation.productionReady,false);
});
test('reuse and out-of-order writes refuse without replacing retained bytes',t=>{
 const p=temp(t),w=writer(p,{});assert.throws(()=>w.observation(observation()));w.response('null',1);const before=read(p,'response.rpc.json');assert.throws(()=>w.response('{}',1));assert.throws(()=>writer(p,{}));w.observation(observation());assert.throws(()=>w.observation(observation()));w.close();w.close();assert.throws(()=>w.response('{}',1));assert.equal(read(p,'response.rpc.json'),before);
});
test('public directories, symbolic roots and aliased parents refuse before records',t=>{
 const base=temp(t),p=join(base,'private');fs.mkdirSync(p,{mode:0o700});fs.chmodSync(p,0o755);assert.throws(()=>writer(p,{}));assert.deepEqual(fs.readdirSync(p),[]);fs.chmodSync(p,0o700);fs.symlinkSync(p,join(base,'link'));assert.throws(()=>writer(join(base,'link'),{}));fs.mkdirSync(join(p,'child'),{mode:0o700});assert.throws(()=>writer(join(base,'link','child'),{}));
});
test('a planted file or symbolic target is never replaced or followed',t=>{
 for(const link of [false,true]){const base=temp(t),p=join(base,'attempt');fs.mkdirSync(p,{mode:0o700});const target=join(base,'target');fs.writeFileSync(target,'unchanged');const w=writer(p,{});if(link)fs.symlinkSync(target,join(p,'response.rpc.json'));else fs.writeFileSync(join(p,'response.rpc.json'),'unchanged',{mode:0o600});assert.throws(()=>w.response('null',1));w.close();assert.equal(read(base,'target'),'unchanged');assert.equal(read(p,'response.rpc.json'),'unchanged');}
});
test('directory replacement or permission broadening stops future retention',t=>{
 for(const replace of [false,true]){const base=temp(t),p=join(base,'attempt');fs.mkdirSync(p,{mode:0o700});const w=writer(p,{});if(replace){fs.renameSync(p,join(base,'original'));fs.mkdirSync(p,{mode:0o700});}else fs.chmodSync(p,0o755);assert.throws(()=>w.response('null',1));w.close();assert(!fs.existsSync(join(p,'response.rpc.json')));}
});
test('oversized, invalid or permission-promoting records refuse and retain earlier evidence',t=>{
 const p=temp(t),w=writer(p,{});for(const args of [['x'.repeat(65537),1],['null',0],['null',1.5]])assert.throws(()=>w.response(...args));assert(!fs.existsSync(join(p,'response.rpc.json')));w.response('null',1);assert.throws(()=>w.observation({...observation(),canBroadcast:true}));assert.throws(()=>w.observation({...observation(),privateTransactionResponse:'null'}));assert.throws(()=>w.observation({...observation(),oversized:'x'.repeat(1048576)}));w.close();assert.equal(read(p,'response.rpc.json'),'null');assert(!fs.existsSync(join(p,'observation.json')));
});

test('a killed review process leaves its fsynced response available without a completed observation',t=>{
 const p=temp(t),module=new URL('./source-economic-evidence.mjs',import.meta.url).href;
 const source=`import {createSourceEvidenceWriter} from ${JSON.stringify(module)};const w=createSourceEvidenceWriter(process.argv[1],{});w.response('{"jsonrpc":"2.0","id":1,"result":null}',1);process.kill(process.pid,'SIGKILL');`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',source,p],{timeout:5000,encoding:'utf8'});assert.equal(child.signal,'SIGKILL');assert.equal(JSON.parse(read(p,'response.rpc.json')).result,null);assert.equal(JSON.parse(read(p,'response-record.json')).reviewAccepted,false);assert(!fs.existsSync(join(p,'observation.json')));assert.throws(()=>writer(p,{}));
});

test('initial selected context is labeled separately from a code observation',t=>{
 const p=temp(t),w=writer(p,{});assert.throws(()=>w.response('null',{minimumSelectedContextSlot:0}));assert.throws(()=>w.response('null',{minimumSelectedContextSlot:1,extra:true}));w.response('null',{minimumSelectedContextSlot:1});w.close();const r=JSON.parse(read(p,'response-record.json'));assert.equal(r.schemaVersion,2);assert.equal(r.minimumSelectedContextSlot,1);assert(!Object.hasOwn(r,'firstCodeContextSlot'));
});
