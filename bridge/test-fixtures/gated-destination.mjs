// Synthetic destination RPC data; optional externally selected public ELF bytes only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {fixture} from './gated-review.mjs';
import {describeGatedNativeMessage} from '../gated-message-review.mjs';
import {gatedClaimDestinationSelection} from '../gated-claim-accounts.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),SYS='11111111111111111111111111111111',SYSVAR='Sysvar1111111111111111111111111111111111111',LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
export function destinationFixture(elf=null){
 const f=fixture(),intent=f.intent,p=intent.parameters,pins=p.context.pins;
 const account=(data,owner,lamports=1n,executable=false)=>({owner,lamports,executable,data:[data.toString('base64'),'base64']});
 let code=null,program=null;
 if(elf!==null){assert.equal(elf.length,217032);assert.equal(hash(elf),pins.elfSHA256);code=Buffer.alloc(45+elf.length);code.writeUInt32LE(3);code[12]=1;new PublicKey(pins.upgradeAuthority).toBuffer().copy(code,13);elf.copy(code,45);pins.programDataSHA256=hash(code);program=Buffer.alloc(36);program.writeUInt32LE(2);PublicKey.findProgramAddressSync([new PublicKey(pins.program).toBuffer()],new PublicKey(LOADER))[0].toBuffer().copy(program,4);}
 const expectedReviewSHA256=describeGatedNativeMessage(intent).reviewSHA256,selection=gatedClaimDestinationSelection({intent,expectedReviewSHA256}),vault=Buffer.alloc(16);vault.write('SCVLT002');vault.writeBigUInt64LE(2000000n,8);
 const rent=Buffer.alloc(17);rent.writeBigUInt64LE(3480n);rent.writeDoubleLE(2,8);rent[16]=50;const clock=Buffer.alloc(40);clock.writeBigUInt64LE(100n);clock.writeBigInt64LE(86400n,32);
 const rows=[account(Buffer.from(p.context.configurationBytes),pins.program,4000000n),account(vault,pins.program,1900000000n),account(Buffer.from(p.bootstrap.recordBytes),pins.program,2000000n),account(new PublicKey(p.bootstrap.expectedSourceEvent).toBuffer(),pins.program,2000000n),null,account(rent,SYSVAR),account(clock,SYSVAR),account(Buffer.alloc(0),SYS,10000000n),account(Buffer.alloc(0),SYS,100000000n)];
 const stringify=v=>JSON.stringify(v,(_,v)=>typeof v==='bigint'?JSON.rawJSON(v.toString()):v),calls=[];let context=100,height=20,mutation=()=>{},nativeReads=0;
 const raw=(slot=100)=>stringify({jsonrpc:'2.0',id:1,result:{context:{slot},value:rows}});
 const input=()=>({intent,expectedReviewSHA256,minimumContextSlot:50,feeNativeUnits:20000n,raw:raw()});
 const reply=q=>{
  calls.push(q);let result;
  if(q.method==='getGenesisHash')result=pins.genesis;
  else if(q.method==='getMultipleAccounts'){
   if(q.params[0][0]===pins.program){assert(code);result={context:{slot:++context},value:[account(program,LOADER,1000000n,true),account(code,LOADER,10000000n),rows[0]]};}
   else{assert.deepEqual(q.params[0],selection.addresses);nativeReads++;clock.writeBigUInt64LE(BigInt(++context));clock.writeBigInt64LE(86400n+BigInt(nativeReads),32);rows[6].data[0]=clock.toString('base64');result={context:{slot:context},value:rows};}
  }else if(q.method==='getFeeForMessage'){assert.equal(q.params[0],selection.review.unsignedMessageBase64);result={context:{slot:++context},value:20000};}
  else if(q.method==='getBlockHeight')result=height;
  else if(q.method==='isBlockhashValid'){assert.equal(q.params[0],intent.recentBlockhash);result={context:{slot:++context},value:true};}
  else throw Error('Unexpected mutating request');
  const wire={jsonrpc:'2.0',id:1,result};mutation(q,wire,nativeReads);return stringify(wire);
 };
 const fetcher=async(url,init)=>new Response(reply(JSON.parse(init.body)),{headers:{'Content-Type':'application/json'}});
 return {intent,pins,rows,code,program,clock,rent,vault,calls,raw,input,reply,fetcher,expectedReviewSHA256,mutate:fn=>mutation=fn,height:v=>height=v,options:{rpc:'http://127.0.0.1:21899',intent,expectedReviewSHA256,minimumContextSlot:50}};
}
