// Offline returned-account reconciliation. No RPC, journals, signing or writes.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {decodeEvent,validateEvent,exactNativeUnits} from './sdk.mjs';
const U64=(1n<<64n)-1n,zero='11111111111111111111111111111111';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>sha(Buffer.from('solana-classic/private-event-inventory/v1\0'+JSON.stringify(value)));
function exact(value,fields){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==fields.length||Object.keys(value).some(field=>!fields.includes(field)))throw Error('Exact event inventory schema required');}
function key(value){if(typeof value!=='string'||value.length<32||value.length>44||new PublicKey(value).toBase58()!==value||value===zero)throw Error('Canonical nonzero event inventory key required');return value;}
function units(value){if(typeof value!=='string'||value.length>20||! /^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>U64)throw Error('Canonical event inventory u64 units required');return BigInt(value);}
function bounded(value){if(value<0n||value>U64)throw Error('Derived event inventory units exceed u64');return value;}
const pda=(seeds,program)=>PublicKey.findProgramAddressSync(seeds,new PublicKey(program))[0].toBase58();
function configPolicy(bytes,pins){
 if(bytes.length!==382||bytes.subarray(0,8).toString()!=='SCCFG001'||sha(bytes.subarray(0,358))!==pins.policySHA256)throw Error('Returned configuration differs from selected policy');
 for(const [offset,value] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,pins.originMint]])if(new PublicKey(bytes.subarray(offset,offset+32)).toBase58()!==value)throw Error('Returned configuration identity differs');
 const committee=Array.from({length:5},(_,i)=>key(new PublicKey(bytes.subarray(168+i*32,200+i*32)).toBase58()));
 const originDecimals=bytes[328],epoch=bytes.readBigUInt64LE(332),limit=bytes.readBigUInt64LE(342);
 if(new Set(committee).size!==5||originDecimals>9||bytes[329]!==9||bytes[330]!==pins.side||bytes[331]!==3||epoch===0n||bytes[340]>1||bytes[341]>1||limit===0n||bytes.readBigUInt64LE(350)<limit)throw Error('Returned configuration precision, committee or policy invalid');
 return {originDecimals,epoch,outstanding:bytes.readBigUInt64LE(374),committee};
}
function inspectSnapshot(snapshot,pins,minimum){
 exact(snapshot,['genesis','program','commitment','contextSlot','accounts']);
 if(snapshot.genesis!==pins.genesis||snapshot.program!==pins.program||snapshot.commitment!=='finalized'||!Number.isSafeInteger(snapshot.contextSlot)||snapshot.contextSlot<minimum)throw Error('Returned account snapshot identity or checkpoint differs');
 if(!Array.isArray(snapshot.accounts)||snapshot.accounts.length<2||snapshot.accounts.length>256)throw Error('Two to 256 returned programme accounts required');
 const config=pda([Buffer.from('config'),new PublicKey(pins.bridge).toBuffer()],pins.program),vault=pda([Buffer.from('vault'),new PublicKey(config).toBuffer()],pins.program),seen=new Set(),events=new Map(),receipts=new Map(),rows=[];let policy=null,reserve=null;
 for(const row of snapshot.accounts){
  exact(row,['address','owner','executable','lamports','dataBase64']);const address=key(row.address);units(row.lamports);
  if(seen.has(address)||row.owner!==pins.program||row.executable!==false)throw Error('Duplicate or invalid returned programme account');seen.add(address);
  if(typeof row.dataBase64!=='string'||row.dataBase64.length>512)throw Error('Bounded returned programme account data required');
  const bytes=Buffer.from(row.dataBase64,'base64');if(bytes.toString('base64')!==row.dataBase64)throw Error('Canonical returned account base64 required');
  rows.push({...row});
  if(address===config){policy=configPolicy(bytes,pins);continue;}
  if(address===vault){if(bytes.length!==16||bytes.subarray(0,8).toString()!=='SCVLT002')throw Error('Selected V2 vault required');reserve={units:units(row.lamports),floor:bytes.readBigUInt64LE(8)};continue;}
  if(bytes.length===297){
   const event=decodeEvent(bytes);validateEvent(event,{bridge:pins.bridge,sourceChain:pins.genesis,destinationChain:pins.remoteGenesis,sourceProgram:pins.program,destinationProgram:pins.remoteProgram,recipient:event.recipient,epoch:event.epoch,direction:pins.side});
   key(event.sender);if(event.sourceEvent!==address||event.slot>BigInt(snapshot.contextSlot))throw Error('Returned event address or slot differs');events.set(address,event);continue;
  }
  if(bytes.length===32){
   const sourceEvent=key(new PublicKey(bytes).toBase58());
   if(pda([Buffer.from('claim'),new PublicKey(config).toBuffer(),new PublicKey(sourceEvent).toBuffer()],pins.program)!==address)throw Error('Consumed receipt PDA differs');receipts.set(sourceEvent,address);continue;
  }
  // Bootstrap needs its separate funded-inventory model; never silently omit it.
  throw Error('Unsupported returned account, bootstrap or another bridge instance');
 }
 if(!policy||!reserve)throw Error('Selected configuration and vault missing');
 for(const event of events.values())if(event.epoch!==policy.epoch)throw Error('Returned source event epoch differs');
 rows.sort((a,b)=>a.address<b.address?-1:a.address>b.address?1:0);
 return {policy,reserve,events,receipts,contextSlot:snapshot.contextSlot,accounts:rows.length,snapshotSHA256:hash({...snapshot,accounts:rows})};
}

