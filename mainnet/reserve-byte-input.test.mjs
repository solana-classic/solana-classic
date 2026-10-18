import {mkdtempSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Readable,PassThrough,Writable} from 'node:stream';
const adapterURL=process.env.RESERVE_TEST_ARTIFACT?pathToFileURL(resolve(process.env.RESERVE_TEST_ARTIFACT)):new URL('./reserve-byte-stdio.mjs',import.meta.url);
const adapterPath=fileURLToPath(adapterURL);
const {reserveAdapterResult,readReserveInput,runReserveAdapter,MAX_INPUT_BYTES}=await import(adapterURL.href);
const childOptions={cwd:dirname(adapterPath),env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000,maxBuffer:1024*1024};
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {genesisInventoryMetadataDigest} from './genesis-custody.mjs';
import {planPrefundedReserve} from './reserve-prefund-plan.mjs';
import {preparePrefundedReserveByteInput as prepare,reviewPrefundedReserveOutputBytes as review} from './reserve-byte-input.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),key=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58(),SYSTEM='11111111111111111111111111111111';
const flags=['actualFreshGenesisCompiled','actualAccountBytesDecoded','unchangedAccountBytesIndependentlyVerified','preparerIntegrated','reserveInitialized','backingVerified','custodyVerified','fullValidatorConsensusVerified','canPrepare','canSign','canBroadcast','activationEnabled','productionReady'];
function fixture(){
 const g={genesis:key(90),clusterType:'development',accountCount:2,totalLamports:'1000000000000',accounts:[{address:key(1),owner:SYSTEM,lamports:'900000000000',dataBytes:0,executable:false},{address:key(2),owner:SYSTEM,lamports:'100000000000',dataBytes:0,executable:false}],inflation:{initial:0,terminal:0,taper:0,foundation:0,foundationTerm:0,unused:0},rent:{lamports_per_byte_year:3480,exemption_threshold:2,burn_percent:0},feeRateGovernor:{targetLamportsPerSignature:10000,targetSignaturesPerSlot:20000,minLamportsPerSignature:5000,maxLamportsPerSignature:100000,burnPercent:0}};
 const planningInput={schemaVersion:1,environment:'isolated-rehearsal',genesisAudit:g,expectedGenesis:g.genesis,expectedInventorySHA256:genesisInventoryMetadataDigest(g),reserveAddress:key(1),bridgeProgram:key(50),bridgeId:key(60),originMint:key(70),originDecimals:6,nativeDecimals:9,originSupplyUnits:'1000000000',prelockedOriginUnits:'100001003',protectedReserveNativeUnits:'1002240'};
 const b={schemaVersion:1,scope:'offline-selected-isolated-genesis-allocation-bytes-v1',genesis:g.genesis,creationTime:'1',nonAccountParametersSHA256:'a'.repeat(64),completeAccountFingerprintsComputed:true,accountCount:2,totalNativeUnits:g.totalLamports,accounts:g.accounts.map((a,i)=>({...a,dataSHA256:hash(Buffer.alloc(0)),rentEpoch:'0',accountSHA256:String(i+1).repeat(64)})),stakeAccounts:[],voteAccounts:[],genesisAccountBytesDecoded:true,authorityKeysDecoded:true,keyCustodyVerified:false,lockupEnforcementVerified:false,reserveCustodyVerified:false,backingVerified:false,independentOperatorsVerified:false,consensusVerified:false,canSign:false,canBroadcast:false,mainnetActivated:false,productionReady:false};
 return {planningInput,b};
}
function selected(f=fixture()){const p=planPrefundedReserve(f.planningInput),a=structuredClone(f.b);a.genesis=key(91);a.accounts.find(a=>a.address===p.replacedReserveAddress).address=p.reserveAddress;const x={planningInput:f.planningInput,expectedPlanSHA256:p.planSHA256,rawBaselineDecoded:JSON.stringify(f.b),rawProposedDecoded:JSON.stringify(a),expectedProposedGenesis:a.genesis};return refresh(x);}
function refresh(x){x.expectedBaselineDecodedSHA256=hash(x.rawBaselineDecoded);x.expectedProposedDecodedSHA256=hash(x.rawProposedDecoded);return x;}
const before=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['rawProposedDecoded','expectedProposedDecodedSHA256','expectedProposedGenesis'].includes(k)));
function edited(x,fn,which='rawProposedDecoded'){const v=JSON.parse(x[which]);fn(v);x[which]=JSON.stringify(v);return refresh(x);}
function noPermissions(v){for(const k of flags)assert.equal(v[k],false,k);}
test('exact offline reserve input contains one PDA row and full native units with no compiler permission',()=>{const x=selected(),p=prepare(before(x)),value=JSON.parse(p.primordialReserveJSON);assert.deepEqual(Object.keys(value),[p.reserveAddress]);assert.equal(value[p.reserveAddress].balance,900000000000);assert.equal(value[p.reserveAddress].data,'~');assert.equal(value[p.reserveAddress].owner,SYSTEM);assert.equal(p.unchangedAccountCount,1);assert(p.requiresFreshCompiledOutputReview);noPermissions(p);});
test('synthetic supplied output changes only the reserve address and preserves full fingerprints',()=>{const x=selected(),r=review(x);assert(r.suppliedAccountFingerprintsMatched&&r.singleReserveAddressChangeMatched&&r.nonAccountParametersMatched);assert.equal(r.creationTimeChanged,false);noPermissions(r);});
test('external baseline report, proposal and output hashes are all mandatory',()=>{for(const k of ['expectedPlanSHA256','expectedBaselineDecodedSHA256','expectedProposedDecodedSHA256']){const x=selected();x[k]='0'.repeat(64);assert.throws(()=>review(x));}const x=selected();x.rawBaselineDecoded+=' ';assert.throws(()=>prepare(before(x)));assert.throws(()=>review({...selected(),extra:1}));});
test('unchanged account data, complete account fingerprint and rent epoch cannot be altered with refreshed report selectors',()=>{for(const field of ['dataSHA256','accountSHA256','rentEpoch']){const x=selected();edited(x,d=>d.accounts.find(a=>a.address===key(2))[field]=field==='rentEpoch'?'1':'e'.repeat(64));assert.throws(()=>review(x),/fingerprint changed/);}});
test('renamed reserve must preserve empty bytes, complete account fingerprint and exact rent epoch',()=>{for(const field of ['dataSHA256','accountSHA256','rentEpoch']){const x=selected(),p=prepare(before(x));edited(x,d=>d.accounts.find(a=>a.address===p.reserveAddress)[field]=field==='rentEpoch'?'1':'e'.repeat(64));assert.throws(()=>review(x),/fingerprint changed/);}});
test('owner, balance, executable flag, allocated data and omitted or extra accounts refuse',()=>{for(const change of [d=>d.accounts[0].owner=key(8),d=>d.accounts[0].lamports='899999999999',d=>d.accounts[0].executable=true,d=>d.accounts[0].dataBytes=1,d=>{d.accounts.pop();d.accountCount--;},d=>{d.accounts.push(d.accounts[0]);d.accountCount++;}]){const x=selected();edited(x,change);assert.throws(()=>review(x));}});
test('non-account parameters must match while explicitly reported creation time may differ',()=>{const x=selected();edited(x,d=>d.creationTime='2');assert.equal(review(x).creationTimeChanged,true);edited(x,d=>d.nonAccountParametersSHA256='b'.repeat(64));assert.throws(()=>review(x),/parameters changed/);for(const v of ['0','-1','01','9223372036854775808',1]){const x=selected();edited(x,d=>d.creationTime=v);assert.throws(()=>review(x));}});
test('old, canonical, public and wrongly selected output genesi refuse',()=>{for(const genesis of [key(90),SYSTEM,'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d']){const x=selected();edited(x,d=>d.genesis=genesis);x.expectedProposedGenesis=genesis;assert.throws(()=>review(x));}const x=selected();x.expectedProposedGenesis=key(92);assert.throws(()=>review(x));});
test('baseline metadata, empty reserve bytes and selected decoder schema cannot be fabricated by changing report flags',()=>{for(const change of [d=>d.accounts[0].dataSHA256='e'.repeat(64),d=>d.accounts[0].lamports='900000000001',d=>d.scope='offline-selected-isolated-genesis-authorities',d=>d.completeAccountFingerprintsComputed=false,d=>d.genesisAccountBytesDecoded=false,d=>d.canSign=true,d=>d.accounts[0].extra=true,d=>d.extra=true]){const x=selected();edited(x,change,'rawBaselineDecoded');assert.throws(()=>prepare(before(x)));}});
test('bounded rows and canonical units refuse malformed fingerprints and overflows',()=>{for(const change of [d=>d.accountCount=4097,d=>d.accounts[0].rentEpoch='18446744073709551616',d=>d.accounts[0].lamports='01',d=>d.accounts[0].accountSHA256='F'.repeat(64),d=>d.accounts[0].dataBytes=10485761,d=>d.totalNativeUnits='18446744073709551616']){const x=selected();edited(x,change);assert.throws(()=>review(x));}const x=selected();x.rawBaselineDecoded=' '.repeat(8*1024*1024+1);x.expectedBaselineDecodedSHA256=hash(x.rawBaselineDecoded);assert.throws(()=>prepare(before(x)));});
test('u64 reserve balance is emitted as exact JSON integer digits rather than a rounded number',()=>{const f=fixture(),max='18446744073709551615';f.planningInput.nativeDecimals=f.planningInput.originDecimals=9;f.planningInput.originSupplyUnits=f.planningInput.genesisAudit.totalLamports=max;f.planningInput.genesisAudit.accounts[0].lamports='18446743973709551615';f.planningInput.prelockedOriginUnits='100001002240';f.planningInput.expectedInventorySHA256=genesisInventoryMetadataDigest(f.planningInput.genesisAudit);f.b.totalNativeUnits=max;f.b.accounts[0].lamports='18446743973709551615';const x=selected(f),r=prepare(before(x));assert(r.primordialReserveJSON.includes('"balance":18446743973709551615,'));assert.equal(review(x).totalNativeUnits,max);});
test('account ordering is deterministic and neither input nor selected byte reports are mutated',()=>{const x=selected(),saved=structuredClone(x),input=prepare(before(x)),result=review(x);assert.deepEqual(x,saved);edited(x,d=>d.accounts.reverse(),'rawBaselineDecoded');edited(x,d=>d.accounts.reverse());assert.equal(prepare(before(x)).primordialReserveJSON,input.primordialReserveJSON);assert.deepEqual(review(x),result);});

