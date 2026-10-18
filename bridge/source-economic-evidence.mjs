// Private evidence only. Stored observations do not establish independent truth.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function createSourceEvidenceWriter(directory,selection){
 assert(typeof directory==='string');const root=resolve(directory),initial=fs.lstatSync(root);
 const privateRoot=s=>s.isDirectory()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700;
 assert(privateRoot(initial)&&!initial.isSymbolicLink()&&fs.realpathSync(root)===root,'Evidence requires an owned real mode0700 directory');
 const fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 let closed=false,stage=0,responseSHA256;
 const admitted=()=>{assert(!closed,'Evidence writer closed');const now=fs.lstatSync(root),opened=fs.fstatSync(fd);assert(privateRoot(now)&&privateRoot(opened)&&!now.isSymbolicLink()&&fs.realpathSync(root)===root&&now.dev===opened.dev&&now.ino===opened.ino&&now.dev===initial.dev&&now.ino===initial.ino,'Evidence directory changed');};
 const put=(name,bytes)=>{
  admitted();assert(Buffer.byteLength(bytes)<=1048576,'Evidence record exceeds bound');
  const file=fs.openSync(join(root,name),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{const s=fs.fstatSync(file);assert(s.isFile()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600);fs.writeFileSync(file,bytes);fs.fsyncSync(file);}finally{fs.closeSync(file);}
  admitted();fs.fsyncSync(fd);
 };
 const close=()=>{if(!closed){closed=true;fs.closeSync(fd);}};
 try{assert.equal(fs.readdirSync(root).length,0,'Evidence directory is already used');put('selection.json',JSON.stringify({schemaVersion:1,scope:'private-selected-source-response-v1',selectedAt:new Date().toISOString(),selection}));}
 catch(error){close();throw error;}
 return {
  response(raw,context){
   assert.equal(stage,0,'Response already retained');assert(typeof raw==='string'&&Buffer.byteLength(raw)<=65536);
   const initial=typeof context==='object'&&context!==null;let position;
   if(initial){assert.deepEqual(Object.keys(context),['minimumSelectedContextSlot']);assert(Number.isSafeInteger(context.minimumSelectedContextSlot)&&context.minimumSelectedContextSlot>0);position={minimumSelectedContextSlot:context.minimumSelectedContextSlot};}
   else{assert(Number.isSafeInteger(context)&&context>0);position={firstCodeContextSlot:context};}
   // Preserve exact raw digits, including malformed or null replies, before review.
   put('response.rpc.json',raw);responseSHA256=hash(raw);
   put('response-record.json',JSON.stringify({schemaVersion:initial?2:1,responseSHA256,bytes:Buffer.byteLength(raw),...position,observedAt:new Date().toISOString(),reviewAccepted:false,chainInclusionVerified:false,settlementAccepted:false,productionReady:false}));stage=1;return responseSHA256;
  },
  observation(value){
   assert.equal(stage,1,'A durable response must precede the observation');assert(value&&typeof value==='object'&&!Object.hasOwn(value,'privateTransactionResponse'));
   for(const k of ['chainInclusionVerified','transactionMetadataIndependentlyVerified','historicalCodeVerified','completeSourceEventInventoryVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'])assert.equal(value[k],false);
   put('observation.json',JSON.stringify({schemaVersion:1,responseSHA256,observation:value}));stage=2;
  },close
 };
}
