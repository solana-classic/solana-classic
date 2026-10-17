// Offline review-only key authentication. No signer, RPC, writes or approvals.
import {createHash,createPublicKey,verify} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {PUBLIC_GENESIS} from './sdk.mjs';
import {inspectPendingClaim} from './pending-claim.mjs';
import {reviewExpiredRedemption} from './expired-review.mjs';
const DOMAIN=Buffer.from('solana-classic/private-bridge/review-observation/v1\0');
const SCOPE='isolated-expired-redemption-observation-v1';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fields=['scope','purpose','operator','rosterHash','id','journalHash','eventHash','transactionHash','instructionHash','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','signature','originMint','destinationToken','originAmount','nonce','epoch','programmePinsHash','accountingHash','evidenceHash','observedAt','sourceFinalizedSlot','destinationFinalizedSlot','destinationFinalizedHeight','sourceReturnFinalized','receipt','signatureStatus','historyCoverage'];
const bound=['id','journalHash','eventHash','transactionHash','instructionHash','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','signature','originMint','destinationToken','originAmount','nonce','epoch','programmePinsHash','accountingHash'];
const accountingFields=['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','pendingRedemptionUnits','reserveNativeUnits','protectedFloorNativeUnits'];
function key(v){if(typeof v!=='string'||new PublicKey(v).toBase58()!==v)throw new Error('Canonical observer public key required');return v;}
function digest(v){if(typeof v!=='string'||! /^[0-9a-f]{64}$/.test(v))throw new Error('Canonical observation hash required');return v;}
function integer(v){if(!Number.isSafeInteger(v)||v<0)throw new Error('Safe finalized checkpoint required');return v;}
function units(v){if(typeof v!=='string'||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>(1n<<64n)-1n)throw new Error('Canonical u64 observation units required');return v;}
function timestamp(v){const t=Date.parse(v);if(typeof v!=='string'||!Number.isFinite(t)||new Date(t).toISOString()!==v)throw new Error('Canonical observation timestamp required');return t;}
function isolated(a,b){key(a);key(b);if(a===b||[a,b].some(g=>PUBLIC_GENESIS.has(g)||g==='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'))throw new Error('Only distinct isolated review chains are supported');}
function roster(value){
  if(!value||value.scope!=='isolated-review-only'||value.threshold!==3||!Array.isArray(value.observers)||value.observers.length!==5)throw new Error('A fixed three-of-five review roster is required');
  const observers=value.observers.map(key);if(new Set(observers).size!==5||observers.includes('11111111111111111111111111111111'))throw new Error('Distinct observer keys required');
  isolated(value.sourceChain,value.destinationChain);units(value.epoch);if(value.epoch==='0')throw new Error('Review epoch must be positive');
  const selected={scope:value.scope,threshold:3,sourceChain:value.sourceChain,destinationChain:value.destinationChain,epoch:value.epoch,observers:[...observers]};
  return {selected,hash:hash(JSON.stringify(selected))};
}
function selectedReport(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k)))throw new Error('Exact observer report schema required');
  const report=Object.fromEntries(fields.map(k=>[k,value[k]]));
  if(report.scope!==SCOPE||report.purpose!=='review-only')throw new Error('Observation signing domain/purpose mismatch');
  for(const f of ['operator','id','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','originMint','destinationToken'])key(report[f]);
  isolated(report.sourceChain,report.destinationChain);
  for(const f of ['rosterHash','journalHash','eventHash','transactionHash','instructionHash','programmePinsHash','accountingHash','evidenceHash'])digest(report[f]);
  for(const f of ['originAmount','nonce','epoch'])units(report[f]);
  if(report.originAmount==='0'||report.epoch==='0'||typeof report.signature!=='string'||! /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(report.signature))throw new Error('Original signature/amount/epoch missing');
  timestamp(report.observedAt);for(const f of ['sourceFinalizedSlot','destinationFinalizedSlot','destinationFinalizedHeight'])integer(report[f]);
  if(typeof report.sourceReturnFinalized!=='boolean'||!['absent','present','conflicting'].includes(report.receipt)||!['absent','processed','confirmed','finalized','failed','unknown'].includes(report.signatureStatus)||!['asserted-complete-for-attempt','pruned','unknown'].includes(report.historyCoverage))throw new Error('Invalid observation state');
  return report;
}
// Unsigned, canonical domain-separated message only. Private keys are never accepted.
export function observerReportMessage(report){const selected=selectedReport(report),message=Buffer.concat([DOMAIN,Buffer.from(JSON.stringify(selected))]);if(message.length>8192)throw new Error('Observer message exceeds bound');return message;}
export function observerRosterHash(value){return roster(value).hash;}
export function observerAccountingHash(value){return hash(JSON.stringify(Object.fromEntries(accountingFields.map(k=>[k,units(value?.[k])]))));}

