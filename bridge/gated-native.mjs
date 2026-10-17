// Separate unsigned instruction builders for the explicitly selected gated prototype.
// Supplied pins/bytes are declarations: no RPC, chain-state admission, keys or submission.
import {createHash} from 'node:crypto';
import {PublicKey,TransactionInstruction} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {decodeBootstrapRecord} from './bootstrap.mjs';
import {nativeClaimInstruction,exactNativeUnits} from './sdk.mjs';
export const GATED_NATIVE_CONTRACT=Object.freeze({abi:'native-bootstrap-trailer-v3',elfSHA256:'19424e0679c8d2d801fcb6ab015860b7b8f487cf0b1c6e2e7b41ca3d40efc16b',elfBytes:217032});
const ZERO='11111111111111111111111111111111',U64=(1n<<64n)-1n;
const reserved=new Set([ZERO,'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','BPFLoaderUpgradeab1e11111111111111111111111']);
const hash=b=>createHash('sha256').update(b).digest('hex');
function shape(v,fields){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))throw Error('Exact gated input schema required');}
function key(v){if(typeof v!=='string'||new PublicKey(v).toBase58()!==v||v===ZERO)throw Error('Canonical nonzero gated identity required');return new PublicKey(v);}
function bytes(v,size){if(!(v instanceof Uint8Array)||v.byteLength!==size)throw Error('Exact gated account bytes required');return Buffer.from(v);}
function integer(v,nonzero=false){if(typeof v!=='bigint'||v<0n||v>U64||(nonzero&&v===0n))throw Error('Exact gated u64 BigInt required');return v;}
function le(v){const b=Buffer.alloc(8);b.writeBigUInt64LE(integer(v));return b;}
const pda=(program,seeds)=>PublicKey.findProgramAddressSync(seeds,program)[0];
function context(input){
 shape(input,['abi','pins','configurationBytes']);
 if(input.abi!==GATED_NATIVE_CONTRACT.abi)throw Error('Explicit gated native ABI required');
 const pins=normalizeProgramPins(input.pins);
 if(pins.side!==1||pins.elfSHA256!==GATED_NATIVE_CONTRACT.elfSHA256||pins.elfBytes!==GATED_NATIVE_CONTRACT.elfBytes)throw Error('Selected gated native artifact required');
 for(const f of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'])key(pins[f]);
 if(reserved.has(pins.program)||reserved.has(pins.remoteProgram)||pins.program===pins.remoteProgram)throw Error('Distinct nonreserved bridge programmes required');
 const b=bytes(input.configurationBytes,382);
 if(b.subarray(0,8).toString()!=='SCCFG001'||hash(b.subarray(0,358))!==pins.policySHA256)throw Error('Selected gated configuration policy differs');
 for(const [offset,name] of [[8,'bridge'],[40,'genesis'],[72,'remoteGenesis'],[104,'remoteProgram'],[136,'originMint']])if(!b.subarray(offset,offset+32).equals(key(pins[name]).toBuffer()))throw Error('Gated configuration identity differs');
 const committee=Array.from({length:5},(_,i)=>new PublicKey(b.subarray(168+32*i,200+32*i)).toBase58());committee.forEach(key);
 const originDecimals=b[328],epoch=b.readBigUInt64LE(332),limit=b.readBigUInt64LE(342),daily=b.readBigUInt64LE(350);
 if(new Set(committee).size!==5||originDecimals>9||b[329]!==9||b[330]!==1||b[331]!==3||epoch!==1n||b[340]>1||b[341]>1||limit===0n||daily<limit)throw Error('Gated committee, precision, epoch or cap policy differs');
 const program=key(pins.program),config=pda(program,[Buffer.from('config'),key(pins.bridge).toBuffer()]),vault=pda(program,[Buffer.from('vault'),config.toBuffer()]),record=pda(program,[Buffer.from('bootstrap'),config.toBuffer()]);
 return {pins,b,committee,originDecimals,epoch,limit,program,config,vault,record,outstanding:b.readBigUInt64LE(374)};
}
function bootstrap(c,input){
 shape(input,['recordBytes','expectedRecordSHA256','expectedSourceEvent','minimumRentNativeUnits']);
 const b=bytes(input.recordBytes,120);
 if(typeof input.expectedRecordSHA256!=='string'||! /^[a-f0-9]{64}$/.test(input.expectedRecordSHA256)||hash(b)!==input.expectedRecordSHA256)throw Error('Externally selected bootstrap record bytes required');
 const w=decodeBootstrapRecord(b);key(input.expectedSourceEvent);
 const factor=10n**BigInt(9-c.originDecimals),backing=w.originAmount*factor;
 if(w.inventorySHA256==='0'.repeat(64)||w.sourceEvent!==input.expectedSourceEvent||w.originSupply===0n||w.originAmount===0n||w.originAmount>w.originSupply||w.originAmount>c.limit||w.outsideNative===0n||w.totalNative!==w.originSupply*factor||w.totalNative>U64||w.outsideNative+w.reserveNative!==w.totalNative||backing>w.totalNative||backing-w.outsideNative!==w.protectedNative||w.protectedNative<integer(input.minimumRentNativeUnits,true)||w.protectedNative>w.reserveNative||c.outstanding>w.originSupply)throw Error('Selected bootstrap witness does not reconcile');
 const receipt=pda(c.program,[Buffer.from('claim'),c.config.toBuffer(),key(w.sourceEvent).toBuffer()]);
 return {w,sha256:hash(b),keys:[c.vault,c.record,receipt].map(pubkey=>({pubkey,isSigner:false,isWritable:false}))};
}
function members(c,input){if(!Array.isArray(input)||input.length!==3||new Set(input).size!==3||input.some(v=>!c.committee.includes(v)))throw Error('Three distinct configured gated committee signers required');return input.map(v=>({pubkey:key(v),isSigner:true,isWritable:false}));}
function actor(c,value,additional=[]){const k=key(value);if(reserved.has(value)||[c.pins.program,c.pins.remoteProgram,c.config.toBase58(),c.vault.toBase58(),c.record.toBase58(),c.pins.originMint,...additional].includes(value))throw Error('Gated actor aliases a protected account');return k;}
function result(c,instruction,b=null){return {schemaVersion:1,state:'UNSIGNED_GATED_NATIVE_INSTRUCTION',abi:GATED_NATIVE_CONTRACT.abi,instruction,selectedCodeSHA256:c.pins.elfSHA256,selectedPolicySHA256:c.pins.policySHA256,configurationSHA256:hash(c.b),selectedBootstrapRecordSHA256:b?.sha256??null,signatures:[],chainStateVerified:false,sourceFinalityVerified:false,canPrepareJournal:false,canSign:false,canBroadcast:false,productionReady:false};}
export function gatedNativeClaimInstruction({context:input,bootstrap:boot,event,payer,committee,recipient}){
 const c=context(input),b=bootstrap(c,boot);members(c,committee);
 if(c.b[341]!==0)throw Error('Declared gated settlement is paused');
 const claim=pda(c.program,[Buffer.from('claim'),c.config.toBuffer(),key(event.sourceEvent).toBuffer()]);
 actor(c,payer,[claim.toBase58(),b.keys[2].pubkey.toBase58()]);actor(c,recipient,[claim.toBase58(),b.keys[2].pubkey.toBase58()]);
 if(event.sourceEvent===b.w.sourceEvent||event.originAmount>c.limit||event.originAmount> b.w.originSupply-c.outstanding)throw Error('Consumed bootstrap backing or transfer cap cannot authorize an ordinary claim');
 exactNativeUnits(event.originAmount,c.originDecimals);
 const expected={bridge:c.pins.bridge,sourceChain:c.pins.remoteGenesis,destinationChain:c.pins.genesis,sourceProgram:c.pins.remoteProgram,destinationProgram:c.pins.program,recipient,epoch:c.epoch,direction:0};
 const ix=nativeClaimInstruction({event,expected,payer,committee});ix.keys.push(...b.keys);return result(c,ix,b);
}
export function gatedNativeReturnInstruction({context:input,bootstrap:boot,sender,recipient,originAmount,nonce}){
 const c=context(input),b=bootstrap(c,boot);integer(originAmount,true);integer(nonce);
 if(c.b[341]!==0||originAmount>c.limit||originAmount>c.outstanding)throw Error('Declared gated return exceeds pause, cap or outstanding obligation');
 exactNativeUnits(originAmount,c.originDecimals);const from=actor(c,sender,[b.keys[2].pubkey.toBase58()]);actor(c,recipient,[b.keys[2].pubkey.toBase58()]);
 const event=pda(c.program,[Buffer.from('event'),c.config.toBuffer(),from.toBuffer(),le(nonce)]);
 const instruction=new TransactionInstruction({programId:c.program,data:Buffer.concat([Buffer.from([1]),le(originAmount),le(nonce),key(recipient).toBuffer()]),keys:[{pubkey:from,isSigner:true,isWritable:true},{pubkey:c.config,isSigner:false,isWritable:true},{pubkey:c.vault,isSigner:false,isWritable:true},{pubkey:event,isSigner:false,isWritable:true},{pubkey:new PublicKey(ZERO),isSigner:false,isWritable:false},...b.keys]});
 return result(c,instruction,b);
}
export function gatedNativePauseInstruction({context:input,bootstrap:boot,committee,newLocksPaused,settlementPaused}){
 if(typeof newLocksPaused!=='boolean'||typeof settlementPaused!=='boolean')throw Error('Exact gated pause booleans required');
 const c=context(input),signers=members(c,committee),b=newLocksPaused&&settlementPaused?null:bootstrap(c,boot);
 const instruction=new TransactionInstruction({programId:c.program,data:Buffer.from([3,Number(newLocksPaused),Number(settlementPaused)]),keys:[{pubkey:c.config,isWritable:true,isSigner:false},...signers,...(b?.keys??[])]});return result(c,instruction,b);
}
