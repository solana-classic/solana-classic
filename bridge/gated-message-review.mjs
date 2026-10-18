// Offline message/signature compatibility only. No keys, persistence, RPC or submission.
import {createHash} from 'node:crypto';
import {PublicKey,Transaction} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {gatedNativeClaimInstruction,gatedNativeReturnInstruction,gatedNativePauseInstruction} from './gated-native.mjs';
const DOMAIN='solana-classic/gated-native-message-review/v1\0';
const ZERO='11111111111111111111111111111111';
const reserved=new Set([ZERO,'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb','BPFLoaderUpgradeab1e11111111111111111111111']);
const hash=b=>createHash('sha256').update(b).digest('hex');
function shape(v,fields){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))throw Error('Exact gated message review schema required');}
function key(v){if(typeof v!=='string'||new PublicKey(v).toBase58()!==v||v===ZERO)throw Error('Canonical nonzero message identity required');return new PublicKey(v);}
function signer(v){const p=key(v);if(reserved.has(v)||!PublicKey.isOnCurve(p.toBytes()))throw Error('External on-curve message signer required');return p;}
function selected(intent){
 shape(intent,['kind','parameters','payer','recentBlockhash','lastValidBlockHeight']);
 const {kind,parameters:p,payer,recentBlockhash,lastValidBlockHeight}=intent;
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<=0)throw Error('Selected block-height expiry required');
 signer(payer);key(recentBlockhash);
 let built;
 if(kind==='claim'){
  shape(p,['context','bootstrap','event','payer','committee','recipient']);
  shape(p.event,['bridge','sourceChain','destinationChain','sourceProgram','destinationProgram','sender','recipient','originAmount','nonce','slot','epoch','direction','sourceEvent']);
  if(p.payer!==payer||p.recipient===payer||p.committee?.includes(payer)||p.committee?.includes(p.recipient))throw Error('Separate claim payer, recipient and committee required');
  built=gatedNativeClaimInstruction(p);
 }else if(kind==='return'){
  shape(p,['context','bootstrap','sender','recipient','originAmount','nonce']);
  if(p.sender!==payer)throw Error('Native return sender must be its sole fee payer');
  built=gatedNativeReturnInstruction(p);
 }else if(kind==='pause'){
  shape(p,['context','bootstrap','committee','newLocksPaused','settlementPaused']);
  if(p.committee?.includes(payer))throw Error('Separate pause fee payer required');
  if(p.newLocksPaused===true&&p.settlementPaused===true&&p.bootstrap!==null)throw Error('Full pause selects no bootstrap input');
  built=gatedNativePauseInstruction(p);
 }else throw Error('Explicit gated message kind required');
 const ix=built.instruction,signers=new Set([payer,...ix.keys.filter(m=>m.isSigner).map(m=>m.pubkey.toBase58())]);
 for(const s of signers)signer(s);
 if(payer===ix.programId.toBase58()||ix.keys.some(m=>!m.isSigner&&signers.has(m.pubkey.toBase58())))throw Error('Message signer aliases a protected instruction account');
 const tx=new Transaction({feePayer:key(payer),recentBlockhash}).add(ix),message=tx.serializeMessage();
 const compiled=tx.compileMessage(),requiredSigners=compiled.accountKeys.slice(0,compiled.header.numRequiredSignatures).map(k=>k.toBase58());
 if(requiredSigners.length!==signers.size||message.length+1+64*requiredSigners.length>1232)throw Error('Bounded exact legacy signer set required');
 const pins=normalizeProgramPins(p.context.pins);
 const selection={schemaVersion:1,scope:'gated-native-message-review-v1',kind,abi:built.abi,pins,
  configurationSHA256:built.configurationSHA256,bootstrapRecordSHA256:built.selectedBootstrapRecordSHA256,
  bootstrapSourceEvent:built.selectedBootstrapRecordSHA256===null?null:p.bootstrap.expectedSourceEvent,
  minimumRentNativeUnits:built.selectedBootstrapRecordSHA256===null?null:p.bootstrap.minimumRentNativeUnits.toString(),
  messageSHA256:hash(message),lastValidBlockHeight};
 return {message,requiredSigners,selection,reviewSHA256:hash(Buffer.concat([Buffer.from(DOMAIN),Buffer.from(JSON.stringify(selection))]))};
}
function report(s){return {schemaVersion:1,state:'OFFLINE_GATED_MESSAGE_DESCRIPTION',...s.selection,reviewSHA256:s.reviewSHA256,
 requiredSigners:[...s.requiredSigners],unsignedMessageBase64:s.message.toString('base64'),
 chainStateVerified:false,sourceFinalityVerified:false,expiryVerified:false,canPrepareJournal:false,canSign:false,canBroadcast:false,productionReady:false};}
export function describeGatedNativeMessage(intent){return report(selected(intent));}
export function reviewGatedNativeSignedTransaction(input){
 shape(input,['intent','expectedReviewSHA256','transactionBytes']);
 const {intent,expectedReviewSHA256,transactionBytes}=input;
 if(typeof expectedReviewSHA256!=='string'||! /^[a-f0-9]{64}$/.test(expectedReviewSHA256))throw Error('External exact review digest required');
 const s=selected(intent);
 if(s.reviewSHA256!==expectedReviewSHA256)throw Error('Selected gated message review changed');
 if(!(transactionBytes instanceof Uint8Array)||transactionBytes.byteLength===0||transactionBytes.byteLength>1232)throw Error('Bounded signed legacy transaction bytes required');
 const raw=Buffer.from(transactionBytes),tx=Transaction.from(raw);
 if(!tx.serializeMessage().equals(s.message)||tx.instructions.length!==1||tx.signatures.length!==s.requiredSigners.length||tx.signatures.some((v,i)=>v.publicKey.toBase58()!==s.requiredSigners[i]||!v.signature)||!tx.verifySignatures()||!tx.serialize().equals(raw))throw Error('Signed gated transaction differs or lacks exact valid signatures');
 return {...report(s),state:'OFFLINE_GATED_SIGNATURES_VERIFIED',transactionSHA256:hash(raw),signedBytes:raw.length,
 signaturesVerified:true,messageMatches:true,journalVersionSelected:null};
}
