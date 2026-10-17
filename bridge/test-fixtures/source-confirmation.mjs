// Synthetic initial capture and reviewed claim inputs; keys remain in this closure.
import fs from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Transaction,Message,Keypair,PublicKey} from '@solana/web3.js';
import {sourceEconomicFixture} from './source-economic.mjs';
import {reviewedOriginMintPolicy} from '../reviewed-origin-mint.mjs';
import {genesisTokenCodePins} from '../origin-token-code.mjs';
import {nativeClaimInstruction,originClaimInstruction,originalTokenAddress} from '../sdk.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function sourceConfirmationFixture(t,side=0){
 const f=sourceEconomicFixture(side),s=f.codeFixture,calls=[];let context=100;
 const parent=fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(),'initial-source-')));fs.chmodSync(parent,0o700);t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const evidence=join(parent,'evidence'),journal=join(parent,'journal');fs.mkdirSync(evidence,{mode:0o700});fs.mkdirSync(journal,{mode:0o700});
 const signed=()=>{const r=JSON.parse(f.options().raw).result;return Transaction.populate(new Message(r.transaction.message),r.transaction.signatures).serialize().toString('base64');};
 const source={rpc:'http://127.0.0.1:21899',pins:s.pins,transactionBase64:signed(),sourceEvent:f.event.sourceEvent,minimumContextSlot:1,evidenceDirectory:evidence};
 const reply=q=>{
  if(q.method==='getTransaction')return f.options().raw;
  if(q.method==='getSignatureStatuses')return JSON.stringify({jsonrpc:'2.0',id:1,result:{context:{slot:++context},value:[{slot:50,confirmationStatus:'finalized',confirmations:null,err:null,status:{Ok:null}}]}});
  const account=(bytes,owner,executable=false,lamports=1000)=>({owner,executable,lamports,data:[bytes.toString('base64'),'base64'],space:bytes.length});
  const result=q.method==='getGenesisHash'?s.pins.genesis:q.method==='getProgramAccounts'?{context:{slot:++context},value:f.snapshot.accounts.map(a=>({pubkey:a.address,account:account(Buffer.from(a.dataBase64,'base64'),a.owner,a.executable,JSON.rawJSON(a.lamports))}))}:{context:{slot:++context},value:[account(s.pointer,'BPFLoaderUpgradeab1e11111111111111111111111',true),account(s.data,'BPFLoaderUpgradeab1e11111111111111111111111'),account(s.config,s.pins.program)]};return JSON.stringify({jsonrpc:'2.0',id:1,result});
 };
 const fetcher=async(url,init)=>{const q=JSON.parse(init.body);calls.push(q);return new Response(reply(q),{headers:{'Content-Type':'application/json'}});};
 const origin=side===0?s:f.peerFixture,destination=side===0?f.peerFixture:s,sourcePins=s.pins,destinationPins=side===0?destination.pins:origin.pins;
 const elf=Buffer.from('7f454c4601020304','hex'),tokenPins=genesisTokenCodePins({genesis:origin.pins.genesis,artifact:elf,upgradeAuthority:null,expectedSHA256:hash(elf),expectedBytes:elf.length});
 const reviewed=reviewedOriginMintPolicy({pins:origin.pins,tokenPins,expectedSupplyUnits:'3000000',expectedDecimals:6,expectedMintDataSHA256:hash(Buffer.from('synthetic-complete-mint-review'))});
 const payer=Keypair.generate(),members=Array.from({length:3},()=>Keypair.generate()).sort((a,b)=>a.publicKey.toBase58().localeCompare(b.publicKey.toBase58())),committee=members.map(m=>m.publicKey),destinationToken=originalTokenAddress(s.pins.originMint,f.event.recipient),expected={...f.event};
 const args={event:f.event,expected,payer:payer.publicKey,committee,mint:s.pins.originMint,destinationToken};
 const ix=side===0?nativeClaimInstruction(args):originClaimInstruction(args),claimTx=new Transaction({feePayer:payer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(ix);claimTx.sign(payer,...members.slice(0,3));
 const claim={directory:journal,sourceRpc:source.rpc,rpc:'http://127.0.0.1:22899',event:f.event,expected,payer:payer.publicKey,committee,transaction:claimTx.serialize(),lastValidBlockHeight:500,originDecimals:6,sourceContextSlot:100,minimumDestinationSlot:1,originMint:s.pins.originMint,destinationToken:side===1?destinationToken:null,programmePins:{source:sourcePins,destination:destinationPins},reviewedMintPolicy:reviewed};
 return {f,s,source,claim,evidence,journal,parent,calls,reply,fetcher};
}
