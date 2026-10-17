// Synthetic two-chain fixtures. No network, files or secret keys are retained.
import {createHash} from 'node:crypto';
import {Keypair,PublicKey} from '@solana/web3.js';
import {encodeEvent} from '../sdk.mjs';
const key=()=>Keypair.generate().publicKey.toBase58(),sha=b=>createHash('sha256').update(b).digest('hex');
const pda=(seeds,program)=>PublicKey.findProgramAddressSync(seeds,new PublicKey(program))[0].toBase58();
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
export const wire=value=>JSON.stringify(value).replace(/"lamports":"([0-9]+)"/g,'"lamports":$1');
export function collectionFixture(){
 const chains=[key(),key()],programs=[key(),key()],bridge=key(),mint=key(),committee=Array.from({length:5},key),sides=[];
 const row=(side,address,bytes,lamports='1000')=>({address,owner:programs[side],executable:false,lamports,dataBase64:bytes.toString('base64')});
 for(let side=0;side<2;side++){
  const config=Buffer.alloc(382);config.write('SCCFG001');
  for(const [offset,value] of [[8,bridge],[40,chains[side]],[72,chains[1-side]],[104,programs[1-side]],[136,mint]])new PublicKey(value).toBuffer().copy(config,offset);
  committee.forEach((member,i)=>new PublicKey(member).toBuffer().copy(config,168+i*32));
  config[328]=6;config[329]=9;config[330]=side;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);config.writeBigUInt64LE(side===0?1500n:600n,374);
  const configAddress=pda([Buffer.from('config'),new PublicKey(bridge).toBuffer()],programs[side]);
  const vaultAddress=pda([Buffer.from('vault'),new PublicKey(configAddress).toBuffer()],programs[side]);
  const vault=Buffer.alloc(16);vault.write('SCVLT002');vault.writeBigUInt64LE(1000n,8);
  const authority=key(),programData=pda([new PublicKey(programs[side]).toBuffer()],loader),pointer=Buffer.alloc(36);pointer.writeUInt32LE(2);new PublicKey(programData).toBuffer().copy(pointer,4);
  const elf=Buffer.from('7f454c4601020304','hex'),data=Buffer.alloc(45+elf.length+16);data.writeUInt32LE(3);data.writeBigUInt64LE(10n,4);data[12]=1;new PublicKey(authority).toBuffer().copy(data,13);elf.copy(data,45);
  const pins={genesis:chains[side],remoteGenesis:chains[1-side],program:programs[side],remoteProgram:programs[1-side],bridge,originMint:mint,side,upgradeAuthority:authority,elfBytes:elf.length,elfSHA256:sha(elf),programDataSHA256:sha(data),policySHA256:sha(config.subarray(0,358))};
  sides.push({pins,config,configAddress,vaultAddress,pointer,data,programData,accounts:[row(side,configAddress,config),row(side,vaultAddress,vault,'9007199254740993')],context:100});
 }
 let nonce=0n;
 const event=(side,amount,consumed)=>{
  const sender=key(),recipient=key(),number=++nonce,n=Buffer.alloc(8);n.writeBigUInt64LE(number);
  const address=pda([Buffer.from('event'),new PublicKey(sides[side].configAddress).toBuffer(),new PublicKey(sender).toBuffer(),n],programs[side]);
  const e={bridge,sourceChain:chains[side],destinationChain:chains[1-side],sourceProgram:programs[side],destinationProgram:programs[1-side],sourceEvent:address,sender,recipient,originAmount:amount,nonce:number,slot:50n,epoch:1n,direction:side};
  sides[side].accounts.push(row(side,address,encodeEvent(e)));
  if(consumed){const d=1-side,receipt=pda([Buffer.from('claim'),new PublicKey(sides[d].configAddress).toBuffer(),new PublicKey(address).toBuffer()],programs[d]);sides[d].accounts.push(row(d,receipt,new PublicKey(address).toBuffer()));}
  return address;
 };
 event(0,1000n,true);const pendingLock=event(0,500n,false);event(1,400n,false);
 const calls=[];
 const options=side=>({rpc:`http://127.0.0.1:${21899+side}`,pins:sides[side].pins,minimumContextSlot:90});
 const account=(bytes,owner,executable=false)=>({owner,executable,lamports:'1000',data:[bytes.toString('base64'),'base64']});
 const reply=(side,q)=>{
  const s=sides[side];let result;
  if(q.method==='getGenesisHash')result=s.pins.genesis;
  else if(q.method==='getMultipleAccounts'){
   if(JSON.stringify(q.params[0])!==JSON.stringify([s.pins.program,s.programData,s.configAddress]))throw Error('Unrecognized synthetic account request');
   s.context=Math.max(s.context+1,q.params[1].minContextSlot);
   result={context:{slot:s.context},value:[account(s.pointer,loader,true),account(s.data,loader),account(s.config,s.pins.program)]};
  }else if(q.method==='getProgramAccounts'){
   s.context=Math.max(s.context+1,q.params[1].minContextSlot);
   result={context:{slot:s.context,apiVersion:'fixture'},value:s.accounts.map(a=>({pubkey:a.address,account:{owner:a.owner,executable:a.executable,lamports:a.lamports,data:[a.address===s.configAddress?s.config.toString('base64'):a.dataBase64,'base64']}}))};
  }else throw Error('Unrecognized or mutating synthetic request');
  return {jsonrpc:'2.0',id:1,result};
 };
 const fetcher=async(url,init)=>{
  const side=new URL(url).port==='21899'?0:1,q=JSON.parse(init.body);calls.push({side,q});
  return new Response(wire(reply(side,q)),{headers:{'Content-Type':'application/json'}});
 };
 return {sides,options,fetcher,calls,reply,pendingLock};
}