export function reconcileEventInventory({pins,originSnapshot,nativeSnapshot,originEscrowUnits,minimumContextSlots}){
 exact(pins,['origin','native']);const origin=normalizeProgramPins(pins.origin),native=normalizeProgramPins(pins.native);
 for(const selected of [origin,native])for(const field of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'])key(selected[field]);
 if(origin.side!==0||native.side!==1||origin.genesis!==native.remoteGenesis||native.genesis!==origin.remoteGenesis||origin.program!==native.remoteProgram||native.program!==origin.remoteProgram||origin.bridge!==native.bridge||origin.originMint!==native.originMint)throw Error('Both returned inventories require one matching isolated bridge domain');
 if(!Array.isArray(minimumContextSlots)||minimumContextSlots.length!==2||minimumContextSlots.some(slot=>!Number.isSafeInteger(slot)||slot<1))throw Error('Two explicit positive finalized checkpoints required');
 const escrow=units(originEscrowUnits),o=inspectSnapshot(originSnapshot,origin,minimumContextSlots[0]),n=inspectSnapshot(nativeSnapshot,native,minimumContextSlots[1]);
 if(o.policy.epoch!==n.policy.epoch||o.policy.originDecimals!==n.policy.originDecimals||JSON.stringify(o.policy.committee)!==JSON.stringify(n.policy.committee))throw Error('Returned programme policies disagree');
 let locks=0n,returns=0n,claimed=0n,redeemed=0n,pendingClaims=0n,pendingRedemptions=0n,pendingNativePayout=0n;const records=[];
 for(const [source,destination,direction] of [[o,n,0],[n,o,1]]){
  for(const id of destination.receipts.keys())if(!source.events.has(id))throw Error('Consumed receipt lacks its returned opposite-chain source event');
  for(const [id,event] of source.events){
   const nativeUnits=exactNativeUnits(event.originAmount,o.policy.originDecimals),consumed=destination.receipts.has(id);
   if(direction===0){locks+=event.originAmount;if(consumed)claimed+=event.originAmount;else{pendingClaims+=event.originAmount;pendingNativePayout+=nativeUnits;}}
   else{returns+=event.originAmount;if(consumed)redeemed+=event.originAmount;else pendingRedemptions+=event.originAmount;}
   records.push({sourceEvent:id,sourceSide:direction,originAmount:event.originAmount.toString(),nativeAmount:nativeUnits.toString(),consumedReceipt:destination.receipts.get(id)??null,pending:!consumed});
  }
 }
 const originOutstanding=bounded(locks-redeemed),nativeOutstanding=bounded(claimed-returns),pending=bounded(pendingClaims+pendingRedemptions);bounded(pendingNativePayout);
 if(o.policy.outstanding!==originOutstanding||n.policy.outstanding!==nativeOutstanding||originOutstanding!==nativeOutstanding+pending)throw Error('Returned source events, consumed receipts and counters do not reconcile');
 if(escrow<originOutstanding||n.reserve.units<n.reserve.floor+pendingNativePayout)throw Error('Supplied escrow or returned reserve does not cover derived obligations');
 records.sort((a,b)=>a.sourceSide-b.sourceSide||(a.sourceEvent<b.sourceEvent?-1:a.sourceEvent>b.sourceEvent?1:0));
 const result={schemaVersion:1,scope:'offline-returned-programme-account-reconciliation',bridge:origin.bridge,epoch:o.policy.epoch.toString(),originDecimals:o.policy.originDecimals,contextSlots:[o.contextSlot,n.contextSlot],snapshotSHA256:[o.snapshotSHA256,n.snapshotSHA256],returnedAccounts:[o.accounts,n.accounts],sourceEvents:[o.events.size,n.events.size],consumedReceipts:[o.receipts.size,n.receipts.size],records,flows:{originLocksUnits:locks.toString(),nativeClaimsOriginUnits:claimed.toString(),nativeReturnsOriginUnits:returns.toString(),originalRedemptionsUnits:redeemed.toString()},accounting:{originEscrowUnits:escrow.toString(),originOutstandingUnits:originOutstanding.toString(),nativeOutstandingUnits:nativeOutstanding.toString(),unallocatedEscrowSurplusUnits:(escrow-originOutstanding).toString(),reserveNativeUnits:n.reserve.units.toString(),protectedFloorNativeUnits:n.reserve.floor.toString()},pending:{nativeClaimOriginUnits:pendingClaims.toString(),originalRedemptionOriginUnits:pendingRedemptions.toString(),totalOriginUnits:pending.toString(),nativePayoutUnits:pendingNativePayout.toString()},returnedEventAndReceiptAccountingMatched:true,selectedConfigurationPolicyBound:true,rpcResponseCompletenessVerified:false,completeSourceEventInventoryVerified:false,sameLedgerHistoryVerified:false,simultaneousSnapshotVerified:false,finalizedCommitmentIndependentlyVerified:false,freshChainStateVerified:false,deployedCodeAndCustodyVerified:false,sourceEconomicMovementsIndependentlyVerified:false,backingVerified:false,canRetry:false,canRefund:false,canResetAttempt:false,canSign:false,canBroadcast:false,settlementAccepted:false,productionReady:false};
 return {...result,inventorySHA256:hash(result)};
}

// Pure single-side admission for a collector; this confers no history or custody proof.
export function inspectReturnedProgramSnapshot(snapshot,selectedPins,minimumContextSlot){
 const pins=normalizeProgramPins(selectedPins);
 for(const field of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'])key(pins[field]);
 if(!Number.isSafeInteger(minimumContextSlot)||minimumContextSlot<1)throw Error('Explicit positive finalized checkpoint required');
 return inspectSnapshot(snapshot,pins,minimumContextSlot);
}
