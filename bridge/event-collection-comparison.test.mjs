import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCollectedWithSelected,COLLECTION_PERMISSIONS} from './event-collection-comparison.mjs';
import {collectionFixture} from './test-fixtures/event-collection.mjs';
import {parseReturnedProgramAccounts} from './program-account-collector.mjs';
import {reconcileEventInventory} from './event-inventory.mjs';
import {wire} from './test-fixtures/event-collection.mjs';
function fixture(){
 const f=collectionFixture();const snapshots=[0,1].map(side=>parseReturnedProgramAccounts(wire(f.reply(side,{method:'getProgramAccounts',params:[f.sides[side].pins.program,{minContextSlot:90}]})),{pins:f.sides[side].pins,minimumContextSlot:90}));
 const inventory=reconcileEventInventory({pins:{origin:f.sides[0].pins,native:f.sides[1].pins},originSnapshot:snapshots[0],nativeSnapshot:snapshots[1],originEscrowUnits:'1500',minimumContextSlots:[90,90]});
 const inspections=inventory.records.map((e,i)=>({id:e.consumedReceipt??f.sides[i%2].vaultAddress,journalHash:String(i).repeat(64),scope:e.sourceSide===0?'isolated-native-claim':'isolated-origin-redemption',state:e.pending?'EXPIRED_UNRESOLVED':'FINALIZED',sourceEvent:e.sourceEvent,originAmount:e.originAmount,nativeAmount:e.nativeAmount}));
 // Use distinct synthetic non-consumed journal identifiers.
 if(new Set(inspections.map(r=>r.id)).size!==inspections.length)inspections[2].id=f.sides[1].configAddress;
 const selected={domain:{bridge:inventory.bridge,epoch:inventory.epoch,originDecimals:inventory.originDecimals},selectedAccountingEquationMatched:true,accounting:{...inventory.accounting},pending:{...inventory.pending},selectedJournals:inspections.length,records:inspections.map(r=>({...r}))};
 return {inventory,selected,inspections};
}
test('matching fresh returned accounting keeps both pending directions and consumed historical receipt without recovery approval',()=>{
 const {inventory,selected,inspections}=fixture(),before=JSON.stringify({inventory,selected,inspections});const r=compareCollectedWithSelected(inventory,selected,inspections);
 assert(r.selectedCurrentAccountingMatched&&r.selectedEventReceiptStatesMatched);assert.equal(r.selectedJournals,3);for(const k of COLLECTION_PERMISSIONS)assert.equal(r[k],false);assert.equal(JSON.stringify({inventory,selected,inspections}),before);
});
test('changed current escrow, counter, reserve or floor cannot inherit declared selected accounting',()=>{
 for(const field of ['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','reserveNativeUnits','protectedFloorNativeUnits']){const f=fixture();f.selected.accounting[field]='0';assert.throws(()=>compareCollectedWithSelected(f.inventory,f.selected,f.inspections));}
});
test('erased or reclassified pending obligations refuse',()=>{
 for(const field of ['nativeClaimOriginUnits','originalRedemptionOriginUnits','totalOriginUnits','nativePayoutUnits']){const f=fixture();f.selected.pending[field]='0';assert.throws(()=>compareCollectedWithSelected(f.inventory,f.selected,f.inspections));}
});
test('missing, duplicated or changed returned events and consumed receipts refuse',()=>{
 for(const mode of ['missing','duplicate','consumed','pending','side','amount','native']){const f=fixture(),e=f.inventory.records[0];
  if(mode==='missing')f.inventory.records.shift();if(mode==='duplicate')f.inventory.records.push({...e});if(mode==='consumed')e.consumedReceipt=f.inspections[1].id;if(mode==='pending')e.pending=!e.pending;if(mode==='side')e.sourceSide=1-e.sourceSide;if(mode==='amount')e.originAmount='1';if(mode==='native')e.nativeAmount='1';
  assert.throws(()=>compareCollectedWithSelected(f.inventory,f.selected,f.inspections));
 }
});
test('changed selected journal identity, hash, state, direction or amount refuses',()=>{
 for(const mode of ['count','duplicate','id','hash','state','scope','amount','native']){const f=fixture(),r=f.inspections[0];
  if(mode==='count')f.selected.selectedJournals++;if(mode==='duplicate')f.inspections[1].id=r.id;if(mode==='id')r.id=f.inventory.bridge;if(mode==='hash')r.journalHash='f'.repeat(64);if(mode==='state')r.state=r.state==='FINALIZED'?'EXPIRED_UNRESOLVED':'FINALIZED';if(mode==='scope')r.scope='unknown';if(mode==='amount')r.originAmount='1';if(mode==='native')r.nativeAmount='1';
  assert.throws(()=>compareCollectedWithSelected(f.inventory,f.selected,f.inspections));
 }
});
test('another bridge, epoch or precision and unverified accounting refuses',()=>{
 for(const mode of ['bridge','epoch','originDecimals','selected','returned']){const f=fixture();if(mode==='bridge')f.selected.domain.bridge=f.inspections[0].id;if(mode==='epoch')f.selected.domain.epoch='2';if(mode==='originDecimals')f.selected.domain.originDecimals=5;if(mode==='selected')f.selected.selectedAccountingEquationMatched=false;if(mode==='returned')f.inventory.returnedEventAndReceiptAccountingMatched=false;assert.throws(()=>compareCollectedWithSelected(f.inventory,f.selected,f.inspections));}
});
test('matching arithmetic cannot promote source completeness, backing or any recovery permission',()=>{
 for(const k of COLLECTION_PERMISSIONS){const f=fixture();f.inventory[k]=true;assert.throws(()=>compareCollectedWithSelected(f.inventory,f.selected,f.inspections));}
});
