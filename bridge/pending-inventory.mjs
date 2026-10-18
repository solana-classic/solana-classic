// Offline selected-journal accounting only. No RPC, signing, handoff or retry.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {inspectPendingClaim} from './pending-claim.mjs';
import {PUBLIC_GENESIS} from './sdk.mjs';
const U64=(1n<<64n)-1n;
const domainFields=['bridge','originChain','nativeChain','originProgram','nativeProgram','originMint','epoch','originDecimals'];
const accountingFields=['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','reserveNativeUnits','protectedFloorNativeUnits'];
const states=['PREPARED','SUBMISSION_ATTEMPTED','PENDING','EXPIRED_UNRESOLVED','CONSUMED_REVIEW_REQUIRED','FAILED_REVIEW_REQUIRED','FINALIZED'];
const hash=value=>createHash('sha256').update('solana-classic/private-selected-inventory/v1\0').update(JSON.stringify(value)).digest('hex');
function key(value){if(typeof value!=='string'||value.length<32||value.length>44||new PublicKey(value).toBase58()!==value||value==='11111111111111111111111111111111')throw Error('Canonical nonzero inventory key required');return value;}
function digest(value){if(typeof value!=='string'||! /^[0-9a-f]{64}$/.test(value))throw Error('Exact selected journal hash required');return value;}
function units(value){if(typeof value!=='string'||value.length>20||! /^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>U64)throw Error('Canonical u64 inventory units required');return BigInt(value);}
function add(a,b){const sum=a+b;if(sum>U64)throw Error('Selected pending liability exceeds u64');return sum;}
function exact(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(field=>!fields.includes(field)))throw Error('Exact selected inventory schema required');}
function domain(value){
 exact(value,domainFields);const selected=Object.fromEntries(domainFields.map(field=>[field,value[field]]));
 for(const field of domainFields.slice(0,6))selected[field]=key(selected[field]);
 if(selected.originChain===selected.nativeChain||[selected.originChain,selected.nativeChain].some(chain=>PUBLIC_GENESIS.has(chain)||chain==='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'))throw Error('Distinct isolated inventory chains required');
 if(units(selected.epoch)===0n||!Number.isSafeInteger(selected.originDecimals)||selected.originDecimals<0||selected.originDecimals>9)throw Error('Selected inventory epoch or precision invalid');
 return Object.freeze(selected);
}

export async function reviewPendingInventory({directory,selection,expectedDomain,accounting}){
 if(typeof directory!=='string')throw Error('Explicit private journal directory required');
 const selectedDomain=domain(expectedDomain);
 exact(accounting,accountingFields);const amounts=Object.fromEntries(accountingFields.map(field=>[field,units(accounting[field])]));
 if(!Array.isArray(selection)||selection.length<1||selection.length>256)throw Error('One to 256 explicitly selected journals required');
 const selected=selection.map(row=>{exact(row,['id','journalHash']);return Object.freeze({id:key(row.id),journalHash:digest(row.journalHash)});}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 if(new Set(selected.map(row=>row.id)).size!==selected.length)throw Error('Duplicate selected receipt');
 const records=[],counts=Object.fromEntries(states.map(state=>[state,0]));let pendingNative=0n,pendingRedemption=0n,pendingNativePayout=0n;
 for(const chosen of selected){
  const record=await inspectPendingClaim(directory,chosen.id);
  if(record.journalHash!==chosen.journalHash)throw Error('Selected journal changed');
  if(![2,3].includes(record.schemaVersion)||record.bridge!==selectedDomain.bridge||record.originMint!==selectedDomain.originMint||record.epoch!==selectedDomain.epoch||record.originDecimals!==selectedDomain.originDecimals)throw Error('Selected journal domain or enforced pins differ');
  const native=record.scope==='isolated-native-claim';
  if(record.sourceChain!==(native?selectedDomain.originChain:selectedDomain.nativeChain)||record.destinationChain!==(native?selectedDomain.nativeChain:selectedDomain.originChain)||record.sourceProgram!==(native?selectedDomain.originProgram:selectedDomain.nativeProgram)||record.destinationProgram!==(native?selectedDomain.nativeProgram:selectedDomain.originProgram)||!states.includes(record.state))throw Error('Selected journal chain, programme or direction differs');
  const origin=units(record.originAmount),converted=units(record.nativeAmount);
  if(origin===0n||converted!==origin*10n**BigInt(9-selectedDomain.originDecimals))throw Error('Selected journal conversion differs');
  counts[record.state]++;
  const unresolved=record.state!=='FINALIZED';
  if(unresolved){
   if(native){pendingNative=add(pendingNative,origin);pendingNativePayout=add(pendingNativePayout,converted);}
   else pendingRedemption=add(pendingRedemption,origin);
  }
  records.push({id:record.id,journalHash:record.journalHash,eventHash:record.eventHash,state:record.state,scope:record.scope,originAmount:origin.toString(),nativeAmount:converted.toString(),includedAsPending:unresolved});
 }
 const total=add(pendingNative,pendingRedemption);
 if(amounts.originEscrowUnits!==amounts.originOutstandingUnits||amounts.originOutstandingUnits!==add(amounts.nativeOutstandingUnits,total))throw Error('Selected pending liability and declared counters do not reconcile');
 if(amounts.reserveNativeUnits<add(amounts.protectedFloorNativeUnits,pendingNativePayout))throw Error('Declared reserve cannot cover selected native claims above the floor');
 // Detect journal changes between inspections. Sequential locks are not an
 // atomic multi-record or chain snapshot; no completeness claim is made.
 for(const chosen of selected)if((await inspectPendingClaim(directory,chosen.id)).journalHash!==chosen.journalHash)throw Error('Selected journal changed during inventory review');
 const result={schemaVersion:1,scope:'offline-isolated-selected-journal-accounting',domain:selectedDomain,records,stateCounts:counts,selectedJournals:records.length,selectedJournalRecordsVerified:true,selectedAccountingEquationMatched:true,accounting:Object.fromEntries(Object.entries(amounts).map(([field,value])=>[field,value.toString()])),pending:{nativeClaimOriginUnits:pendingNative.toString(),originalRedemptionOriginUnits:pendingRedemption.toString(),totalOriginUnits:total.toString(),nativePayoutUnits:pendingNativePayout.toString()},selectionSHA256:hash({domain:selectedDomain,selection:selected}),completeSourceEventInventoryVerified:false,simultaneousSnapshotVerified:false,sameLedgerHistoryVerified:false,freshChainStateVerified:false,finalizedJournalLabelsIndependentlyVerified:false,codeAndCustodyVerified:false,backingVerified:false,canRetry:false,canRefund:false,canResetAttempt:false,canSign:false,canBroadcast:false,settlementAccepted:false,productionReady:false};
 return {...result,inventorySHA256:hash(result)};
}
