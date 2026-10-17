// Offline proposal and supplied-output comparison. No keys, processes, RPC or writes.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {genesisInventoryMetadataDigest,reviewGenesisCustody} from './genesis-custody.mjs';
import {auditBootstrap} from './bootstrap-core.mjs';
const SYSTEM='11111111111111111111111111111111';
const compare=(a,b)=>a<b?-1:a>b?1:0;
const hash=(domain,value)=>createHash('sha256').update(domain+'\0').update(JSON.stringify(value)).digest('hex');
function policy(g){
 const select=(object,fields)=>{
  if(!object||Object.keys(object).length!==fields.length||!fields.every(k=>Object.hasOwn(object,k)))throw Error('Exact allocation policy fields required');
  return Object.fromEntries(fields.map(k=>{const v=object[k];if(!Number.isSafeInteger(v)||v<0)throw Error('Exact nonnegative allocation policy required');return [k,v];}));
 };
 const inflation=select(g.inflation,['initial','terminal','taper','foundation','foundationTerm','unused']);
 const rent=select(g.rent,['lamports_per_byte_year','exemption_threshold','burn_percent']);
 const fees=select(g.feeRateGovernor,['targetLamportsPerSignature','targetSignaturesPerSlot','minLamportsPerSignature','maxLamportsPerSignature','burnPercent']);
 if(Object.values(inflation).some(v=>v!==0)||rent.burn_percent!==0||fees.burnPercent!==0||rent.exemption_threshold<1||fees.minLamportsPerSignature>fees.targetLamportsPerSignature||fees.targetLamportsPerSignature>fees.maxLamportsPerSignature)throw Error('Only zero-inflation, zero-burn rehearsal allocation policy is supported');
 return {inflation,rent,feeRateGovernor:fees};
}
const rows=accounts=>accounts.map(({address,owner,lamports,dataBytes,executable})=>({address,owner,lamports,dataBytes,executable})).sort((a,b)=>compare(a.address,b.address));
function proposal(input){
 if(input?.schemaVersion!==1||input.environment!=='isolated-rehearsal')throw Error('Only isolated rehearsal reserve planning is supported');
 const custody=reviewGenesisCustody(input),g=input.genesisAudit;
 const source=g.accounts.find(a=>a.address===input.reserveAddress);
 if(source.owner!==SYSTEM||source.dataBytes!==0||source.executable)throw Error('Replacement requires a funded empty System reserve');
 const configuration=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(input.bridgeId).toBuffer()],new PublicKey(input.bridgeProgram))[0].toBase58();
 const reserve=custody.reserve.expectedAddress;
 if(g.accounts.some(a=>a.address===reserve||a.address===configuration))throw Error('Proposed config or reserve already exists in the baseline');
 if([input.bridgeProgram,input.bridgeId,configuration,reserve,input.reserveAddress].includes(input.originMint))throw Error('Distinct origin mint and selected reserve identities required');
 const selectedPolicy=policy(g);
 const budget=auditBootstrap({schemaVersion:1,environment:'isolated-rehearsal',genesisAudit:g,originMint:input.originMint,originDecimals:input.originDecimals,nativeDecimals:input.nativeDecimals,originSupplyUnits:input.originSupplyUnits,prelockedOriginUnits:input.prelockedOriginUnits,reserveAddress:input.reserveAddress,reserveDataBytes:16,protectedReserveNativeUnits:input.protectedReserveNativeUnits});
 const proposedAccounts=rows(g.accounts.map(a=>a.address===input.reserveAddress?{...a,address:reserve}:a));
 return {schemaVersion:1,scope:'isolated-prefunded-reserve-allocation-plan-v1',baselineGenesis:g.genesis,baselineInventoryMetadataSHA256:input.expectedInventorySHA256,bridgeProgram:input.bridgeProgram,bridgeId:input.bridgeId,configurationAddress:configuration,reserveAddress:reserve,replacedReserveAddress:input.reserveAddress,accountCount:g.accountCount,totalNativeUnits:g.totalLamports,allocationPolicy:selectedPolicy,proposedAccounts,
  declaredBudget:{originMint:input.originMint,originDecimals:input.originDecimals,nativeDecimals:input.nativeDecimals,originSupplyUnits:input.originSupplyUnits,prelockedOriginUnits:input.prelockedOriginUnits,protectedReserveNativeUnits:input.protectedReserveNativeUnits,minimumVaultRentNativeUnits:budget.backing.minimumVaultRentNativeUnits,minimumPrelockedOriginUnits:budget.backing.minimumPrelockedOriginUnits,backedNativeInsideReserveUnits:budget.backing.backedNativeInsideReserveUnits,availableForNewOriginDepositsNativeUnits:budget.backing.availableForNewOriginDepositsNativeUnits},
  proposedReserve:{address:reserve,lamports:source.lamports,owner:SYSTEM,dataBytes:0,executable:false}};
}
const limits={actualGenesisCompiled:false,actualAccountBytesVerified:false,reserveInitialized:false,bootstrapSourceEventsConsumed:false,onChainCountersApplied:false,finalizedOriginalBackingVerified:false,reserveCustodyVerified:false,programmeUpgradeControlsVerified:false,fullValidatorConsensusVerified:false,independentVerification:false,canPrepare:false,canSign:false,canBroadcast:false,activationEnabled:false,productionReady:false};
export function planPrefundedReserve(input){
 const p=proposal(input);
 return {...p,state:'PROPOSED_PREFUNDED_RESERVE_ALLOCATION',planSHA256:hash('classic-reserve-prefund-plan-v1',p),allocationChangeCount:1,unchangedAccountCount:p.accountCount-1,proposedGenesis:null,requiresFreshGenesis:true,...limits};
}
export function reviewPrefundedReserveInventory({planningInput,expectedPlanSHA256,genesisAudit,expectedGenesis,expectedInventorySHA256}){
 const p=proposal(planningInput);
 const planSHA256=hash('classic-reserve-prefund-plan-v1',p);
 if(typeof expectedPlanSHA256!=='string'||! /^[a-f0-9]{64}$/.test(expectedPlanSHA256)||planSHA256!==expectedPlanSHA256)throw Error('Externally selected reserve plan differs');
 if(expectedGenesis===p.baselineGenesis||genesisAudit?.genesis===p.baselineGenesis)throw Error('Changed allocation requires a fresh selected genesis');
 // Reuse strict genesis/metadata selection and bounds; System ownership is intentional before init.
 reviewGenesisCustody({genesisAudit,expectedGenesis,expectedInventorySHA256,reserveAddress:p.reserveAddress,bridgeProgram:p.bridgeProgram,bridgeId:p.bridgeId});
 if(JSON.stringify(policy(genesisAudit))!==JSON.stringify(p.allocationPolicy))throw Error('Supplied inventory allocation policy differs');
 if(genesisAudit.accountCount!==p.accountCount||genesisAudit.totalLamports!==p.totalNativeUnits||JSON.stringify(rows(genesisAudit.accounts))!==JSON.stringify(p.proposedAccounts))throw Error('Complete supplied inventory differs from proposed allocations');
 const budget=auditBootstrap({schemaVersion:1,environment:'isolated-rehearsal',genesisAudit,reserveAddress:p.reserveAddress,reserveDataBytes:16,...p.declaredBudget});
 return {schemaVersion:1,state:'SUPPLIED_PREFUNDED_RESERVE_METADATA_MATCHED',scope:'Exact supplied complete metadata and declared budget comparison; not compiled genesis or account-byte verification',planSHA256,baselineGenesis:p.baselineGenesis,selectedGenesis:genesisAudit.genesis,inventoryMetadataSHA256:genesisInventoryMetadataDigest(genesisAudit),accountCount:p.accountCount,totalNativeUnits:p.totalNativeUnits,allocationChangeCount:1,unchangedAccountCount:p.accountCount-1,proposedReserveMetadataMatched:true,declaredBudgetReconciled:budget.accountingPassed,requiresFreshActivationInventory:true,...limits};
}
