// Pure private-claim metadata binding. No RPC, journal writes, keys or handoff.
import {checkedReviewedOriginMintPolicy} from './reviewed-origin-mint.mjs';
const scope='isolated-reviewed-mint-admission-v1';
const keys=['genesis','program','mint','mintDataSHA256','reviewedMintPolicySHA256','originDecimals','mintSupplyUnits','originEscrowUnits','originOutstandingUnits','unallocatedEscrowSurplusUnits','firstContextSlot','contextSlot','finalCodeContextSlot','finalTokenContextSlot'];
const slot=n=>Number.isSafeInteger(n)&&n>=0;
function units(s){if(typeof s!=='string'||s.length>20||! /^(0|[1-9][0-9]*)$/.test(s)||BigInt(s)>(1n<<64n)-1n)throw Error('Exact reviewed asset units required');return BigInt(s);}
export function claimReviewedMintPolicy(value,programmePolicy,event,originDecimals){
 const p=checkedReviewedOriginMintPolicy(value),origin=event.direction===0?programmePolicy.source:programmePolicy.destination;
 if(JSON.stringify(p.pins)!==JSON.stringify(origin)||p.expectedDecimals!==originDecimals||BigInt(p.expectedSupplyUnits)<event.originAmount)throw Error('Reviewed mint policy differs from the signed claim domain or precision');
 return p;
}
function checkSnapshot(s,p,event,minimum){
 if(!s||Object.keys(s).length!==keys.length||Object.keys(s).some(k=>!keys.includes(k)))throw Error('Exact claim mint-admission snapshot required');
 if(s.genesis!==p.pins.genesis||s.program!==p.pins.program||s.mint!==p.pins.originMint||s.mintDataSHA256!==p.expectedMintDataSHA256||s.reviewedMintPolicySHA256!==p.sha256||s.originDecimals!==p.expectedDecimals||s.mintSupplyUnits!==p.expectedSupplyUnits)throw Error('Claim mint-admission identity or selected bytes differ');
 if(!slot(minimum)||!slot(s.firstContextSlot)||s.firstContextSlot<minimum||!slot(s.contextSlot)||s.contextSlot<s.firstContextSlot||!slot(s.finalCodeContextSlot)||s.finalCodeContextSlot<s.contextSlot||!slot(s.finalTokenContextSlot)||s.finalTokenContextSlot<s.finalCodeContextSlot)throw Error('Claim mint-admission checkpoint differs');
 const escrow=units(s.originEscrowUnits),outstanding=units(s.originOutstandingUnits),surplus=units(s.unallocatedEscrowSurplusUnits);
 if(outstanding<event.originAmount||escrow<outstanding||escrow>BigInt(p.expectedSupplyUnits)||surplus!==escrow-outstanding)throw Error('Claim origin escrow and obligations differ from reviewed supply');
}
export function claimMintSnapshot(observation,p,event,minimum){
 if(observation?.state!=='PINNED_ORIGIN_ASSET_SNAPSHOT'||observation.mintLayout!=='immutable-self-metadata-v1'||observation.tokenCodeVerified!==true||observation.programmePinsVerified!==true||observation.assetSnapshots!==2||observation.codeObservations!==4||observation.tokenCodeBoundaries!==2||observation.canSign!==false||observation.canBroadcast!==false||observation.productionReady!==false)throw Error('Complete read-only reviewed mint observation required');
 const s=Object.fromEntries(keys.map(k=>[k,observation[k]]));checkSnapshot(s,p,event,minimum);return Object.freeze(s);
}
export function checkClaimMintAdmission(a,p,event,record,programmeAdmission){
 if(!a||Object.keys(a).length!==6||Object.keys(a).some(k=>!['schemaVersion','scope','policySHA256','at','first','final'].includes(k))||a.schemaVersion!==1||a.scope!==scope||a.policySHA256!==p.sha256||typeof a.at!=='string'||!Number.isFinite(Date.parse(a.at)))throw Error('Reviewed mint handoff admission is missing or changed');
 const minimum=event.direction===0?record.sourceContextSlot:record.preparedDestinationSlot;
 checkSnapshot(a.first,p,event,minimum);checkSnapshot(a.final,p,event,a.first.finalTokenContextSlot);
 const lastOrigin=event.direction===0?programmeAdmission?.source:programmeAdmission?.destination;
 if(!lastOrigin||a.final.finalTokenContextSlot>lastOrigin.contextSlot)throw Error('Final programme observation does not bracket mint admission');
}
export function claimMintAdmission(policy,first,final){return {schemaVersion:1,scope,policySHA256:policy.sha256,at:new Date().toISOString(),first,final};}
