import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationFixture} from './test-fixtures/gated-destination.mjs';
import {observeGatedClaimDestination as observe} from './gated-claim-observer.mjs';
test('unsafe endpoints, wrong selection and invalid deadline/checkpoint refuse before network',async()=>{
 for(const change of [o=>o.rpc='https://example.com',o=>o.rpc='http://localhost:21899',o=>o.rpc='http://127.0.0.1:21899/?key=1',o=>o.expectedReviewSHA256='0'.repeat(64),o=>o.minimumContextSlot=0,o=>o.timeoutMs=99,o=>o.extra=true]){const f=destinationFixture();change(f.options);let calls=0;await assert.rejects(observe(f.options,async()=>{calls++;throw Error('Unexpected network');}));assert.equal(calls,0);}
});
test('non-JSON, redirected, oversized or rejected initial RPC responses fail closed',async()=>{
 for(const response of [()=>new Response('x'),()=>new Response('{}',{status:502,headers:{'Content-Type':'application/json'}}),()=>new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'2049'}}),()=>({ok:true,redirected:true,body:new ReadableStream(),headers:new Headers({'Content-Type':'application/json'})})]){const f=destinationFixture();await assert.rejects(observe(f.options,async()=>response()));}
});
test('one overall deadline ends even an unresponsive fetch implementation',async()=>{
 const f=destinationFixture(),start=performance.now();await assert.rejects(observe({...f.options,timeoutMs:100},async()=>new Promise(()=>{})),/deadline/);assert(performance.now()-start<2000);
});
