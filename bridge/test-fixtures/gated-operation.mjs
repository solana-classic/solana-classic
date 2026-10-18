// Disposable signed source/claim selections, without retained files or chain access.
import {createHash} from 'node:crypto';
import {Transaction,TransactionInstruction,PublicKey,SystemProgram} from '@solana/web3.js';
import {fixture} from './gated-review.mjs';
import {gatedNativeClaimInstruction} from '../gated-native.mjs';
import {describeGatedNativeMessage} from '../gated-message-review.mjs';
import {reviewedOriginMintPolicy} from '../reviewed-origin-mint.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),pk=v=>new PublicKey(v),le=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;},pda=(p,s)=>PublicKey.findProgramAddressSync(s,pk(p))[0],meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
export function operationFixture(){
 const f=fixture(),intent=f.intent,p=intent.parameters,pins=p.context.pins,payer=f.signers[0];p.event.sender=intent.payer;const config=pda(pins.remoteProgram,[Buffer.from('config'),pk(pins.bridge).toBuffer()]),vault=pda(pins.remoteProgram,[Buffer.from('vault'),config.toBuffer()]),event=pda(pins.remoteProgram,[Buffer.from('event'),config.toBuffer(),payer.publicKey.toBuffer(),le(p.event.nonce)]);p.event.sourceEvent=event.toBase58();
 const originCfg=Buffer.from(p.context.configurationBytes);pk(pins.remoteGenesis).toBuffer().copy(originCfg,40);pk(pins.genesis).toBuffer().copy(originCfg,72);pk(pins.program).toBuffer().copy(originCfg,104);originCfg[330]=0;originCfg.writeBigUInt64LE(152000n,374);
 const sourcePins={...pins,genesis:pins.remoteGenesis,remoteGenesis:pins.genesis,program:pins.remoteProgram,remoteProgram:pins.program,side:0,elfSHA256:'556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53',elfBytes:203920,programDataSHA256:'b'.repeat(64),policySHA256:hash(originCfg.subarray(0,358))},tokenPins={genesis:sourcePins.genesis,elfBytes:506896,elfSHA256:'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68',programDataSHA256:'c'.repeat(64),upgradeAuthority:SystemProgram.programId.toBase58()};
 const policy=reviewedOriginMintPolicy({pins:sourcePins,tokenPins,expectedSupplyUnits:'2000000',expectedDecimals:6,expectedMintDataSHA256:'d'.repeat(64)}),escrow=pda(sourcePins.program,[Buffer.from('escrow'),config.toBuffer()]),sourceToken=pda(sourcePins.program,[Buffer.from('synthetic-source-token')]);
 const sourceTx=new Transaction({feePayer:payer.publicKey,recentBlockhash:intent.recentBlockhash}).add(new TransactionInstruction({programId:pk(sourcePins.program),keys:[meta(payer.publicKey,true,true),meta(config,true),meta(vault,true),meta(event,true),meta(SystemProgram.programId),meta(sourceToken,true),meta(escrow,true),meta(pk(sourcePins.originMint)),meta(pk('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'))],data:Buffer.concat([Buffer.from([1]),le(p.event.originAmount),le(p.event.nonce),pk(p.recipient).toBuffer()])}));sourceTx.sign(payer);
 const transaction=new Transaction({feePayer:payer.publicKey,recentBlockhash:intent.recentBlockhash}).add(gatedNativeClaimInstruction(p).instruction);transaction.sign(...f.signers);
 return {intent,expectedReviewSHA256:describeGatedNativeMessage(intent).reviewSHA256,transactionBytes:transaction.serialize(),source:{rpc:'http://127.0.0.1:29981',policy,transactionBase64:sourceTx.serialize().toString('base64'),minimumContextSlot:Number(p.event.slot)},destinationRpc:'http://127.0.0.1:29991',minimumDestinationSlot:50};
}
