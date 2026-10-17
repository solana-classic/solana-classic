// Private synthetic VM wire adapter: public account bytes in, unsigned instruction out.
// No RPC, signing, keys, ledger/journal access or production selection.
import {readSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {decodeEvent} from '../sdk.mjs';
import {GATED_NATIVE_CONTRACT as contract,gatedNativeClaimInstruction,gatedNativeReturnInstruction,gatedNativePauseInstruction} from '../gated-native.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 if(Number(process.versions.node.split('.')[0])!==24)throw Error('Pinned Node24 profile required');
 const b=Buffer.alloc(65537);let used=0;
 while(true){const n=readSync(0,b,used,b.length-used,null);if(n===0)break;used+=n;if(used>65536)throw Error('Bounded public wire input required');}
 const x=JSON.parse(b.subarray(0,used));
 const fields=['configurationHex','program','programDataSHA256','upgradeAuthority','recordHex','expectedRecordSHA256','expectedSourceEvent','minimumRent','action','actor','committee','eventHex','recipient','originAmount','nonce'];
 if(!x||Object.keys(x).length!==fields.length||!fields.every(k=>Object.hasOwn(x,k)))throw Error('Exact public fixture wire schema required');
 const hex=(v,n)=>{if(typeof v!=='string'||v.length!==2*n||! /^[a-f0-9]*$/.test(v))throw Error('Exact fixture bytes required');return Buffer.from(v,'hex');};
 const c=hex(x.configurationHex,382),address=o=>new PublicKey(c.subarray(o,o+32)).toBase58();
 const context={abi:contract.abi,pins:{genesis:address(40),remoteGenesis:address(72),program:x.program,remoteProgram:address(104),bridge:address(8),originMint:address(136),side:1,upgradeAuthority:x.upgradeAuthority,elfSHA256:contract.elfSHA256,elfBytes:contract.elfBytes,programDataSHA256:x.programDataSHA256,policySHA256:hash(c.subarray(0,358))},configurationBytes:c};
 const integer=v=>{if(typeof v!=='string'||v.length>20||! /^(0|[1-9][0-9]*)$/.test(v))throw Error('Exact fixture integer string required');return BigInt(v);};
 const bootstrap=x.action==='full-pause'?undefined:{recordBytes:hex(x.recordHex,120),expectedRecordSHA256:x.expectedRecordSHA256,expectedSourceEvent:x.expectedSourceEvent,minimumRentNativeUnits:integer(x.minimumRent)};
 let result;
 if(x.action==='claim')result=gatedNativeClaimInstruction({context,bootstrap,event:decodeEvent(hex(x.eventHex,297)),payer:x.actor,committee:x.committee,recipient:x.recipient});
 else if(x.action==='return')result=gatedNativeReturnInstruction({context,bootstrap,sender:x.actor,recipient:x.recipient,originAmount:integer(x.originAmount),nonce:integer(x.nonce)});
 else if(['unpause','full-pause'].includes(x.action))result=gatedNativePauseInstruction({context,bootstrap,committee:x.committee,newLocksPaused:x.action==='full-pause',settlementPaused:x.action==='full-pause'});
 else throw Error('Selected fixture action required');
 const ix=result.instruction;
 process.stdout.write([ix.programId.toBase58(),ix.data.toString('hex'),...ix.keys.map(k=>k.pubkey.toBase58()+' '+Number(k.isSigner)+Number(k.isWritable))].join('\n')+'\n');
}catch{process.stderr.write('Unsigned fixture wire refused\n');process.exitCode=1;}
