// Immutable private review retention only; no handoff, signing, network or retry API.
import {constants,openSync,closeSync,fsyncSync,writeFileSync,readSync,fstatSync,lstatSync,realpathSync,readdirSync,linkSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {encodeEvent,decodeEvent} from './sdk.mjs';
import {normalizeProgramPins} from './program-pins.mjs';
import {gatedNativeClaimInstruction} from './gated-native.mjs';
import {reviewGatedNativeSignedTransaction} from './gated-message-review.mjs';
const MARKER='.gated-claim-review-v1',MAGIC='solana-classic/private-gated-claim-review/v1\n',MAX=16384;
const hash=b=>createHash('sha256').update(b).digest('hex');
function shape(v,fields){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))throw Error('Exact private gated review schema required');}
function privateStat(s,mode){if(s.uid!==process.getuid()||(s.mode&0o7777)!==mode)throw Error('Owned private gated review permissions required');}
function root(directory){
 if(typeof directory!=='string'||realpathSync(directory)!==resolve(directory))throw Error('Canonical private gated review directory required');
 const s=lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Real gated review directory required');privateStat(s,0o700);
 return {path:resolve(directory),dev:s.dev,ino:s.ino};
}
function sameRoot(r){const s=lstatSync(r.path);if(!s.isDirectory()||s.isSymbolicLink()||s.dev!==r.dev||s.ino!==r.ino||realpathSync(r.path)!==r.path)throw Error('Private review directory changed');privateStat(s,0o700);}
function exists(p){try{lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function readPrivate(r,name){
 sameRoot(r);const fd=openSync(join(r.path,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<=0||s.size>MAX)throw Error('Bounded single-link private review file required');privateStat(s,0o600);
  const b=Buffer.alloc(s.size+1);let n=0;while(n<b.length){const count=readSync(fd,b,n,b.length-n,n);if(count===0)break;n+=count;}const end=fstatSync(fd);if(n!==s.size||end.size!==s.size||end.mtimeMs!==s.mtimeMs||end.ctimeMs!==s.ctimeMs)throw Error('Private review file changed during read');sameRoot(r);return b.subarray(0,n);
 }finally{closeSync(fd);}
}
function noPending(r,name){if(exists(join(r.path,name+'.pending')))throw Error('Interrupted review write requires operator review');}
function admitted(directory){const r=root(directory);noPending(r,MARKER);if(readPrivate(r,MARKER).toString()!==MAGIC)throw Error('Separate gated review namespace required');return r;}
function exclusive(r,name,bytes){
 sameRoot(r);if(bytes.length>MAX||exists(join(r.path,name)))throw Error('Existing or oversized review cannot be replaced');
 noPending(r,name);let fd;
 try{
  fd=openSync(join(r.path,name+'.pending'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;sameRoot(r);
  // A link publishes complete bytes atomically and cannot replace an existing target.
  linkSync(join(r.path,name+'.pending'),join(r.path,name));unlinkSync(join(r.path,name+'.pending'));
  const dir=openSync(r.path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{fsyncSync(dir);}finally{closeSync(dir);}sameRoot(r);
 }finally{if(fd!==undefined)closeSync(fd);}
 // Failed/interrupted files are deliberately retained. There is no automatic cleanup.
}
function hex(v,n){if(typeof v!=='string'||v.length!==n*2||! /^[a-f0-9]+$/.test(v))throw Error('Canonical bounded review bytes required');return Buffer.from(v,'hex');}
function integer(v){if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>(1n<<64n)-1n)throw Error('Canonical review u64 required');return BigInt(v);}
function wire(intent){const p=intent.parameters;return {payer:intent.payer,recentBlockhash:intent.recentBlockhash,lastValidBlockHeight:intent.lastValidBlockHeight,
 context:{abi:p.context.abi,pins:normalizeProgramPins(p.context.pins),configurationHex:Buffer.from(p.context.configurationBytes).toString('hex')},
 bootstrap:{recordHex:Buffer.from(p.bootstrap.recordBytes).toString('hex'),expectedRecordSHA256:p.bootstrap.expectedRecordSHA256,expectedSourceEvent:p.bootstrap.expectedSourceEvent,minimumRentNativeUnits:p.bootstrap.minimumRentNativeUnits.toString()},
 eventHex:encodeEvent(p.event).toString('hex'),committee:[...p.committee],recipient:p.recipient};}
function intentFrom(w){
 shape(w,['payer','recentBlockhash','lastValidBlockHeight','context','bootstrap','eventHex','committee','recipient']);shape(w.context,['abi','pins','configurationHex']);shape(w.bootstrap,['recordHex','expectedRecordSHA256','expectedSourceEvent','minimumRentNativeUnits']);
 return {kind:'claim',payer:w.payer,recentBlockhash:w.recentBlockhash,lastValidBlockHeight:w.lastValidBlockHeight,parameters:{payer:w.payer,recipient:w.recipient,committee:w.committee,
 context:{abi:w.context.abi,pins:normalizeProgramPins(w.context.pins),configurationBytes:hex(w.context.configurationHex,382)},
 bootstrap:{recordBytes:hex(w.bootstrap.recordHex,120),expectedRecordSHA256:w.bootstrap.expectedRecordSHA256,expectedSourceEvent:w.bootstrap.expectedSourceEvent,minimumRentNativeUnits:integer(w.bootstrap.minimumRentNativeUnits)},event:decodeEvent(hex(w.eventHex,297))}};
}
function idOf(intent){return gatedNativeClaimInstruction(intent.parameters).instruction.keys[3].pubkey.toBase58();}
function identifier(id){if(typeof id!=='string'||new PublicKey(id).toBase58()!==id||id==='11111111111111111111111111111111')throw Error('Canonical review receipt ID required');return id;}
function summary(record,bytes){return {schemaVersion:1,scope:record.scope,state:record.state,id:record.id,attempts:0,reviewSHA256:record.reviewSHA256,transactionSHA256:record.transactionSHA256,recordSHA256:hash(bytes),inspectionOnly:true,
 chainStateVerified:false,sourceFinalityVerified:false,expiryVerified:false,canPrepareSubmission:false,canSign:false,canBroadcast:false,productionReady:false};}
export function initializeGatedClaimReviewDirectory(directory){const r=root(directory);if(readdirSync(r.path).length!==0)throw Error('Fresh empty gated review namespace required');exclusive(r,MARKER,Buffer.from(MAGIC));return {scope:'private-gated-claim-review-v1',state:'REVIEW_DIRECTORY_INITIALIZED',canPrepareSubmission:false,canSign:false,canBroadcast:false,productionReady:false};}
export function retainGatedClaimReview(input){
 shape(input,['directory','intent','expectedReviewSHA256','transactionBytes']);
 if(input.intent?.kind!=='claim')throw Error('Only gated native claim review retention is supported');
 const supplied=input.transactionBytes,expectedReviewSHA256=input.expectedReviewSHA256;
 if(!(supplied instanceof Uint8Array)||supplied.byteLength===0||supplied.byteLength>1232)throw Error('Bounded signed claim bytes required');
 const raw=Buffer.from(supplied);reviewGatedNativeSignedTransaction({intent:input.intent,expectedReviewSHA256,transactionBytes:raw});
 const stored=wire(input.intent),snapshot=intentFrom(stored);
 const reviewed=reviewGatedNativeSignedTransaction({intent:snapshot,expectedReviewSHA256,transactionBytes:raw});
 const record={schemaVersion:1,scope:'private-gated-claim-review-v1',state:'RETAINED_REVIEW_ONLY',attempts:0,id:idOf(snapshot),reviewSHA256:reviewed.reviewSHA256,intent:stored,transactionBase64:raw.toString('base64'),transactionSHA256:reviewed.transactionSHA256};
 const bytes=Buffer.from(JSON.stringify(record)+'\n');const r=admitted(input.directory);exclusive(r,record.id+'.json',bytes);return summary(record,bytes);
}
export function inspectGatedClaimReview(input){
 shape(input,['directory','id','expectedReviewSHA256']);const id=identifier(input.id),r=admitted(input.directory),name=id+'.json';noPending(r,name);const bytes=readPrivate(r,name),record=JSON.parse(bytes.toString());
 shape(record,['schemaVersion','scope','state','attempts','id','reviewSHA256','intent','transactionBase64','transactionSHA256']);
 if(record.schemaVersion!==1||record.scope!=='private-gated-claim-review-v1'||record.state!=='RETAINED_REVIEW_ONLY'||record.attempts!==0||record.id!==id||record.reviewSHA256!==input.expectedReviewSHA256||!Buffer.from(JSON.stringify(record)+'\n').equals(bytes)||typeof record.transactionBase64!=='string'||record.transactionBase64.length>1644)throw Error('Retained gated review contract changed');
 const intent=intentFrom(record.intent),raw=Buffer.from(record.transactionBase64,'base64');
 if(raw.toString('base64')!==record.transactionBase64||idOf(intent)!==id||hash(raw)!==record.transactionSHA256)throw Error('Retained receipt or signed bytes changed');
 reviewGatedNativeSignedTransaction({intent,expectedReviewSHA256:input.expectedReviewSHA256,transactionBytes:raw});return summary(record,bytes);
}
