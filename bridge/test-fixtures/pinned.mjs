// Disposable in-process private-claim code-pin fixtures. No chain calls.
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {Keypair,PublicKey} from '@solana/web3.js';
import {fixture} from './pending.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const hash=b=>createHash('sha256').update(b).digest('hex');
const account=(b,owner,executable=false)=>({owner,executable,data:[b.toString('base64'),'base64']});
export async function pinnedFixture(t,direction=0){
  const f=fixture(t,direction),extra=[Keypair.generate().publicKey,Keypair.generate().publicKey];
  const old=await f.fetcher(f.args.rpc,{body:JSON.stringify({method:'getAccountInfo',params:[f.ix.keys[1].pubkey.toBase58()]})});
  const mint=new PublicKey(Buffer.from(JSON.parse(await old.text()).result.value.data[0],'base64').subarray(136,168)).toBase58();
  const sides={};
  for(const source of [true,false]){
    const program=source?f.e.sourceProgram:f.e.destinationProgram,remoteProgram=source?f.e.destinationProgram:f.e.sourceProgram;
    const pins={genesis:source?f.e.sourceChain:f.e.destinationChain,remoteGenesis:source?f.e.destinationChain:f.e.sourceChain,program,remoteProgram,bridge:f.e.bridge,originMint:mint,side:source?direction:1-direction,upgradeAuthority:Keypair.generate().publicKey.toBase58()};
    const pd=PublicKey.findProgramAddressSync([new PublicKey(program).toBuffer()],new PublicKey(LOADER))[0];
    const executable=Buffer.alloc(36);executable.writeUInt32LE(2);pd.toBuffer().copy(executable,4);
    const elf=Buffer.from('7f454c4601020304','hex'),data=Buffer.alloc(45+elf.length+16);data.writeUInt32LE(3);data.writeBigUInt64LE(10n,4);data[12]=1;new PublicKey(pins.upgradeAuthority).toBuffer().copy(data,13);elf.copy(data,45);
    pins.elfBytes=elf.length;pins.elfSHA256=hash(elf);pins.programDataSHA256=hash(data);
    const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,mint]])new PublicKey(v).toBuffer().copy(config,o);
    [...f.committee.map(k=>k.publicKey),...extra].forEach((k,i)=>k.toBuffer().copy(config,168+i*32));
    config[328]=6;config[329]=9;config[330]=pins.side;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);pins.policySHA256=hash(config.subarray(0,358));
    sides[source?'source':'destination']={pins,executable,data,config,reads:0};
  }
  const calls=[];let heightReads=0,receiptReads=0,mode='normal',checkpoint=50;
  const fetcher=async(url,options)=>{
    const q=JSON.parse(options.body);calls.push(q);const source=new URL(url).port==='8899',side=sides[source?'source':'destination'];
    if(mode==='outage')throw Error('Synthetic unavailable RPC');
    let result;
    if(q.method==='getMultipleAccounts'&&q.params[0][0]===side.pins.program){
      side.reads++;const data=Buffer.from(side.data),config=Buffer.from(side.config);
      if(side.reads>=3){if(mode==='lateCode')data[45]^=1;if(mode==='lateAuthority')data[13]^=1;if(mode==='latePolicy')config[342]^=1;}
      result={context:{slot:mode==='stale'?0:checkpoint},value:[account(side.executable,LOADER,true),account(data,LOADER),account(config,side.pins.program)]};
    }else if(q.method==='getAccountInfo'&&!source&&q.params[0]===f.ix.keys[1].pubkey.toBase58())result={context:{slot:checkpoint},value:account(side.config,side.pins.program)};
    else if(q.method==='getBlockHeight'){heightReads++;result=mode==='lateExpiry'&&heightReads===2?101:mode==='lateHeightRegression'&&heightReads===2?49:50;}
    else {
      const r=await f.fetcher(url,options);result=JSON.parse(await r.text()).result;
      if(q.method==='getGenesisHash'&&mode==='wrongGenesis')result=Keypair.generate().publicKey.toBase58();
      if(q.method==='getAccountInfo'&&!source&&q.params[0]===f.ix.keys[3].pubkey.toBase58()&&++receiptReads===2&&mode==='lateReceipt')result.value=account(new PublicKey(f.e.sourceEvent).toBuffer(),f.e.destinationProgram);
      if(result?.context)result.context.slot=Math.max(result.context.slot,checkpoint,q.params?.[1]?.minContextSlot??0);
    }
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
  };
  return {...f,args:{...f.args,programmePins:{source:sides.source.pins,destination:sides.destination.pins}},fetcher,calls,sides,set:v=>{mode=v;},checkpoint:v=>{checkpoint=v;},path:id=>join(f.directory,id+'.json')};
}
