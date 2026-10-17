// Offline rehearsal-only accounting. No RPC, keys, ledger writes, signing,
// deployment or bootstrap-counter mutation. Declared backing is not proof.
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
const U64=(1n<<64n)-1n;
const forbidden=new Set(['7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
function units(value,name) {
  if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw new Error(name+' requires an exact nonnegative base-unit integer string');
  const n=BigInt(value);if(n>U64)throw new Error(name+' exceeds u64');return n;
}
function address(value) {if(typeof value!=='string'||new PublicKey(value).toBase58()!==value)throw new Error('Canonical public address required');return value;}
const owners={
  '11111111111111111111111111111111':'system-balances',
  'Stake11111111111111111111111111111111111111':'stake-accounts',
  'Vote111111111111111111111111111111111111111':'vote-accounts',
  'Feature111111111111111111111111111111111111':'feature-accounts',
  'Sysvar1111111111111111111111111111111111111':'sysvar-accounts',
  'Config1111111111111111111111111111111111111':'configuration-accounts',
  'NativeLoader1111111111111111111111111111111':'builtin-programmes',
};

export function auditBootstrap({schemaVersion,environment,genesisAudit,originMint,originDecimals,nativeDecimals,originSupplyUnits,prelockedOriginUnits,reserveAddress,reserveDataBytes=16,protectedReserveNativeUnits,declaredOriginCounterUnits,declaredNativeCounterUnits}) {
  if(schemaVersion!==1||environment!=='isolated-rehearsal')throw new Error('Only isolated rehearsal accounting is supported');
  const g=genesisAudit;
  if(g?.clusterType!=='development'||forbidden.has(g.genesis))throw new Error('A fresh private development genesis is required');
  address(g.genesis);address(originMint);address(reserveAddress);
  if(originMint==='11111111111111111111111111111111'||reserveAddress==='11111111111111111111111111111111')throw new Error('Mint/reserve cannot be the System programme');
  if(originMint===reserveAddress)throw new Error('Mint and reserve must differ');
  if(nativeDecimals!==9||!Number.isInteger(originDecimals)||originDecimals<0||originDecimals>9)throw new Error('Unsupported exact token precision');
  if(!Array.isArray(g.accounts)||!Number.isSafeInteger(g.accountCount)||g.accountCount<1||g.accounts.length!==g.accountCount)throw new Error('Complete actual genesis inventory required');
  if(!g.inflation||['initial','terminal','taper','foundation','foundationTerm','unused'].some(k=>g.inflation[k]!==0))throw new Error('Independent inflation is prohibited');
  if(g.feeRateGovernor?.burnPercent!==0||g.rent?.burn_percent!==0)throw new Error('Burn accounting requires a separate reviewed design');
  const rent=g.rent;
  if(!Number.isSafeInteger(rent.lamports_per_byte_year)||rent.lamports_per_byte_year<0||!Number.isSafeInteger(rent.exemption_threshold)||rent.exemption_threshold<1||!Number.isSafeInteger(reserveDataBytes)||reserveDataBytes<8||reserveDataBytes>65536)throw new Error('Exact supported reserve rent parameters required');
  const minimumRent=BigInt(reserveDataBytes+128)*BigInt(rent.lamports_per_byte_year)*BigInt(rent.exemption_threshold);
  if(minimumRent>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Rent calculation exceeds the reviewed exact floating-point range');
  const protection=units(protectedReserveNativeUnits,'protectedReserveNativeUnits');
  if(protection<minimumRent)throw new Error('Protected reserve cannot be less than required vault rent');
  const seen=new Set(),groups={};let total=0n,reserve=null;
  const inventory=g.accounts.map(a=>{
    address(a.address);address(a.owner);
    if(seen.has(a.address))throw new Error('Duplicate genesis account');seen.add(a.address);
    if(!Number.isSafeInteger(a.dataBytes)||a.dataBytes<0||typeof a.executable!=='boolean')throw new Error('Incomplete genesis account shape');
    const n=units(a.lamports,'account lamports');total+=n;
    const category=a.address===reserveAddress?'reserve':owners[a.owner]??'other-accounts';
    groups[category]??={accounts:0,nativeUnits:0n};groups[category].accounts++;groups[category].nativeUnits+=n;
    if(a.address===reserveAddress)reserve={...a,nativeUnits:n};
    return {address:a.address,owner:a.owner,dataBytes:a.dataBytes,executable:a.executable,lamports:a.lamports,category};
  }).sort((a,b)=>a.address<b.address?-1:a.address>b.address?1:0);
  if(!reserve||reserve.executable)throw new Error('One nonexecutable reserve account required');
  if(total!==units(g.totalLamports,'reported genesis total'))throw new Error('Actual account sum differs from reported genesis');
  const factor=10n**BigInt(9-originDecimals),supply=units(originSupplyUnits,'originSupplyUnits'),locked=units(prelockedOriginUnits,'prelockedOriginUnits');
  if(supply===0n||locked>supply||supply*factor>U64||total!==supply*factor)throw new Error('Genesis and original supply conversion do not reconcile');
  const allocated=total-reserve.nativeUnits;
  if(allocated<=0n||protection>reserve.nativeUnits)throw new Error('Invalid allocated/protected reserve budget');
  const requiredNative=allocated+protection;
  const minimumLocked=(requiredNative+factor-1n)/factor;
  if(locked<minimumLocked)throw new Error('Unbacked genesis allocation or protected reserve rent');
  const backingNative=locked*factor,backedInReserve=backingNative-allocated;
  const excess=backingNative-requiredNative;
  const futureClaims=(supply-locked)*factor;
  if(reserve.nativeUnits!==backedInReserve+futureClaims)throw new Error('Reserve tranches do not reconcile');
  const originalCounter=declaredOriginCounterUnits===undefined?null:units(declaredOriginCounterUnits,'declaredOriginCounterUnits');
  const nativeCounter=declaredNativeCounterUnits===undefined?null:units(declaredNativeCounterUnits,'declaredNativeCounterUnits');
  const countersMatch=originalCounter===locked&&nativeCounter===locked;
  return {
    schemaVersion:1,state:'DRAFT_BOOTSTRAP_ACCOUNTING',scope:'Offline actual genesis inventory with declared synthetic original backing; no on-chain bootstrap or custody proof',
    accountingPassed:true,productionReady:false,activationEnabled:false,canonicalNetworkChanged:false,
    genesis:g.genesis,originMint,originDecimals,nativeDecimals,reserveDataBytes,accountCount:inventory.length,
    inventorySHA256:createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
    categories:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{accounts:v.accounts,nativeUnits:v.nativeUnits.toString()}])),
    totals:{originalSupplyUnits:supply.toString(),nativeGenesisUnits:total.toString(),nativeOutsideReserveUnits:allocated.toString(),reserveNativeUnits:reserve.nativeUnits.toString(),conversionFactor:factor.toString()},
    backing:{declaredPrelockedOriginUnits:locked.toString(),minimumPrelockedOriginUnits:minimumLocked.toString(),minimumVaultRentNativeUnits:minimumRent.toString(),protectedReserveNativeUnits:protection.toString(),declaredBackingNativeUnits:backingNative.toString(),backedNativeInsideReserveUnits:backedInReserve.toString(),precisionOrExtraBackingNativeUnits:excess.toString(),availableForNewOriginDepositsNativeUnits:futureClaims.toString()},
    bootstrapCounters:{requiredOriginOutstandingUnits:locked.toString(),requiredNativeOutstandingOriginUnits:locked.toString(),declaredOriginOutstandingUnits:originalCounter?.toString()??null,declaredNativeOutstandingOriginUnits:nativeCounter?.toString()??null,declaredCountersMatch:countersMatch,appliedOnChain:false},
    gates:{genesisInventoryReconciled:true,declaredSyntheticBackingSufficient:true,declaredCountersMatch:countersMatch,finalizedOriginalEscrowVerified:false,genesisReserveCustodyVerified:false,bootstrapSourceEventsConsumed:false,onChainCountersApplied:false,fullValidatorConsensusVerified:false,independentReview:false},
    blockers:['Actual finalized original mint/escrow and backing evidence must be verified.','Reviewed bridge bootstrap must set both initial counters and consume backing events without another release.','Protected reserve rent and excess backing must remain segregated from new-deposit claim capacity.','Reserve custody, bootstrap authority and replay controls need on-chain implementation/review.','Full-validator consensus, independent operators, custody and security review remain required.'],
  };
}
