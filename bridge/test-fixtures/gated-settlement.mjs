// Synthetic signed claim and RPC rows only; no retained inputs or network.
import {createRequire} from 'node:module';
import {Transaction,SystemProgram,PublicKey} from '@solana/web3.js';
import {destinationFixture} from './gated-destination.mjs';
import {gatedNativeClaimInstruction} from '../gated-native.mjs';
import {fixture} from './gated-review.mjs';
import {describeGatedNativeMessage} from '../gated-message-review.mjs';
const b58=createRequire(import.meta.resolve('@solana/web3.js'))('bs58'),encode=b=>b58.encode?b58.encode(b):b58.default.encode(b);
export const stringify=v=>JSON.stringify(v,(_,v)=>typeof v==='bigint'?JSON.rawJSON(v.toString()):v);
export function settlementFixture(){
 const base=destinationFixture();
 // Use matching freshly generated signers/configuration from a single fixture.
 const coherent=fixture();const tx=new Transaction({feePayer:new PublicKey(coherent.intent.payer),recentBlockhash:coherent.intent.recentBlockhash}).add(gatedNativeClaimInstruction(coherent.intent.parameters).instruction);tx.sign(...coherent.signers);
 // Build account rows around those exact signed inputs.
 const intent=coherent.intent,p=intent.parameters;const rows=structuredClone(base.rows);rows[0].data[0]=Buffer.from(p.context.configurationBytes).toString('base64');rows[2].data[0]=Buffer.from(p.bootstrap.recordBytes).toString('base64');rows[3].data[0]=new PublicKey(p.bootstrap.expectedSourceEvent).toBuffer().toString('base64');rows[7].lamports=9007199254740993n;
 const message=tx.compileMessage(),keys=message.accountKeys.map(k=>k.toBase58()),ix=gatedNativeClaimInstruction(p).instruction,addresses=[ix.keys[1],ix.keys[2],ix.keys[10],ix.keys[11],ix.keys[3]].map(k=>k.pubkey.toBase58());addresses.push('SysvarRent111111111111111111111111111111111','SysvarC1ock11111111111111111111111111111111',intent.payer,p.recipient);
 const post=structuredClone(rows),cfg=Buffer.from(post[0].data[0],'base64');cfg.writeBigUInt64LE(152000n,374);cfg.writeBigUInt64LE(1n,358);cfg.writeBigUInt64LE(50000n,366);post[0].data[0]=cfg.toString('base64');post[1].lamports-=50000000n;post[7].lamports-=1133600n;post[8].lamports+=50000000n;post[4]={owner:p.context.pins.program,executable:false,lamports:1113600n,data:[new PublicKey(p.event.sourceEvent).toBuffer().toString('base64'),'base64']};const clock=Buffer.from(post[6].data[0],'base64');clock.writeBigUInt64LE(130n);clock.writeBigInt64LE(86401n,32);post[6].data[0]=clock.toString('base64');
 const before={jsonrpc:'2.0',id:1,result:{context:{slot:100},value:rows}},after={jsonrpc:'2.0',id:1,result:{context:{slot:130},value:post}},status={jsonrpc:'2.0',id:1,result:{context:{slot:140},value:[{slot:120,confirmations:null,confirmationStatus:'finalized',err:null,status:{Ok:null}}]}};
 const preBalances=keys.map(k=>{const i=addresses.indexOf(k);return i>=0?rows[i]?.lamports??0n:10n;}),postBalances=keys.map((k,i)=>{const n=addresses.indexOf(k);return n>=0?post[n].lamports:preBalances[i];});
 const inner=[SystemProgram.transfer({fromPubkey:new PublicKey(intent.payer),toPubkey:ix.keys[3].pubkey,lamports:1113600}),SystemProgram.allocate({accountPubkey:ix.keys[3].pubkey,space:32}),SystemProgram.assign({accountPubkey:ix.keys[3].pubkey,programId:ix.programId})].map(i=>({programIdIndex:keys.indexOf(i.programId.toBase58()),accounts:i.keys.map(k=>keys.indexOf(k.pubkey.toBase58())),data:encode(i.data),stackHeight:2}));
 const raw=tx.serialize(),landed={jsonrpc:'2.0',id:1,result:{slot:120,version:'legacy',blockTime:86400,transaction:[raw.toString('base64'),'base64'],meta:{err:null,status:{Ok:null},fee:20000,preBalances,postBalances,innerInstructions:[{index:0,instructions:inner}],preTokenBalances:[],postTokenBalances:[],loadedAddresses:{readonly:[],writable:[]},rewards:[],logMessages:['Program '+ix.programId+' invoke [1]','Program log: SC_BRIDGE_CLAIM '+ix.keys[3].pubkey+' 50000','Program '+ix.programId+' success']}}};
 const expectedReviewSHA256=describeGatedNativeMessage(intent).reviewSHA256,input=()=>({intent,expectedReviewSHA256,transactionBytes:raw,minimumContextSlot:50,feeNativeUnits:20000n,rawBeforeAccounts:stringify(before),rawStatus:stringify(status),rawTransaction:stringify(landed),rawAfterAccounts:stringify(after)});
 const calls=[];let edit=()=>{},statusReads=0,genesisReads=0;
 const reply=q=>{calls.push(q);let w;if(q.method==='getGenesisHash'){genesisReads++;w={jsonrpc:'2.0',id:1,result:intent.parameters.context.pins.genesis};}else if(q.method==='getSignatureStatuses'){statusReads++;w=structuredClone(status);}else if(q.method==='getTransaction')w=structuredClone(landed);else if(q.method==='getMultipleAccounts')w=structuredClone(after);else throw Error('Unexpected mutation request');edit(q,w,{statusReads,genesisReads});return stringify(w);};
 return {intent,signers:coherent.signers,raw,keys,addresses,rows,post,before,after,status,landed,input,calls,reply,mutate:fn=>edit=fn,fetcher:async(url,init)=>new Response(reply(JSON.parse(init.body)),{headers:{'Content-Type':'application/json'}}),options:()=>({rpc:'http://127.0.0.1:29991',...Object.fromEntries(Object.entries(input()).filter(([k])=>!['rawStatus','rawTransaction','rawAfterAccounts'].includes(k)))})};
}
