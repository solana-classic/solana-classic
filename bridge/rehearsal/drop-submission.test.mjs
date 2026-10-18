import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {dropOriginalSubmission,DROP_PORT} from './drop-submission.mjs';
const reusable=async()=>{const server=http.createServer();try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(DROP_PORT,'127.0.0.1',resolve);});}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}};
test('one complete local request is dropped without acknowledgement or forwarding and its listener closes',async()=>{
 const result=await dropOriginalSubmission(Buffer.alloc(1232,7));
 assert.deepEqual(result,{completeSubmissionRequests:1,forwardedRequests:0,rpcAcknowledgements:0,clientTransportFailed:true,transportErrorType:'TypeError',dropServerClosed:true,controlledDrop:true,arbitraryUnknownLandingVerified:false});await reusable();
});
test('empty, oversized and non-byte inputs refuse without taking the local port',async()=>{
 for(const value of [Buffer.alloc(0),Buffer.alloc(1233),'signed bytes',[1,2,3],null])await assert.rejects(dropOriginalSubmission(value));await reusable();
});
test('an occupied port refuses without touching the unrelated listener',async()=>{
 let requests=0;const server=http.createServer((req,res)=>{requests++;res.end('unrelated');});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(DROP_PORT,'127.0.0.1',resolve);});await assert.rejects(dropOriginalSubmission(Buffer.from([1])),{code:'EADDRINUSE'});assert(server.listening);assert.equal(requests,0);}finally{await new Promise(resolve=>server.close(resolve));}await reusable();
});
