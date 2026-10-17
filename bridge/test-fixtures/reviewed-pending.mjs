// In-process synthetic metadata fixtures. No RPC endpoint is contacted.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {pinnedFixture} from './pinned.mjs';
import {TOKEN_2022} from '../sdk.mjs';
import {genesisTokenCodePins} from '../origin-token-code.mjs';
import {reviewedOriginMintPolicy} from '../reviewed-origin-mint.mjs';
const require=createRequire(new URL('../../packages/chain/package.json',import.meta.url)),{pack}=require('@solana/spl-token-metadata');
const hash=b=>createHash('sha256').update(b).digest('hex'),loader='BPFLoaderUpgradeab1e11111111111111111111111';
export async function reviewedFixture(t,direction=0){
 const f=await pinnedFixture(t,direction),origin=direction===0?f.sides.source:f.sides.destination;
 const mintKey=new PublicKey(origin.pins.originMint),configKey=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(f.e.bridge).toBuffer()],new PublicKey(origin.pins.program))[0],vaultKey=PublicKey.findProgramAddressSync([Buffer.from('vault'),configKey.toBuffer()],new PublicKey(origin.pins.program))[0];
 const base=Buffer.alloc(82);base.writeBigUInt64LE(3000000n,36);base[44]=6;base[45]=1;
 const tlv=(type,bytes)=>{const b=Buffer.alloc(4);b.writeUInt16LE(type);b.writeUInt16LE(bytes.length,2);return Buffer.concat([b,bytes]);};
 const payload=Buffer.from(pack({mint:mintKey,name:'Claim fixture',symbol:'TEST',uri:'https://example.invalid/m',additionalMetadata:[]}));
 const mint=Buffer.concat([base,Buffer.alloc(83),Buffer.from([1]),tlv(18,Buffer.concat([Buffer.alloc(32),mintKey.toBuffer()])),tlv(19,payload)]);
 const escrow=Buffer.alloc(165);mintKey.toBuffer().copy(escrow);vaultKey.toBuffer().copy(escrow,32);escrow.writeBigUInt64LE(2000000n,64);escrow[108]=1;
 const vault=Buffer.alloc(16);vault.write('SCVLT002');origin.config.writeBigUInt64LE(2000000n,374);
 const elf=Buffer.from('7f454c4601020304','hex'),tokenProgram=Buffer.alloc(36),tokenData=Buffer.alloc(45+elf.length);tokenProgram.writeUInt32LE(2);PublicKey.findProgramAddressSync([new PublicKey(TOKEN_2022).toBuffer()],new PublicKey(loader))[0].toBuffer().copy(tokenProgram,4);tokenData.writeUInt32LE(3);elf.copy(tokenData,45);
 const tokenPins=genesisTokenCodePins({genesis:origin.pins.genesis,artifact:elf,upgradeAuthority:null,expectedSHA256:hash(elf),expectedBytes:elf.length});
 const reviewed=()=>reviewedOriginMintPolicy({pins:origin.pins,tokenPins,expectedSupplyUnits:'3000000',expectedDecimals:6,expectedMintDataSHA256:hash(mint)});
 const account=(b,owner,executable=false)=>({owner,executable,data:[b.toString('base64'),'base64']});
 let mode='normal',assetReads=0,tokenReads=0;const calls=[];
 const fetcher=async(url,options)=>{
  const q=JSON.parse(options.body);calls.push(q);const isOrigin=(new URL(url).port==='8899')===(direction===0);let result;
  if(isOrigin&&q.method==='getMultipleAccounts'&&q.params[0][0]===TOKEN_2022){tokenReads++;const data=Buffer.from(tokenData);if(mode==='lateTokenCode'&&tokenReads>=5)data[45]^=1;result={context:{slot:Math.max(50,q.params[1].minContextSlot??0)},value:[account(tokenProgram,loader,true),account(data,loader)]};}
  else if(isOrigin&&q.method==='getMultipleAccounts'&&q.params[0][0]===configKey.toBase58()){
   assetReads++;const actual=Buffer.from(mint),tokens=Buffer.from(escrow);if(mode==='changedMint'||mode==='lateMint'&&assetReads>=3)actual[306]^=1;if(mode==='depleted')tokens.writeBigUInt64LE(1999999n,64);
   result={context:{slot:Math.max(50,q.params[1].minContextSlot??0)},value:[account(origin.config,origin.pins.program),account(actual,TOKEN_2022),account(tokens,TOKEN_2022),account(vault,origin.pins.program)]};
  }else{
   const w=await(await f.fetcher(url,options)).json();result=w.result;
   if(isOrigin&&q.method==='getMultipleAccounts'&&q.params[0][0]===mintKey.toBase58()){
    result.value[0]=account(mint,TOKEN_2022);result.value[1]=account(escrow,TOKEN_2022);
    if(mode==='badRecipient')result.value[2].data[0]=Buffer.alloc(165).toString('base64');
   }
  }
  return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
 };
 return {...f,args:{...f.args,reviewedMintPolicy:reviewed()},origin,mint,escrow,tokenData,tokenPins,reviewed,fetcher,reviewMode:v=>{mode=v;},reviewCalls:calls,counts:()=>({assetReads,tokenReads})};
}
