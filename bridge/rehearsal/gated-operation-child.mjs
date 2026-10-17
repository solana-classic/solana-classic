// Private child process for the one-shot rehearsal. No signing keys or automatic submission.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {takeGatedClaimOperation} from '../gated-claim-operation.mjs';
let input='';for await(const b of process.stdin){input+=b;if(Buffer.byteLength(input)>4096)throw Error('Bounded private query required');}
const query=JSON.parse(input),mode=process.argv[2];
if(mode==='take-crash'){
 const opened=new Map(),open=fs.openSync,close=fs.closeSync,sync=fs.fsyncSync;
 fs.openSync=(path,...args)=>{const fd=open(path,...args);opened.set(fd,String(path));return fd;};
 fs.closeSync=fd=>{opened.delete(fd);return close(fd);};
 fs.fsyncSync=fd=>{sync(fd);if(opened.get(fd)?.endsWith('.attempt.json.pending')){process.stdout.write('CHECKPOINT\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);throw Error('Crash checkpoint was not interrupted');}};
 syncBuiltinESMExports();
}else if(mode!=='take')throw Error('Exact rehearsal child mode required');
try{const result=await takeGatedClaimOperation(query);process.stdout.write(JSON.stringify({...result,rawTransactionBase64:result.rawTransaction.toString('base64'),rawTransaction:undefined})+'\n');}
catch(e){process.stderr.write(String(e.message).slice(0,1024)+'\n');process.exitCode=78;}
