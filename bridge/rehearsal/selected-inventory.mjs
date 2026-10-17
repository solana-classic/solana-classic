// Offline compatibility with retained records and historical declared counters.
// Private directories are supplied by the private launcher, never embedded here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectPendingClaim} from './pending-claim.mjs';
import {reviewPendingInventory} from './pending-inventory.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function checkRetainedInventory({outputDirectory:root,sourceDirectory:source}){
 for(const directory of [root,source]){assert.equal(typeof directory,'string');assert(fs.lstatSync(directory).isDirectory());assert.equal(fs.statSync(directory).mode&0o777,0o700);}
 assert.notEqual(fs.realpathSync(root),fs.realpathSync(source));
 function persist(name,value){const fd=fs.openSync(root+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 function read(name){const path=source+'/'+name;assert(fs.lstatSync(path).isFile());return fs.readFileSync(path);}
 persist('attempt-reserved-private.json',{scope:'Offline selected retained metadata journals; no recovery permission'});
 const proof={schemaVersion:1,state:'running',scope:'Offline compatibility with retained private journals and historical declared counters',checks:[],rpcCalls:0,validatorStarts:0,transactions:0,canonicalNetworkChanged:false,productionReady:false};
 const save=()=>fs.writeFileSync(root+'/private-result.json',JSON.stringify(proof,null,2));
 const pass=name=>{proof.checks.push(name);save();};
 try{
  save();const prior=JSON.parse(read('private-result.json')),attempt=JSON.parse(read('attempt.json')),baseline=JSON.parse(read('baseline-claim-private.json'));
  assert.equal(prior.state,'passed');assert.equal(attempt.state,'passed');assert(prior.processes.allStopped&&prior.originalLedgersUnchanged&&prior.originalPrivateFilesUnchanged);
  assert.equal(prior.sourceBinarySHA256,'3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a');assert.equal(prior.bridgeSBF_SHA256,'556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53');
  assert.equal(prior.claimBroadcasts,0);assert.equal(prior.operation.state,'EXPIRED_UNRESOLVED');assert.equal(prior.operation.attempts,1);assert(prior.realHeightExpiryVerified&&prior.handoffAdmissionsRetained);
  assert.equal(baseline.schemaVersion,3);assert.equal(baseline.state,'FINALIZED');assert.equal(baseline.scope,'isolated-native-claim');assert.notEqual(baseline.id,prior.operation.id);
  for(const id of [baseline.id,prior.operation.id])assert.match(id,/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  const names=['private-result.json','attempt.json','selected-review-private.json','baseline-result-private.json','baseline-claim-private.json','journal/'+prior.operation.id+'.json'];
  const protectedHashes=Object.fromEntries(names.map(name=>[name,hash(read(name))]));
  fs.mkdirSync(root+'/journal',{mode:0o700});
  for(const [name,id] of [['baseline-claim-private.json',baseline.id],['journal/'+prior.operation.id+'.json',prior.operation.id]]){
   const path=root+'/journal/'+id+'.json';fs.copyFileSync(source+'/'+name,path,fs.constants.COPYFILE_EXCL);fs.chmodSync(path,0o600);assert.equal(hash(fs.readFileSync(path)),protectedHashes[name]);
  }
  pass('Two actual version3 journal copies come from one retained completed rehearsal branch with recorded stopped processes and preserved original hashes');
  const claim=await inspectPendingClaim(root+'/journal',baseline.id),redemption=await inspectPendingClaim(root+'/journal',prior.operation.id);
  assert.equal(claim.state,'FINALIZED');assert.equal(claim.scope,'isolated-native-claim');assert.equal(redemption.state,'EXPIRED_UNRESOLVED');assert.equal(redemption.scope,'isolated-origin-redemption');assert.equal(redemption.attempts,1);assert(prior.expiry.lastFinalizedHeight>redemption.lastValidBlockHeight);
  const expectedDomain={bridge:claim.bridge,originChain:claim.sourceChain,nativeChain:claim.destinationChain,originProgram:claim.sourceProgram,nativeProgram:claim.destinationProgram,originMint:claim.originMint,epoch:claim.epoch,originDecimals:claim.originDecimals};
  const accounting=Object.fromEntries(['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','reserveNativeUnits','protectedFloorNativeUnits'].map(key=>[key,prior.final[key]]));
  const selection=[claim,redemption].map(({id,journalHash})=>({id,journalHash})),input={directory:root+'/journal',selection,expectedDomain,accounting};
  const review=await reviewPendingInventory(input);assert.equal(review.selectedJournals,2);assert.equal(review.stateCounts.FINALIZED,1);assert.equal(review.stateCounts.EXPIRED_UNRESOLVED,1);
  assert.equal(review.pending.nativeClaimOriginUnits,'0');assert.equal(review.pending.originalRedemptionOriginUnits,redemption.originAmount);assert.equal(review.pending.totalOriginUnits,redemption.originAmount);assert.equal(review.pending.nativePayoutUnits,'0');assert(review.selectedAccountingEquationMatched);
  persist('selected-inventory-private.json',review);
  pass('Historical declared accounting retains the actual expired original-redemption obligation and separately lists the locally finalized native claim');
  const reversed=await reviewPendingInventory({...input,selection:[...selection].reverse()});assert.equal(reversed.inventorySHA256,review.inventorySHA256);assert.equal(reversed.selectionSHA256,review.selectionSHA256);
  pass('Reordered selection yields the same deterministic private inventory and selection hashes');
  await assert.rejects(reviewPendingInventory({...input,selection:[selection[0]]}),/do not reconcile/);
  await assert.rejects(reviewPendingInventory({...input,accounting:{...accounting,originEscrowUnits:'0',originOutstandingUnits:'0'}}),/do not reconcile/);
  pass('Omitting the unresolved redemption or erasing its declared original escrow obligation refuses against the retained counters');
  await assert.rejects(reviewPendingInventory({...input,selection:[selection[0],selection[0]]}),/Duplicate selected receipt/);
  await assert.rejects(reviewPendingInventory({...input,selection:[selection[0],{...selection[1],journalHash:'f'.repeat(64)}]}),/Selected journal changed/);
  await assert.rejects(reviewPendingInventory({...input,expectedDomain:{...expectedDomain,epoch:(BigInt(expectedDomain.epoch)+1n).toString()}}),/domain or enforced pins differ/);
  pass('Duplicate selection, changed retained hash and another epoch refuse without changing journal bytes');
  for(const key of ['completeSourceEventInventoryVerified','simultaneousSnapshotVerified','sameLedgerHistoryVerified','freshChainStateVerified','finalizedJournalLabelsIndependentlyVerified','codeAndCustodyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'])assert.equal(review[key],false);
  pass('Selected historical compatibility grants no completeness, fresh backing, common-history, settlement or recovery approval');
  assert.deepEqual(Object.fromEntries(names.map(name=>[name,hash(read(name))])),protectedHashes);
  for(const selected of selection)assert.equal(hash(fs.readFileSync(root+'/journal/'+selected.id+'.json')),selected.journalHash);
  assert.deepEqual(fs.readdirSync(root+'/journal').sort(),selection.map(row=>row.id+'.json').sort());
  Object.assign(proof,{retainedOriginalFilesUnchanged:true,copiedJournalBytesUnchanged:true,selectedJournals:2,locallyFinalizedJournals:1,expiredUnresolvedJournals:1,historicalDeclaredAccountingOnly:true,completeSourceEventInventoryVerified:false,freshChainStateVerified:false,sameLedgerHistoryVerified:false,backingVerified:false,recoveryAuthorized:false,settlementAccepted:false});
  pass('Original private inputs and copied journals remain byte-identical with no locks left behind, RPC reads, validator starts or transactions');
  proof.state='passed';proof.completedAt=new Date().toISOString();save();return proof;
 }catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1000);save();throw error;}
}
