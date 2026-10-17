// Disposable synthetic test inputs only; no retained private files.
import {createHash} from 'node:crypto';
import {Keypair,PublicKey} from '@solana/web3.js';
import {GATED_NATIVE_CONTRACT} from '../gated-native.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),pk=v=>new PublicKey(v),key=i=>new PublicKey(Buffer.alloc(32,i)).toBase58();
const le=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
const pda=(p,seeds)=>PublicKey.findProgramAddressSync(seeds,pk(p))[0];
export function fixture(kind='claim',flags=[false,false]){
 const keys=Array.from({length:7},()=>Keypair.generate()),[payer,...members]=keys,committee=members.slice(0,5).map(k=>k.publicKey.toBase58()),recipient=keys[6].publicKey.toBase58();
 const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,i] of [[8,1],[40,3],[72,2],[104,4],[136,40]])pk(key(i)).toBuffer().copy(config,o);
 committee.forEach((v,i)=>pk(v).toBuffer().copy(config,168+32*i));config.set([6,9,1,3],328);config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2_000_000n,342);config.writeBigUInt64LE(4_000_000n,350);config.writeBigUInt64LE(102_000n,374);
 const pins={genesis:key(3),remoteGenesis:key(2),program:key(5),remoteProgram:key(4),bridge:key(1),originMint:key(40),side:1,upgradeAuthority:key(8),elfSHA256:GATED_NATIVE_CONTRACT.elfSHA256,elfBytes:GATED_NATIVE_CONTRACT.elfBytes,programDataSHA256:'a'.repeat(64),policySHA256:hash(config.subarray(0,358))};
 const sourceConfig=pda(pins.remoteProgram,[Buffer.from('config'),pk(pins.bridge).toBuffer()]);
 const sourceEvent=n=>pda(pins.remoteProgram,[Buffer.from('event'),sourceConfig.toBuffer(),pk(recipient).toBuffer(),le(n)]).toBase58();
 const record=Buffer.concat([Buffer.from('SCBST001'),Buffer.alloc(32,42),le(2_000_000n),le(2_000_000_000n),le(100_000_000n),le(1_900_000_000n),pk(sourceEvent(1n)).toBuffer(),le(102_000n),le(2_000_000n)]);
 const context={abi:GATED_NATIVE_CONTRACT.abi,pins,configurationBytes:config},bootstrap={recordBytes:record,expectedRecordSHA256:hash(record),expectedSourceEvent:sourceEvent(1n),minimumRentNativeUnits:1_002_240n};
 const event={bridge:pins.bridge,sourceChain:pins.remoteGenesis,destinationChain:pins.genesis,sourceProgram:pins.remoteProgram,destinationProgram:pins.program,sender:recipient,recipient,originAmount:50_000n,nonce:2n,slot:20n,epoch:1n,direction:0,sourceEvent:sourceEvent(2n)};
 let parameters,signers;
 if(kind==='claim'){parameters={context,bootstrap,event,payer:payer.publicKey.toBase58(),committee:committee.slice(0,3),recipient};signers=[payer,...members.slice(0,3)];}
 if(kind==='return'){parameters={context,bootstrap,sender:payer.publicKey.toBase58(),recipient,originAmount:25_000n,nonce:7n};signers=[payer];}
 if(kind==='pause'){parameters={context,bootstrap:flags.every(Boolean)?null:bootstrap,committee:committee.slice(0,3),newLocksPaused:flags[0],settlementPaused:flags[1]};signers=[payer,...members.slice(0,3)];}
 return {intent:{kind,parameters,payer:payer.publicKey.toBase58(),recentBlockhash:key(80),lastValidBlockHeight:500},signers};
}