export function verifyObserverReports({envelopes,reviewRoster,expected,reviewedAt=new Date().toISOString()}){
  const {selected,hash:rosterHash}=roster(reviewRoster),now=timestamp(reviewedAt);
  // Snapshot caller-selected bindings before processing untrusted reports.
  const binding=Object.freeze(Object.fromEntries(bound.map(k=>[k,expected?.[k]])));
  if(binding.sourceChain!==selected.sourceChain||binding.destinationChain!==selected.destinationChain||binding.epoch!==selected.epoch)throw new Error('Review roster differs from original operation');
  if(!Array.isArray(envelopes)||envelopes.length<3||envelopes.length>5)throw new Error('Three to five authenticated reports required');
  const signers=new Set(),evidence=new Set();
  const reports=envelopes.map(envelope=>{
    if(!envelope||Object.keys(envelope).length!==2||!Object.hasOwn(envelope,'report')||!Object.hasOwn(envelope,'signatureBase64'))throw new Error('Exact observer envelope required');
    const report=selectedReport(envelope.report),message=observerReportMessage(report);
    if(report.rosterHash!==rosterHash||!selected.observers.includes(report.operator)||signers.has(report.operator)||evidence.has(report.evidenceHash))throw new Error('Untrusted, duplicate or wrong-roster observer');
    const at=timestamp(report.observedAt);if(at>now||now-at>300000)throw new Error('Observation is stale or future-dated');
    for(const f of bound)if(report[f]!==binding[f])throw new Error('Authenticated report differs from original operation or review binding: '+f);
    if(typeof envelope.signatureBase64!=='string'||envelope.signatureBase64.length!==88)throw new Error('Canonical Ed25519 signature required');
    const signature=Buffer.from(envelope.signatureBase64,'base64');if(signature.length!==64||signature.toString('base64')!==envelope.signatureBase64)throw new Error('Noncanonical observation signature');
    const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),new PublicKey(report.operator).toBuffer()]),format:'der',type:'spki'});
    if(!verify(null,message,publicKey,signature))throw new Error('Observer signature is invalid');
    signers.add(report.operator);evidence.add(report.evidenceHash);return report;
  });
  return {schemaVersion:1,scope:'authenticated-isolated-review-only',rosterHash,signers:[...signers].sort(),reports,keyAuthenticationVerified:true,operatorIdentityVerified:false,operatorIndependenceVerified:false,rosterApprovedForProduction:false,canRetry:false,canSign:false,canBroadcast:false,productionReady:false};
}

export async function reviewAuthenticatedExpiry({directory,id,envelopes,reviewRoster,programmePinsHash,accounting,reviewedAt=new Date().toISOString()}){
  reviewRoster=roster(reviewRoster).selected;
  if(!Array.isArray(envelopes))throw new Error('Observer envelope array required');
  envelopes=envelopes.map(e=>{if(!e||Object.keys(e).length!==2||!Object.hasOwn(e,'report')||!Object.hasOwn(e,'signatureBase64'))throw new Error('Exact observer envelope required');return {report:selectedReport(e.report),signatureBase64:e.signatureBase64};});
  accounting=Object.fromEntries(accountingFields.map(k=>[k,units(accounting?.[k])]));
  programmePinsHash=digest(programmePinsHash);
  const operation=await inspectPendingClaim(directory,id);
  const programmePinsBoundToJournal=operation.programmePinsHash!==undefined;
  if(programmePinsBoundToJournal&&programmePinsHash!==operation.programmePinsHash)throw new Error('Selected programme pins differ from retained journal');
  const normalized=Object.fromEntries(accountingFields.map(k=>[k,units(accounting?.[k])]));
  const authenticated=verifyObserverReports({envelopes,reviewRoster,expected:{...operation,programmePinsHash:digest(programmePinsHash),accountingHash:observerAccountingHash(normalized)},reviewedAt});
  // Reinspect through the original structural review. A concurrent settlement
  // or journal update cannot inherit an earlier authenticated snapshot.
  const {packetHash:unsignedPacketHash,...packet}=await reviewExpiredRedemption({directory,id,reports:authenticated.reports,accounting:normalized,reviewedAt});
  const result={...packet,unsignedPacketHash,keyAuthenticationVerified:true,operatorIdentityVerified:false,rosterApprovedForProduction:false,authenticatedSigners:authenticated.signers,reviewRosterHash:authenticated.rosterHash,programmePinsHash,programmePinsBoundToJournal,observerAuthenticationVerified:true};
  return {...result,packetHash:hash(JSON.stringify(result))};
}