test('authority summaries cannot change while supplied account fingerprints stay fixed',()=>{for(const field of ['stakeAccounts','voteAccounts']){const x=selected();edited(x,d=>d[field].push({address:key(8)}));assert.throws(()=>review(x),/authority summaries changed/);}});


test('compiler input refuses a reserve rent epoch the primordial loader cannot reproduce',()=>{
 for(const epoch of ['1','18446744073709551615']){const f=fixture();f.b.accounts[0].rentEpoch=epoch;const x=selected(f);assert.throws(()=>prepare(before(x)),/rent epoch/);assert.throws(()=>review(x),/rent epoch/);}
 const f=fixture();f.b.accounts[1].rentEpoch='18446744073709551615';const x=selected(f);assert.equal(prepare(before(x)).reserveNativeUnits,'900000000000');assert(review(x).suppliedAccountFingerprintsMatched);
});

// Real adapter through bounded stdin; all reports below remain supplied fixtures.
test('stdio adapter executes prepare and review with unchanged permissions and no input mutation',()=>{
 const x=selected(),saved=structuredClone(x);
 for(const [mode,input,expected] of [['prepare',before(x),prepare(before(x))],['review',x,review(x)]]){
  const raw=Buffer.from(JSON.stringify(input));assert.deepEqual(JSON.parse(reserveAdapterResult(mode,raw)),expected);
  const child=spawnSync(process.execPath,[adapterPath,mode],{...childOptions,input:raw});
  assert.equal(child.status,0);assert.equal(child.stderr,'');assert.deepEqual(JSON.parse(child.stdout),expected);noPermissions(JSON.parse(child.stdout));
 }
 assert.deepEqual(x,saved);
});
test('stdio adapter retains exact u64 integer text in compiler input',()=>{
 const f=fixture(),max='18446744073709551615';f.planningInput.nativeDecimals=f.planningInput.originDecimals=9;f.planningInput.originSupplyUnits=f.planningInput.genesisAudit.totalLamports=max;f.planningInput.genesisAudit.accounts[0].lamports='18446743973709551615';f.planningInput.prelockedOriginUnits='100001002240';f.planningInput.expectedInventorySHA256=genesisInventoryMetadataDigest(f.planningInput.genesisAudit);f.b.totalNativeUnits=max;f.b.accounts[0].lamports='18446743973709551615';
 const value=JSON.parse(reserveAdapterResult('prepare',Buffer.from(JSON.stringify(before(selected(f))))));assert(value.primordialReserveJSON.includes('"balance":18446743973709551615,'));
});
test('stdio adapter refuses extra arguments, malformed input and wrong selectors without exposing supplied text',()=>{
 const bad=before(selected());bad.expectedPlanSHA256='0'.repeat(64);bad.rawBaselineDecoded='private-marker-do-not-echo';
 for(const [args,input] of [[[],Buffer.from('private-marker-do-not-echo')],[['prepare','extra'],Buffer.from('{}')],[['unknown'],Buffer.from('{}')],[['prepare'],Buffer.from('private-marker-do-not-echo')],[['prepare'],Buffer.from(JSON.stringify(bad))],[['prepare'],Buffer.alloc(0)]]){
  const child=spawnSync(process.execPath,[adapterPath,...args],{...childOptions,input});
  assert.equal(child.status,78);assert.equal(child.stdout,'');assert.equal(child.stderr,'RESERVE_ADAPTER_INPUT_REFUSED\n');
 }
});
test('stdio byte reader handles split input and rejects empty, oversized and failed streams',async()=>{
 const bytes=await readReserveInput(Readable.from([Buffer.from('ab'),Buffer.from('cd')]),{maxBytes:4});assert.equal(bytes.toString(),'abcd');
 await assert.rejects(readReserveInput(Readable.from([])));
 await assert.rejects(readReserveInput(Readable.from([Buffer.alloc(3),Buffer.alloc(2)]),{maxBytes:4}));
 const broken=new Readable({read(){this.destroy(new Error('private-marker-do-not-echo'));}});await assert.rejects(readReserveInput(broken));
});
test('stdio reader has a bounded deadline for an input that never reaches EOF',async()=>{
 const stalled=new PassThrough();await assert.rejects(readReserveInput(stalled,{timeoutMs:25}),/RESERVE_ADAPTER_INPUT_REFUSED/);assert.equal(stalled.destroyed,true);
});
test('stdio adapter rejects oversized and invalid UTF-8 buffers before parsing selected reports',async()=>{
 assert.throws(()=>reserveAdapterResult('prepare',Buffer.alloc(MAX_INPUT_BYTES+1)));
 assert.throws(()=>reserveAdapterResult('prepare',Buffer.from([0xff])));
 for(const options of [{maxBytes:0},{maxBytes:MAX_INPUT_BYTES+1},{timeoutMs:0},{timeoutMs:30001}])await assert.rejects(readReserveInput(Readable.from([]),options));
});

