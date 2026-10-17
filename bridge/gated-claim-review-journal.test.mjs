import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,chmodSync,rmSync,readFileSync,writeFileSync,statSync,readdirSync,symlinkSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {Transaction,PublicKey} from '@solana/web3.js';
import {fixture} from './test-fixtures/gated-review.mjs';
import {gatedNativeClaimInstruction} from './gated-native.mjs';
import {describeGatedNativeMessage} from './gated-message-review.mjs';
import {initializeGatedClaimReviewDirectory as initialize,retainGatedClaimReview as retain,inspectGatedClaimReview as inspect} from './gated-claim-review-journal.mjs';
const moduleURL=new URL('./gated-claim-review-journal.mjs',import.meta.url).href,marker='.gated-claim-review-v1';
function input(t,init=true){const f=fixture(),directory=realpathSync(mkdtempSync(join(tmpdir(),'gated-retention-')));chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const transaction=new Transaction({feePayer:new PublicKey(f.intent.payer),recentBlockhash:f.intent.recentBlockhash}).add(gatedNativeClaimInstruction(f.intent.parameters).instruction);transaction.sign(...f.signers);
 const args={directory,intent:f.intent,expectedReviewSHA256:describeGatedNativeMessage(f.intent).reviewSHA256,transactionBytes:transaction.serialize()};if(init)initialize(directory);return {f,args};}
