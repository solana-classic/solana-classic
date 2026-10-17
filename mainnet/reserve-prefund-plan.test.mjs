import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {genesisInventoryMetadataDigest} from './genesis-custody.mjs';
import {planPrefundedReserve,reviewPrefundedReserveInventory} from './reserve-prefund-plan.mjs';
const SYSTEM='11111111111111111111111111111111';
const key=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58();
const row=(address,lamports,owner=SYSTEM,dataBytes=0)=>({address,owner,lamports,dataBytes,executable:false});
function fixture(){
 const genesisAudit={genesis:key(90),clusterType:'development',accountCount:2,totalLamports:'1000000000000',accounts:[row(key(1),'900000000000'),row(key(2),'100000000000')],inflation:{initial:0,terminal:0,taper:0,foundation:0,foundationTerm:0,unused:0},rent:{lamports_per_byte_year:3480,exemption_threshold:2,burn_percent:0},feeRateGovernor:{targetLamportsPerSignature:10000,targetSignaturesPerSlot:20000,minLamportsPerSignature:5000,maxLamportsPerSignature:100000,burnPercent:0}};
 return {schemaVersion:1,environment:'isolated-rehearsal',genesisAudit,expectedGenesis:genesisAudit.genesis,expectedInventorySHA256:genesisInventoryMetadataDigest(genesisAudit),reserveAddress:key(1),bridgeProgram:key(50),bridgeId:key(60),originMint:key(70),originDecimals:6,nativeDecimals:9,originSupplyUnits:'1000000000',prelockedOriginUnits:'100001003',protectedReserveNativeUnits:'1002240'};
}
function comparison(f=fixture()){
 const p=planPrefundedReserve(f),g=structuredClone(f.genesisAudit);g.genesis=key(91);g.accounts=p.proposedAccounts;
 return {planningInput:f,expectedPlanSHA256:p.planSHA256,genesisAudit:g,expectedGenesis:g.genesis,expectedInventorySHA256:genesisInventoryMetadataDigest(g)};
}
const refresh=c=>{c.expectedInventorySHA256=genesisInventoryMetadataDigest(c.genesisAudit);return c;};
const falseFlags=['actualGenesisCompiled','actualAccountBytesVerified','reserveInitialized','bootstrapSourceEventsConsumed','onChainCountersApplied','finalizedOriginalBackingVerified','reserveCustodyVerified','programmeUpgradeControlsVerified','fullValidatorConsensusVerified','independentVerification','canPrepare','canSign','canBroadcast','activationEnabled','productionReady'];
test('only the reserve address changes, with exact supply and other allocations preserved',()=>{
 const f=fixture(),p=planPrefundedReserve(f);
 assert.equal(p.proposedGenesis,null);assert.equal(p.requiresFreshGenesis,true);assert.equal(p.allocationChangeCount,1);assert.equal(p.unchangedAccountCount,1);
 assert.equal(p.proposedReserve.lamports,'900000000000');assert.equal(p.proposedReserve.owner,SYSTEM);assert.equal(p.proposedReserve.dataBytes,0);assert.equal(PublicKey.isOnCurve(new PublicKey(p.reserveAddress).toBytes()),false);
 assert.deepEqual(p.proposedAccounts.filter(a=>a.address!==p.reserveAddress),f.genesisAudit.accounts.filter(a=>a.address!==f.reserveAddress));
 assert.equal(p.proposedAccounts.some(a=>a.address===f.reserveAddress),false);
 assert.equal(p.declaredBudget.minimumVaultRentNativeUnits,'1002240');assert.equal(p.declaredBudget.minimumPrelockedOriginUnits,'100001003');
 for(const k of falseFlags)assert.equal(p[k],false,k);
});
test('synthetic fresh complete output can match the selected proposal without promoting acceptance',()=>{
 const c=comparison(),r=reviewPrefundedReserveInventory(c);
 assert.equal(r.proposedReserveMetadataMatched,true);assert.equal(r.declaredBudgetReconciled,true);assert.equal(r.requiresFreshActivationInventory,true);assert.equal(r.selectedGenesis,c.expectedGenesis);
 for(const k of falseFlags)assert.equal(r[k],false,k);
});
test('old genesis, canonical and public networks cannot be relabeled as the new allocation',()=>{
 for(const genesis of [fixture().genesisAudit.genesis,SYSTEM,'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']){
  const c=comparison();c.expectedGenesis=c.genesisAudit.genesis=genesis;
  assert.throws(()=>reviewPrefundedReserveInventory(c));
 }
 const c=comparison();c.genesisAudit.clusterType='mainnet-beta';assert.throws(()=>reviewPrefundedReserveInventory(c));
});
test('external baseline, proposal and fresh inventory selections all reject tampering',()=>{
 for(const change of [c=>c.planningInput.expectedGenesis=key(89),c=>c.planningInput.expectedInventorySHA256='0'.repeat(64),c=>c.expectedPlanSHA256='0'.repeat(64),c=>c.expectedPlanSHA256=null,c=>c.expectedGenesis=key(92),c=>c.expectedInventorySHA256='0'.repeat(64),c=>c.planningInput.bridgeId=key(61),c=>c.planningInput.prelockedOriginUnits='100001004']){
  const c=comparison();change(c);assert.throws(()=>reviewPrefundedReserveInventory(c));
 }
});
test('a copied old reserve, omitted account, duplicated account or redistributed balances refuses',()=>{
 for(const change of [c=>{c.genesisAudit.accounts.push(c.planningInput.genesisAudit.accounts[0]);c.genesisAudit.accountCount++;c.genesisAudit.totalLamports='1900000000000';},c=>{c.genesisAudit.accounts.pop();c.genesisAudit.accountCount--;c.genesisAudit.totalLamports=c.genesisAudit.accounts[0].lamports;},c=>{c.genesisAudit.accounts.push(c.genesisAudit.accounts[0]);c.genesisAudit.accountCount++;},c=>{const r=c.genesisAudit.accounts.find(a=>a.address===planPrefundedReserve(c.planningInput).reserveAddress),other=c.genesisAudit.accounts.find(a=>a!==r);r.lamports='899999999999';other.lamports='100000000001';}]){
  const c=comparison();change(c);assert.throws(()=>reviewPrefundedReserveInventory(refresh(c)));
 }
});
test('owner, allocated vault data, executable flag and unrelated account changes refuse even with fresh metadata anchors',()=>{
 for(const change of [a=>a.owner=key(50),a=>a.dataBytes=16,a=>a.executable=true,a=>a.address=key(80)]){
  const c=comparison(),reserve=planPrefundedReserve(c.planningInput).reserveAddress;change(c.genesisAudit.accounts.find(a=>a.address===reserve));assert.throws(()=>reviewPrefundedReserveInventory(refresh(c)));
 }
 const c=comparison();c.genesisAudit.accounts.find(a=>a.address!==planPrefundedReserve(c.planningInput).reserveAddress).owner=key(81);assert.throws(()=>reviewPrefundedReserveInventory(refresh(c)),/Complete supplied/);
});
test('replacement requires an unused vault and config plus an empty funded System source',()=>{
 for(const change of [f=>f.genesisAudit.accounts[0].owner=f.bridgeProgram,f=>f.genesisAudit.accounts[0].dataBytes=16,f=>f.genesisAudit.accounts[0].executable=true,f=>{const p=planPrefundedReserve(f);f.genesisAudit.accounts[1].address=p.reserveAddress;},f=>{const p=planPrefundedReserve(f);f.genesisAudit.accounts[1].address=p.configurationAddress;}]){
  const f=fixture();change(f);f.expectedInventorySHA256=genesisInventoryMetadataDigest(f.genesisAudit);assert.throws(()=>planPrefundedReserve(f));
 }
 const f=fixture();f.originMint=planPrefundedReserve(f).reserveAddress;assert.throws(()=>planPrefundedReserve(f));
});
test('changed rent, fees, burn or inflation cannot inherit the selected budget',()=>{
 for(const change of [g=>g.rent.lamports_per_byte_year++,g=>g.feeRateGovernor.targetLamportsPerSignature++,g=>g.rent.burn_percent=1,g=>g.feeRateGovernor.burnPercent=1,g=>g.inflation.initial=1]){
  const c=comparison();change(c.genesisAudit);assert.throws(()=>reviewPrefundedReserveInventory(c));
 }
 for(const change of [f=>f.genesisAudit.rent.extra=0,f=>f.genesisAudit.rent.exemption_threshold=1.5,f=>f.genesisAudit.feeRateGovernor.targetLamportsPerSignature=-1,f=>f.genesisAudit.feeRateGovernor.minLamportsPerSignature=10001]){const f=fixture();change(f);assert.throws(()=>planPrefundedReserve(f));}
});
test('insufficient backing, obsolete vault rent, supply mismatch and ambiguous units refuse',()=>{
 for(const change of [f=>f.prelockedOriginUnits='100001002',f=>f.protectedReserveNativeUnits='946560',f=>f.originSupplyUnits='1000000001',f=>f.originSupplyUnits=1000000000,f=>f.originDecimals=10,f=>f.nativeDecimals=8,f=>f.schemaVersion=2,f=>f.environment='production']){const f=fixture();change(f);assert.throws(()=>planPrefundedReserve(f));}
});
test('u64-scale unit strings remain exact while overflow refuses',()=>{
 const f=fixture();f.nativeDecimals=f.originDecimals=9;f.originSupplyUnits=f.genesisAudit.totalLamports='18446744073709551615';f.genesisAudit.accounts[0].lamports='18446743973709551615';f.prelockedOriginUnits='100001002240';f.expectedInventorySHA256=genesisInventoryMetadataDigest(f.genesisAudit);
 const p=planPrefundedReserve(f);assert.equal(p.proposedReserve.lamports,'18446743973709551615');assert.equal(p.totalNativeUnits,'18446744073709551615');assert.equal(reviewPrefundedReserveInventory(comparison(f)).totalNativeUnits,p.totalNativeUnits);
 f.genesisAudit.accounts[0].lamports='18446744073709551616';assert.throws(()=>planPrefundedReserve(f));
});
test('proposal and output reviews are order-independent and preserve all caller inputs',()=>{
 const f=fixture(),before=structuredClone(f),p=planPrefundedReserve(f);assert.deepEqual(f,before);
 f.genesisAudit.accounts.reverse();f.genesisAudit.rent=Object.fromEntries(Object.entries(f.genesisAudit.rent).reverse());assert.deepEqual(planPrefundedReserve(f),p);
 const c=comparison(f),saved=structuredClone(c);reviewPrefundedReserveInventory(c);assert.deepEqual(c,saved);
 c.genesisAudit.accounts.reverse();assert.equal(reviewPrefundedReserveInventory(c).proposedReserveMetadataMatched,true);
});
test('retained real 249-account metadata supports a proposal only, never a new compiled genesis claim',()=>{
 const f=fixture(),previous=JSON.parse(readFileSync(new URL('../evidence/mainnet-validator-rehearsal.json',import.meta.url)));f.genesisAudit=previous.genesisAudit;f.expectedGenesis=f.genesisAudit.genesis;f.expectedInventorySHA256=genesisInventoryMetadataDigest(f.genesisAudit);f.reserveAddress=f.genesisAudit.accounts.find(a=>a.lamports===previous.budget.reserveNativeUnits).address;f.prelockedOriginUnits='330310625';
 const p=planPrefundedReserve(f);assert.equal(p.accountCount,249);assert.equal(p.unchangedAccountCount,248);assert.equal(p.proposedReserve.lamports,'669690377440');assert.equal(p.totalNativeUnits,'1000000000000');assert.equal(p.declaredBudget.minimumPrelockedOriginUnits,'330310625');assert.equal(p.proposedGenesis,null);
 for(const k of falseFlags)assert.equal(p[k],false,k);
 const c=comparison(f);assert.equal(reviewPrefundedReserveInventory(c).actualGenesisCompiled,false);
});
