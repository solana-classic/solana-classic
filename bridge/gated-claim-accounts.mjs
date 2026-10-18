// Pure review of supplied destination account JSON. No RPC, keys or lifecycle writes.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {parseNativeAccountsRPC} from './lossless-native-rpc.mjs';
import {describeGatedNativeMessage} from './gated-message-review.mjs';
import {gatedNativeClaimInstruction} from './gated-native.mjs';
import {decodeBootstrapRecord} from './bootstrap.mjs';
const SYS='11111111111111111111111111111111',SYSVAR='Sysvar1111111111111111111111111111111111111',MAX=(1n<<64n)-1n;
export const GATED_CLAIM_SYSVARS=Object.freeze({rent:'SysvarRent111111111111111111111111111111111',clock:'SysvarC1ock11111111111111111111111111111111'});
const hash=b=>createHash('sha256').update(b).digest('hex');
const shape=(v,fields)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))throw Error('Exact gated destination review schema required');};
function selected(intent,expected){if(intent?.kind!=='claim')throw Error('Selected gated native claim required');const review=describeGatedNativeMessage(intent);if(typeof expected!=='string'||review.reviewSHA256!==expected)throw Error('Externally selected gated review differs');return review;}
export function gatedClaimDestinationSelection({intent,expectedReviewSHA256}){
 const review=selected(intent,expectedReviewSHA256),ix=gatedNativeClaimInstruction(intent.parameters).instruction;
 const addresses=[ix.keys[1],ix.keys[2],ix.keys[10],ix.keys[11],ix.keys[3]].map(k=>k.pubkey.toBase58());addresses.push(GATED_CLAIM_SYSVARS.rent,GATED_CLAIM_SYSVARS.clock,intent.payer,intent.parameters.recipient);
 if(new Set(addresses).size!==addresses.length)throw Error('Distinct selected destination accounts required');return {review,addresses};
}
function data(a,owner,size){
 if(!a||a.owner!==owner||a.executable!==false||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length!==Math.ceil(size/3)*4||typeof a.lamports!=='bigint')throw Error('Destination account owner, layout or balance differs');
 const b=Buffer.from(a.data[0],'base64');if(b.length!==size||b.toString('base64')!==a.data[0])throw Error('Canonical destination bytes required');return b;
}
export function reviewGatedClaimDestinationAccounts(input){
 shape(input,['intent','expectedReviewSHA256','minimumContextSlot','feeNativeUnits','raw']);const {intent,expectedReviewSHA256,minimumContextSlot,feeNativeUnits,raw}=input;
 const {review,addresses}=gatedClaimDestinationSelection({intent,expectedReviewSHA256});
 if(!Number.isSafeInteger(minimumContextSlot)||minimumContextSlot<1||typeof feeNativeUnits!=='bigint'||feeNativeUnits<0n||feeNativeUnits>MAX||typeof raw!=='string'||Buffer.byteLength(raw)>32768)throw Error('Bounded exact destination checkpoint, fee and raw response required');
 const snap=parseNativeAccountsRPC(raw).result;if(snap.context.slot<minimumContextSlot||snap.value.length!==9)throw Error('Destination snapshot precedes checkpoint or lacks selected accounts');
 const [c,v,b,consumed,unused,rent,clock,payer,recipient]=snap.value,p=intent.parameters,pins=p.context.pins;
 const cfg=data(c,pins.program,382),vault=data(v,pins.program,16),boot=data(b,pins.program,120),receipt=data(consumed,pins.program,32),rentBytes=data(rent,SYSVAR,17),clockBytes=data(clock,SYSVAR,40);data(payer,SYS,0);
 if(recipient!==null)data(recipient,SYS,0);
 if(!cfg.equals(Buffer.from(p.context.configurationBytes))||!boot.equals(Buffer.from(p.bootstrap.recordBytes)))throw Error('Current configuration or bootstrap differs from selected exact snapshot');
 const w=decodeBootstrapRecord(boot),source=new PublicKey(w.sourceEvent).toBuffer();if(!receipt.equals(source)||unused!==null)throw Error('Bootstrap receipt differs or incoming claim receipt already exists');
 const rate=rentBytes.readBigUInt64LE(0),threshold=rentBytes.readDoubleLE(8);
 if(rate===0n||!Number.isSafeInteger(threshold)||threshold<1||rentBytes[16]>100)throw Error('Unsupported current rent policy');
 const multiplier=rate*BigInt(threshold),minimumVaultRent=144n*multiplier,claimRent=160n*multiplier;
 if(minimumVaultRent>BigInt(Number.MAX_SAFE_INTEGER)||claimRent>BigInt(Number.MAX_SAFE_INTEGER)||minimumVaultRent!==p.bootstrap.minimumRentNativeUnits||vault.subarray(0,8).toString()!=='SCVLT002'||vault.readBigUInt64LE(8)!==w.protectedNative||w.protectedNative<minimumVaultRent)throw Error('Vault floor or declared rent differs from observed policy');
 const factor=10n**BigInt(9-cfg[328]),outstanding=cfg.readBigUInt64LE(374),native=p.event.originAmount*factor,required=(w.originSupply-outstanding)*factor+w.protectedNative;
 if(required>MAX||v.lamports<required||v.lamports-native<w.protectedNative||(recipient?.lamports??0n)+native>MAX||feeNativeUnits+claimRent>MAX||payer.lamports<feeNativeUnits+claimRent)throw Error('Destination reserve, recipient capacity or payer rent/fee funding insufficient');
 const timestamp=clockBytes.readBigInt64LE(32),clockSlot=clockBytes.readBigUInt64LE(0),day=cfg.readBigUInt64LE(358),used=cfg.readBigUInt64LE(366),daily=cfg.readBigUInt64LE(350);
 if(timestamp<0n||clockSlot>BigInt(snap.context.slot)||clockSlot<BigInt(minimumContextSlot))throw Error('Destination clock is invalid or outside finalized checkpoint');
 const currentDay=timestamp/86400n,total=(currentDay>day?0n:used)+p.event.originAmount;
 if(currentDay<day||total>MAX||total>daily)throw Error('Destination daily settlement budget exhausted or clock day regressed');
 const stable=snap.value.map((a,i)=>i===6?null:a===null?null:{owner:a.owner,executable:a.executable,lamports:a.lamports.toString(),data:a.data[0]});
 return {schemaVersion:1,state:'SUPPLIED_GATED_DESTINATION_ACCOUNTS_MATCHED',scope:'Supplied finalized-commitment account JSON against selected claim; no RPC execution, independent finality or lifecycle admission',reviewSHA256:review.reviewSHA256,contextSlot:snap.context.slot,snapshotSHA256:hash(JSON.stringify({addresses,accounts:stable})),clockSlot:clockSlot.toString(),clockUnixTimestamp:timestamp.toString(),nativeAmount:native.toString(),reserveNativeUnits:v.lamports.toString(),minimumReserveNativeUnits:required.toString(),protectedFloorNativeUnits:w.protectedNative.toString(),minimumVaultRentNativeUnits:minimumVaultRent.toString(),claimRentNativeUnits:claimRent.toString(),selectedFeeNativeUnits:feeNativeUnits.toString(),payerNativeUnits:payer.lamports.toString(),remainingDailyOriginUnits:(daily-total).toString(),incomingReceiptAbsent:true,consumedBootstrapReceiptMatched:true,selectedDestinationAccountsMatched:true,deployedCodeObserved:false,rpcObservationExecuted:false,independentVerification:false,sourceFinalityVerified:false,expiryVerified:false,canPrepareSubmission:false,canSign:false,canBroadcast:false,productionReady:false};
}