const query=(a,id)=>({directory:a.directory,id,expectedReviewSHA256:a.expectedReviewSHA256});
const flags=r=>{assert.equal(r.attempts,0);assert.equal(r.inspectionOnly,true);for(const k of ['chainStateVerified','sourceFinalityVerified','expiryVerified','canPrepareSubmission','canSign','canBroadcast','productionReady'])assert.equal(r[k],false,k);};
const record=(a,id)=>join(a.directory,id+'.json');
function mutate(a,id,fn){const p=record(a,id),r=JSON.parse(readFileSync(p));fn(r);writeFileSync(p,JSON.stringify(r)+'\n');}
test('fresh explicit namespace retains exact reviewed signed bytes privately and exposes only inert summaries',t=>{
 const {args:a}=input(t),r=retain(a),p=record(a,r.id);assert.equal(r.state,'RETAINED_REVIEW_ONLY');assert.equal(statSync(p).mode&0o777,0o600);assert.equal(statSync(join(a.directory,marker)).mode&0o777,0o600);
 assert.equal(JSON.parse(readFileSync(p)).transactionBase64,a.transactionBytes.toString('base64'));assert.equal(inspect(query(a,r.id)).recordSHA256,r.recordSHA256);assert.deepEqual(readdirSync(a.directory).sort(),[marker,r.id+'.json'].sort());flags(r);assert(!Object.hasOwn(r,'transactionBase64'));assert(!Object.hasOwn(r,'intent'));
 const before=readFileSync(p);a.transactionBytes.fill(0);a.intent.parameters.context.configurationBytes.fill(0);a.intent.parameters.bootstrap.recordBytes.fill(0);assert.equal(inspect(query(a,r.id)).recordSHA256,r.recordSHA256);assert.deepEqual(readFileSync(p),before);
});
test('a new process inspects retained bytes with the external selection after the writer exits',t=>{
 const {args:a}=input(t),r=retain(a),before=readFileSync(record(a,r.id));
 const code=`import {inspectGatedClaimReview} from ${JSON.stringify(moduleURL)};let s='';for await(const b of process.stdin)s+=b;console.log(JSON.stringify(inspectGatedClaimReview(JSON.parse(s))));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{input:JSON.stringify(query(a,r.id)),encoding:'utf8',timeout:10000,maxBuffer:8192});assert.equal(child.status,0);const x=JSON.parse(child.stdout);assert.equal(x.recordSHA256,r.recordSHA256);flags(x);assert.deepEqual(readFileSync(record(a,r.id)),before);
});
test('duplicate retention and changed expiry selection cannot replace a receipt domain',t=>{
 const {args:a}=input(t),r=retain(a),before=readFileSync(record(a,r.id));assert.throws(()=>retain(a),/cannot be replaced/);
 a.intent.lastValidBlockHeight++;a.expectedReviewSHA256=describeGatedNativeMessage(a.intent).reviewSHA256;assert.throws(()=>retain(a),/cannot be replaced/);assert.deepEqual(readFileSync(record(a,r.id)),before);
});
test('legacy or nonempty directories cannot be initialized or silently imported',t=>{
 const {args:a}=input(t,false);writeFileSync(join(a.directory,'old.json'),'{}',{mode:0o600});assert.throws(()=>initialize(a.directory),/Fresh empty/);assert.throws(()=>retain(a));assert.deepEqual(readdirSync(a.directory),['old.json']);
});
test('missing initialization and invalid signatures create no review artifact',t=>{
 const {args:a}=input(t,false);assert.throws(()=>retain(a));assert.deepEqual(readdirSync(a.directory),[]);initialize(a.directory);a.transactionBytes[2]^=1;assert.throws(()=>retain(a));assert.deepEqual(readdirSync(a.directory),[marker]);
});
test('partial write markers block retention and inspection without automatic deletion',t=>{
 const {args:a}=input(t),id=gatedNativeClaimInstruction(a.intent.parameters).instruction.keys[3].pubkey.toBase58(),p=record(a,id)+'.pending';writeFileSync(p,'partial',{mode:0o600});assert.throws(()=>retain(a),/Interrupted/);assert.throws(()=>inspect(query(a,id)),/Interrupted/);assert.equal(readFileSync(p,'utf8'),'partial');
});
test('complete publish with leftover hard link remains ambiguous and is preserved for review',t=>{
 const {args:a}=input(t),r=retain(a),p=record(a,r.id);linkSync(p,p+'.pending');assert.throws(()=>inspect(query(a,r.id)),/Interrupted/);assert.throws(()=>retain(a));assert.equal(statSync(p).nlink,2);assert.equal(statSync(p+'.pending').nlink,2);
});
test('wrong external review selection and tampered transaction, intent or identity cannot inspect',t=>{
 for(const change of [r=>r.reviewSHA256='0'.repeat(64),r=>r.transactionSHA256='0'.repeat(64),r=>r.transactionBase64=r.transactionBase64.slice(0,-4)+'AAAA',r=>r.intent.lastValidBlockHeight++,r=>r.intent.context.pins.programDataSHA256='b'.repeat(64),r=>r.id=r.intent.payer,r=>r.attempts=1,r=>r.state='FINALIZED',r=>r.extra=true,r=>r.intent.bootstrap.minimumRentNativeUnits='01002240']){
  const {args:a}=input(t),r=retain(a);mutate(a,r.id,change);assert.throws(()=>inspect(query(a,r.id)));
 }
 const {args:a}=input(t),r=retain(a);assert.throws(()=>inspect({...query(a,r.id),expectedReviewSHA256:'0'.repeat(64)}));
});
test('noncanonical encodings, truncated and oversized files refuse without changing them',t=>{
 for(const change of [b=>Buffer.concat([b,Buffer.from(' ')]),b=>b.subarray(0,20),()=>Buffer.alloc(16385,32)]){const {args:a}=input(t),r=retain(a),p=record(a,r.id),bad=change(readFileSync(p));writeFileSync(p,bad);assert.throws(()=>inspect(query(a,r.id)));assert.deepEqual(readFileSync(p),bad);}
});
test('root, marker and record permissions cannot be shared or symlinked',t=>{
 const {args:a}=input(t),r=retain(a),p=record(a,r.id);chmodSync(p,0o644);assert.throws(()=>inspect(query(a,r.id)));chmodSync(p,0o600);chmodSync(join(a.directory,marker),0o644);assert.throws(()=>inspect(query(a,r.id)));chmodSync(join(a.directory,marker),0o600);chmodSync(a.directory,0o755);assert.throws(()=>inspect(query(a,r.id)));assert.throws(()=>retain(a));chmodSync(a.directory,0o700);
 const {args:b}=input(t,false);const alias=join(b.directory,'alias');symlinkSync(a.directory,alias);assert.throws(()=>inspect({...query(a,r.id),directory:alias}));
});
test('symlink and multiply linked records are refused without following or rewriting them',t=>{
 const {args:a}=input(t),r=retain(a),p=record(a,r.id),backup=join(a.directory,'preserved');linkSync(p,backup);assert.throws(()=>inspect(query(a,r.id)));rmSync(p);symlinkSync(backup,p);assert.throws(()=>inspect(query(a,r.id)));assert.equal(statSync(backup).nlink,1);
});
test('changed namespace, marker partials and reinitialization cannot adopt old contents',t=>{
 for(const change of [a=>writeFileSync(join(a.directory,marker),'wrong'),a=>writeFileSync(join(a.directory,marker+'.pending'),'partial',{mode:0o600})]){const {args:a}=input(t),r=retain(a);change(a);assert.throws(()=>inspect(query(a,r.id)));assert.throws(()=>retain(a));assert.throws(()=>initialize(a.directory));}
});
test('wrong kinds, receipt traversal and unknown API fields refuse without extra writes',t=>{
 const {args:a}=input(t),before=readdirSync(a.directory);assert.throws(()=>retain({...a,extra:true}));assert.throws(()=>retain({...a,intent:{...a.intent,kind:'return'}}));assert.throws(()=>inspect({...query(a,'../../old'),extra:true}));assert.throws(()=>inspect(query(a,'../../old')));assert.deepEqual(readdirSync(a.directory),before);
});
test('module exports no handoff, broadcast, signing, retry or recovery mutation API',async()=>{
 const api=await import('./gated-claim-review-journal.mjs');assert.deepEqual(Object.keys(api).sort(),['initializeGatedClaimReviewDirectory','inspectGatedClaimReview','retainGatedClaimReview']);
});

test('two real writer processes retain one receipt exactly once without overwrite or leftover partials',async t=>{
 const {args:a}=input(t),payload=JSON.stringify({...a,transactionBytes:a.transactionBytes.toString('base64')},(_,v)=>typeof v==='bigint'?{$u64:v.toString()}:v);
 const code=`import {retainGatedClaimReview} from ${JSON.stringify(moduleURL)};let s='';for await(const b of process.stdin)s+=b;try{const a=JSON.parse(s,(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&'$u64' in v?BigInt(v.$u64):v&&v.type==='Buffer'&&Array.isArray(v.data)?Buffer.from(v.data):v);a.transactionBytes=Buffer.from(a.transactionBytes,'base64');console.log(JSON.stringify(retainGatedClaimReview(a)));}catch{process.exitCode=78;}`;
 const launch=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['pipe','pipe','pipe'],timeout:10000,killSignal:'SIGKILL'});let output='',size=0;
  child.on('error',reject);child.stdout.on('data',b=>{size+=b.length;if(size>8192)child.kill('SIGKILL');else output+=b;});child.stderr.on('data',b=>{size+=b.length;if(size>8192)child.kill('SIGKILL');});child.stdin.on('error',()=>{});child.on('close',status=>resolve({status,output}));child.stdin.end(payload);
 });
 const results=await Promise.all([launch(),launch()]);assert.deepEqual(results.map(r=>r.status).sort((x,y)=>x-y),[0,78]);const kept=JSON.parse(results.find(r=>r.status===0).output);assert.equal(inspect(query(a,kept.id)).recordSHA256,kept.recordSHA256);assert.deepEqual(readdirSync(a.directory).sort(),[marker,kept.id+'.json'].sort());flags(kept);
});
