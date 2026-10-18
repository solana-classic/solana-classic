// Pure current-account versus selected-journal comparison; no recovery approval.
import assert from 'node:assert/strict';
export const COLLECTION_PERMISSIONS=['rpcResponseCompletenessVerified','completeSourceEventInventoryVerified','sameLedgerHistoryVerified','simultaneousSnapshotVerified','finalizedCommitmentIndependentlyVerified','freshChainStateVerified','deployedCodeAndCustodyVerified','sourceEconomicMovementsIndependentlyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'];
export function compareCollectedWithSelected(inventory,selected,inspections){
 assert.equal(inventory.bridge,selected.domain.bridge);assert.equal(inventory.epoch,selected.domain.epoch);assert.equal(inventory.originDecimals,selected.domain.originDecimals);
 assert.equal(inventory.returnedEventAndReceiptAccountingMatched,true);assert.equal(selected.selectedAccountingEquationMatched,true);
 for(const k of ['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','reserveNativeUnits','protectedFloorNativeUnits'])assert.equal(inventory.accounting[k],selected.accounting[k]);
 assert.deepEqual(inventory.pending,selected.pending);
 assert.equal(inspections.length,selected.selectedJournals);assert.equal(new Set(inspections.map(r=>r.id)).size,inspections.length);
 for(const r of inspections){
  assert(['isolated-native-claim','isolated-origin-redemption'].includes(r.scope));
  const record=selected.records.find(v=>v.id===r.id);assert(record);assert.equal(record.journalHash,r.journalHash);assert.equal(record.state,r.state);assert.equal(record.scope,r.scope);assert.equal(record.originAmount,r.originAmount);assert.equal(record.nativeAmount,r.nativeAmount);
  const matches=inventory.records.filter(v=>v.sourceEvent===r.sourceEvent);assert.equal(matches.length,1);const event=matches[0];
  assert.equal(event.sourceSide,r.scope==='isolated-native-claim'?0:1);assert.equal(event.originAmount,r.originAmount);assert.equal(event.nativeAmount,r.nativeAmount);
  assert.equal(event.pending,r.state!=='FINALIZED');assert.equal(event.consumedReceipt,r.state==='FINALIZED'?r.id:null);
 }
 for(const k of COLLECTION_PERMISSIONS)assert.equal(inventory[k],false);
 return {selectedCurrentAccountingMatched:true,selectedEventReceiptStatesMatched:true,selectedJournals:inspections.length,...Object.fromEntries(COLLECTION_PERMISSIONS.map(k=>[k,false]))};
}
