// Offline declared control analysis. No operator appointment or signing permission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
const shape=(v,keys)=>{assert(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),keys.slice().sort());};
const id=value=>{assert(typeof value==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(value),'Opaque declared domain identifier required');return value;};
const list=values=>{assert(Array.isArray(values)&&values.length>=1&&values.length<=8);const result=values.map(id).sort();assert.equal(new Set(result).size,result.length);return result;};
const key=value=>{assert(typeof value==='string');const p=new PublicKey(value);assert.equal(p.toBase58(),value);assert(value!=='11111111111111111111111111111111'&&PublicKey.isOnCurve(p.toBytes()),'Ordinary canonical signing public key required');return value;};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const count=n=>{let k=0;while(n){k+=n&1;n>>>=1;}return k;};
const better=(a,b)=>!b||a.length<b.length||a.length===b.length&&a.join('\0')<b.join('\0');
function coalition(members,field,needed){
 const masks=new Map();members.forEach((member,i)=>{for(const group of member[field])masks.set(group,(masks.get(group)??0)|(1<<i));});
 const states=new Map([[0,[]]]);
 for(const [group,coverage] of [...masks].sort(([a],[b])=>compare(a,b))){for(const [mask,selected] of [...states]){const combined=mask|coverage,next=[...selected,group];if(better(next,states.get(combined)))states.set(combined,next);}}
 let chosen;let covered=0;for(const [mask,selected] of states)if(count(mask)>=needed&&better(selected,chosen)){chosen=selected;covered=count(mask);}assert(chosen);
 return {domains:chosen,domainCount:chosen.length,coveredSigners:covered,requiredSigners:needed};
}
export function reviewCommitteeControl(options){
 shape(options,['expectedCommittee','declaration','requirements']);const {declaration,requirements}=options;shape(declaration,['schemaVersion','scope','threshold','members']);assert.equal(declaration.schemaVersion,1);assert.equal(declaration.scope,'declared-private-committee-controls-v1');assert.equal(declaration.threshold,3);
 assert(Array.isArray(options.expectedCommittee)&&options.expectedCommittee.length===5);const expected=options.expectedCommittee.map(key).sort();assert.equal(new Set(expected).size,5);assert(Array.isArray(declaration.members)&&declaration.members.length===5);
 const members=declaration.members.map(m=>{shape(m,['publicKey','operator','controllers','availabilityDomains']);return {publicKey:key(m.publicKey),operator:id(m.operator),controllers:list(m.controllers),availabilityDomains:list(m.availabilityDomains)};}).sort((a,b)=>compare(a.publicKey,b.publicKey));assert.deepEqual(members.map(m=>m.publicKey).sort(),expected,'Declaration must match the externally selected five keys exactly');
 const fields=['minimumOperatorsForQuorum','minimumControllersForQuorum','minimumDomainsForOutage'];shape(requirements,fields);const selectedRequirements={};for(const field of fields){assert(Number.isInteger(requirements[field])&&requirements[field]>=1&&requirements[field]<=3);selectedRequirements[field]=requirements[field];}
 const operators=coalition(members.map(m=>({...m,operators:[m.operator]})),'operators',3),controllers=coalition(members,'controllers',3),outage=coalition(members,'availabilityDomains',5-declaration.threshold+1);
 const findings=[];if(operators.domainCount<selectedRequirements.minimumOperatorsForQuorum)findings.push('DECLARED_OPERATOR_CONCENTRATION');if(controllers.domainCount<selectedRequirements.minimumControllersForQuorum)findings.push('DECLARED_SIGNING_OR_RECOVERY_CONCENTRATION');if(outage.domainCount<selectedRequirements.minimumDomainsForOutage)findings.push('DECLARED_AVAILABILITY_CONCENTRATION');
 const normalized={schemaVersion:1,scope:declaration.scope,threshold:3,members,requirements:selectedRequirements};const declarationSHA256=createHash('sha256').update('solana-classic/declared-committee-controls/v1\0').update(JSON.stringify(normalized)).digest('hex');
 return {schemaVersion:1,scope:'Offline analysis of supplied controller/operator/outage declarations; no verified identities, custody enforcement or signing approval',threshold:3,members:5,declarationSHA256,declaredRequirementsMet:findings.length===0,findings,smallestDeclaredOperatorQuorum:operators,smallestDeclaredControllerQuorum:controllers,smallestDeclaredOutage:outage,operatorIdentitiesVerified:false,declaredControlCoverageVerified:false,custodyEnforcementVerified:false,recoveryControlsVerified:false,availabilityIndependenceVerified:false,independentSourceObservationsVerified:false,upgradeControlsVerified:false,securityReviewAccepted:false,releaseApproved:false,rpcObservationExecuted:false,keysCreated:false,canPrepareProductionClaim:false,canSign:false,canBroadcast:false,canRetry:false,canRefund:false,canResetAttempt:false,settlementAccepted:false,productionReady:false};
}