test('stdio runner sanitizes output failures',async()=>{
 const data=Buffer.from(JSON.stringify(before(selected())));let diagnostic='';
 const broken=new Writable({write(_chunk,_encoding,callback){callback(new Error('private-output-error'));}});
 const errors=new Writable({write(chunk,_encoding,callback){diagnostic+=String(chunk);callback();}});
 assert.equal(await runReserveAdapter(['prepare'],Readable.from([data]),broken,errors),78);assert.equal(diagnostic,'RESERVE_ADAPTER_INPUT_REFUSED\n');
});

test('stdio runner preserves refusal status if the diagnostic pipe also fails',async()=>{
 const broken=new Writable({write(_chunk,_encoding,callback){callback(new Error('private-diagnostic-error'));}});
 assert.equal(await runReserveAdapter([],Readable.from([]),new PassThrough(),broken),78);
});


test('stdio CLI runs through a symlink and preserves success and refusal reports',()=>{
 const directory=mkdtempSync(join(tmpdir(),'reserve-cli-link-'));
 try {
  const link=join(directory,'adapter.mjs');symlinkSync(adapterPath,link);
  const input=before(selected()),raw=JSON.stringify(input);
  const success=spawnSync(process.execPath,[link,'prepare'],{...childOptions,input:raw});
  assert.ifError(success.error);assert.equal(success.status,0);assert.equal(success.stderr,'');assert.deepEqual(JSON.parse(success.stdout),prepare(input));
  const refused=spawnSync(process.execPath,[link,'prepare'],{...childOptions,input:'{}'});
  assert.ifError(refused.error);assert.equal(refused.status,78);assert.equal(refused.stdout,'');assert.equal(refused.stderr,'RESERVE_ADAPTER_INPUT_REFUSED\n');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
