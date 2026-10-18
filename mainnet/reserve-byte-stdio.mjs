// Bounded offline adapter transport. No compiler, keys, filesystem output or RPC.
import {realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {preparePrefundedReserveByteInput,reviewPrefundedReserveOutputBytes} from './reserve-byte-input.mjs';
export const MAX_INPUT_BYTES=32*1024*1024;
export const MAX_OUTPUT_BYTES=1024*1024;
const failure=()=>new Error('RESERVE_ADAPTER_INPUT_REFUSED');

export async function readReserveInput(stream,{maxBytes=MAX_INPUT_BYTES,timeoutMs=30000}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_INPUT_BYTES||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw failure();
 const chunks=[];let length=0;
 const timer=setTimeout(()=>stream.destroy(failure()),timeoutMs);
 try{
  for await(const chunk of stream){
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=bytes.length;
   if(length>maxBytes){stream.destroy();throw failure();}
   chunks.push(bytes);
  }
  if(length===0)throw failure();
  return Buffer.concat(chunks,length);
 }finally{clearTimeout(timer);}
}
export function reserveAdapterResult(mode,raw){
 if(!['prepare','review'].includes(mode)||!Buffer.isBuffer(raw)||raw.length===0||raw.length>MAX_INPUT_BYTES)throw failure();
 // Reject invalid UTF-8 instead of silently replacing bytes in selected reports.
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 const input=JSON.parse(text);
 const result=mode==='prepare'?preparePrefundedReserveByteInput(input):reviewPrefundedReserveOutputBytes(input);
 const output=Buffer.from(JSON.stringify(result)+'\n');
 if(output.length>MAX_OUTPUT_BYTES)throw failure();
 return output;
}
async function writeResult(stream,bytes){
 const absorb=()=>{};stream.once('error',absorb);
 await new Promise((done,refused)=>stream.write(bytes,error=>error?refused(error):done()));
 stream.off('error',absorb);
}
export async function runReserveAdapter(args,input,output,errors){
 try{
  if(args.length!==1||!['prepare','review'].includes(args[0]))throw failure();
  const result=reserveAdapterResult(args[0],await readReserveInput(input));
  await writeResult(output,result);
  return 0;
 }catch{
  // Input reports can contain private operational selections; never echo them,
  // dependency assertions, paths, stacks or supplied fields on refusal.
  try{await writeResult(errors,'RESERVE_ADAPTER_INPUT_REFUSED\n');}catch{/* A closed diagnostic pipe cannot carry a refusal. */}
  return 78;
 }
}
// Module URLs follow symlinks; normalize the executable argument the same way.
function isEntrypoint(){
 if(!process.argv[1])return false;
 try{return import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href;}
 catch{return false;}
}
if(isEntrypoint()){
 process.exitCode=await runReserveAdapter(process.argv.slice(2),process.stdin,process.stdout,process.stderr);
}
