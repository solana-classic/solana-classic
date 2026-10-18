// Read-only current account comparison on new private ledger copies.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeEvent} from './sdk.mjs';
import {checkedClaimPinPolicy} from './claim-pin-policy.mjs';
import {checkedReviewedOriginMintPolicy,observeReviewedOriginAssets} from './reviewed-origin-mint.mjs';
import {inspectPendingClaim} from './pending-claim.mjs';
import {reviewPendingInventory} from './pending-inventory.mjs';
import {collectReturnedProgramAccounts} from './program-account-collector.mjs';
import {reconcileEventInventory} from './event-inventory.mjs';
import {COLLECTION_PERMISSIONS as permissions,compareCollectedWithSelected} from './event-collection-comparison.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function checkCollectedInventory({directory:root,phase}){
 assert(['preflight','collect'].includes(phase));assert(fs.lstatSync(root).isDirectory());assert.equal(fs.statSync(root).mode&0o777,0o700);
 const read=name=>JSON.parse(fs.readFileSync(root+'/'+name));
 const persist=(name,value)=>{const fd=fs.openSync(root+'/'+name,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
 persist('phase-'+phase+'-reserved-private.json',{scope:'private-read-only-account-collection',phase});
 const config=read('collection-config-private.json'),prior=read('baseline-result-private.json'),review=checkedReviewedOriginMintPolicy(read('selected-review-private.json'));
 assert.deepEqual(Object.keys(config).sort(),['ports','selection'].sort());assert.equal(config.ports.length,2);assert(config.ports.every(p=>Number.isInteger(p)&&p>1024&&p<65000));assert.equal(new Set(config.ports).size,2);
 assert.equal(prior.state,'passed');assert.equal(prior.operation.state,'EXPIRED_UNRESOLVED');assert(prior.processes.allStopped&&prior.originalLedgersUnchanged&&prior.originalPrivateFilesUnchanged);
 assert.equal(prior.claimBroadcasts,0);assert.equal(prior.settlementAccepted,false);assert.equal(prior.canonicalNetworkChanged,false);assert.equal(prior.productionReady,false);
 assert.equal(config.selection.length,2);const inspections=[],records=[],journalBytes=new Map();
 for(const id of config.selection){assert.match(id,/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);const bytes=fs.readFileSync(root+'/journal/'+id+'.json');journalBytes.set(id,hash(bytes));const r=read('journal/'+id+'.json'),i=await inspectPendingClaim(root+'/journal',id);assert.equal(hash(JSON.stringify(r)),i.journalHash);assert.equal(r.schemaVersion,3);records.push(r);inspections.push(i);}
 assert.equal(new Set(inspections.map(r=>r.id)).size,2);
 const native=records.find(r=>r.scope==='isolated-native-claim'),redemption=records.find(r=>r.scope==='isolated-origin-redemption');assert(native&&redemption);
 assert.equal(native.state,'FINALIZED');assert.equal(redemption.state,'EXPIRED_UNRESOLVED');assert.equal(redemption.id,prior.operation.id);assert.equal(redemption.attempts,1);
 const event=decodeEvent(Buffer.from(native.eventBase64,'base64')),pins=checkedClaimPinPolicy(native.programmePinPolicy,event,review.pins.originMint);
 assert.equal(event.direction,0);assert.deepEqual(review.pins,pins.source);assert.equal(native.reviewedMintPolicy.sha256,review.sha256);
 const other=checkedClaimPinPolicy(redemption.programmePinPolicy,decodeEvent(Buffer.from(redemption.eventBase64,'base64')),review.pins.originMint);
 assert.deepEqual(other.source,pins.destination);assert.deepEqual(other.destination,pins.source);assert.equal(redemption.reviewedMintPolicy.sha256,review.sha256);
 const minimums=[Math.max(native.sourceContextSlot,redemption.minimumDestinationSlot),Math.max(native.minimumDestinationSlot,redemption.sourceContextSlot)];assert(minimums.every(n=>Number.isSafeInteger(n)&&n>0));
 const expectedDomain={bridge:event.bridge,originChain:event.sourceChain,nativeChain:event.destinationChain,originProgram:event.sourceProgram,nativeProgram:event.destinationProgram,originMint:review.pins.originMint,epoch:event.epoch.toString(),originDecimals:review.expectedDecimals};
 if(phase==='preflight'){persist('preflight-private.json',{genesi:[pins.source.genesis,pins.destination.genesis],minimums,journalBytes:Object.fromEntries(journalBytes)});return;}
 const preflight=read('preflight-private.json');assert.deepEqual(preflight.genesi,[pins.source.genesis,pins.destination.genesis]);assert.deepEqual(preflight.minimums,minimums);assert.deepEqual(preflight.journalBytes,Object.fromEntries(journalBytes));
 const rpc=side=>'http://127.0.0.1:'+config.ports[side];let rpcCalls=0;
 const fetcher=(url,init)=>{assert([rpc(0)+'/',rpc(1)+'/',rpc(0),rpc(1)].includes(url));const q=JSON.parse(init.body);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert(['getGenesisHash','getMultipleAccounts','getProgramAccounts'].includes(q.method));assert(++rpcCalls<=64);return fetch(url,init);};
 const proof={schemaVersion:1,state:'running',scope:'Current returned programme accounts and selected retained journals on new same-host private ledger copies; not independent history, backing or recovery approval',checks:[],broadcasts:0,simulations:0,handoffs:0,signaturesCreated:0,canonicalNetworkChanged:false,...Object.fromEntries(permissions.map(k=>[k,false]))};
 const save=()=>fs.writeFileSync(root+'/private-result.json',JSON.stringify(proof,null,2));const pass=name=>{proof.checks.push(name);save();};
 try{
  save();
  const assets=await observeReviewedOriginAssets({rpc:rpc(0),policy:review,minimumContextSlot:minimums[0]},fetcher);
  const origin=await collectReturnedProgramAccounts({rpc:rpc(0),pins:pins.source,minimumContextSlot:Math.max(minimums[0],assets.finalTokenContextSlot)},fetcher);
  const classic=await collectReturnedProgramAccounts({rpc:rpc(1),pins:pins.destination,minimumContextSlot:minimums[1]},fetcher);
  const assetsAfter=await observeReviewedOriginAssets({rpc:rpc(0),policy:review,minimumContextSlot:origin.finalCodeContextSlot},fetcher);
  assert.equal(assets.assetDataSHA256,assetsAfter.assetDataSHA256);assert.equal(assets.originEscrowUnits,assetsAfter.originEscrowUnits);
  pass('Selected Token-2022 and bridge code, complete metadata mint and escrow match before and after bounded programme collection');
  for(const v of [origin,classic]){assert.equal(v.observations,2);assert.equal(v.requestCount,10);assert(v.stableReturnedAccountsObserved&&v.selectedCodeAndPolicyBracketed);for(const k of permissions)assert.equal(v[k],false);}
  pass('Both copied ledgers return two matching unfiltered finalized programme sets with exact balances and unchanged selected code/configuration');
  const inventory=reconcileEventInventory({pins:{origin:pins.source,native:pins.destination},originSnapshot:origin.snapshot,nativeSnapshot:classic.snapshot,originEscrowUnits:assetsAfter.originEscrowUnits,minimumContextSlots:minimums});
  for(const k of ['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','reserveNativeUnits','protectedFloorNativeUnits'])assert.equal(inventory.accounting[k],prior.final[k]);
  pass('Returned source events and consumed receipts reconcile current origin/native counters, separately observed escrow and stored native reserve floor');
  const accounting=Object.fromEntries(['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','reserveNativeUnits','protectedFloorNativeUnits'].map(k=>[k,inventory.accounting[k]]));
  const selected=await reviewPendingInventory({directory:root+'/journal',selection:inspections.map(({id,journalHash})=>({id,journalHash})),expectedDomain,accounting});
  const compared=compareCollectedWithSelected(inventory,selected,inspections);assert.equal(selected.stateCounts.FINALIZED,1);assert.equal(selected.stateCounts.EXPIRED_UNRESOLVED,1);
  pass('Fresh returned event/receipt states and pending amounts match the selected finalized-label claim and expired unresolved redemption without altering either journal');
  assert.equal(inventory.pending.nativeClaimOriginUnits,'0');assert.equal(inventory.pending.originalRedemptionOriginUnits,inspections.find(r=>r.scope==='isolated-origin-redemption').originAmount);
  for(const row of inspections){assert.equal(hash(fs.readFileSync(root+'/journal/'+row.id+'.json')),journalBytes.get(row.id));assert.equal((await inspectPendingClaim(root+'/journal',row.id)).journalHash,row.journalHash);}
  assert.deepEqual(fs.readdirSync(root+'/journal').sort(),config.selection.map(id=>id+'.json').sort());
  pass('Copied signed journal bytes and original unresolved obligation remain unchanged, with no handoff, simulation, signing or broadcast');
  persist('collected-inventory-private.json',{assets,assetsAfter,origin,classic,inventory,selected,compared});
  Object.assign(proof,{state:'passed',completedAt:new Date().toISOString(),rpcCalls,returnedAccounts:inventory.returnedAccounts,sourceEvents:inventory.sourceEvents,consumedReceipts:inventory.consumedReceipts,selectedJournals:2,selectedLocallyFinalizedJournals:1,selectedExpiredUnresolvedJournals:1,selectedCurrentAccountingMatched:true,selectedEventReceiptStatesMatched:true,copiedJournalBytesUnchanged:true,finalizedJournalLabelsIndependentlyVerified:false});save();return proof;
 }catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1000);save();throw error;}
}
