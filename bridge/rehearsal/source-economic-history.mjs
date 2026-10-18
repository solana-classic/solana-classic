// Selected historical source transactions on new private copies; no submissions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {checkCollectedInventory} from './event-collection.mjs';
import {decodeEvent} from './sdk.mjs';
import {checkedClaimPinPolicy} from './claim-pin-policy.mjs';
import {observeSelectedSourceTransaction} from './source-economic-observer.mjs';
export async function checkSourceEconomicHistory({directory:root,phase}){
 await checkCollectedInventory({directory:root,phase});
 const read=name=>JSON.parse(fs.readFileSync(root+'/'+name));
 const persist=(name,v)=>{const fd=fs.openSync(root+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 const config=read('collection-config-private.json'),prior=read('baseline-result-private.json'),historical=read('historical-baseline-private.json');
 const rows=config.selection.map(id=>({id,record:read('journal/'+id+'.json')}));const claim=rows.find(r=>r.record.scope==='isolated-native-claim'),redemption=rows.find(r=>r.record.scope==='isolated-origin-redemption');assert(claim&&redemption);
 assert.equal(historical.state,'passed');assert(historical.processes.allStopped);assert.equal(historical.operation.state,'FINALIZED');assert.equal(historical.operation.id,claim.id);assert.equal(historical.sourceBroadcasts,1);assert.equal(prior.sourceBroadcasts,1);assert.equal(prior.operation.id,redemption.id);
 const selection=[{side:0,id:claim.id,signature:historical.sourceSignature},{side:1,id:redemption.id,signature:prior.sourceSignature}];
 for(const s of selection){assert(typeof s.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(s.signature));const row=rows.find(r=>r.id===s.id);const event=decodeEvent(Buffer.from(row.record.eventBase64,'base64'));assert.equal(event.direction,s.side);s.sourceEvent=event.sourceEvent;}
 assert.notEqual(selection[0].signature,selection[1].signature);
 if(phase==='preflight'){persist('source-history-selection-private.json',selection);return;}
 assert.deepEqual(read('source-history-selection-private.json'),selection);
 const proof=read('private-result.json'),collected=read('collected-inventory-private.json');assert.equal(proof.state,'passed');proof.state='running';proof.scope='Selected current-account and source-transaction economic metadata on new private copies; not complete history, independent finality, historical code, backing or recovery approval';
 const save=()=>fs.writeFileSync(root+'/private-result.json',JSON.stringify(proof,null,2));save();const results=[];
 try{
  for(const s of selection){
   const row=rows.find(r=>r.id===s.id),event=decodeEvent(Buffer.from(row.record.eventBase64,'base64')),pins=checkedClaimPinPolicy(row.record.programmePinPolicy,event,row.record.originMint).source;
   const evidenceDirectory=root+'/source-history-'+s.side;fs.mkdirSync(evidenceDirectory,{mode:0o700});
   const observation=await observeSelectedSourceTransaction({evidenceDirectory,rpc:'http://127.0.0.1:'+config.ports[s.side],pins,snapshot:s.side===0?collected.origin.snapshot:collected.classic.snapshot,signature:s.signature,sourceEvent:s.sourceEvent});
   assert(observation.selectedTransactionSignaturesVerified&&observation.selectedSourceInstructionBound&&observation.selectedEconomicMetadataMatched&&observation.selectedInnerTransfersMatched&&observation.selectedCurrentCodeBracketsObserved);
   for(const k of ['chainInclusionVerified','transactionMetadataIndependentlyVerified','historicalCodeVerified','historicalCountersVerified','feeScheduleIndependentlyVerified','completeSourceEventInventoryVerified','sourceEconomicMovementsIndependentlyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'])assert.equal(observation[k],false);
   persist('source-economic-observation-'+s.side+'-private.json',observation);results.push(observation);proof.checks.push(s.side===0?'Selected signed original lock, token debit/escrow credit, event creation rent and payer fee match retained finalized RPC metadata':'Selected signed native return, exact reserve credit, sender debit, separate event rent and payer fee match retained finalized RPC metadata');save();
  }
  persist('source-economic-history-private.json',results);
  Object.assign(proof,{state:'passed',completedAt:new Date().toISOString(),selectedHistoricalTransactions:2,sourceHistoryReadOnlyRequests:results.reduce((n,r)=>n+r.readOnlyRequests,0),selectedTransactionSignaturesVerified:true,selectedSourceEconomicMetadataMatched:true,selectedInnerTransfersMatched:true,historicalCodeVerified:false,chainInclusionVerified:false,transactionMetadataIndependentlyVerified:false,feeScheduleIndependentlyVerified:false,historicalCountersVerified:false,completeHistoryVerified:false});save();return proof;
 }catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1000);save();throw error;}
}
