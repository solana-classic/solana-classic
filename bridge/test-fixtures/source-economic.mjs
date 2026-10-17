// Signed synthetic RPC fixtures. Disposable signing keys stay only in this closure.
import {createRequire} from 'node:module';
import {Keypair,PublicKey,Transaction,TransactionInstruction,Message,SystemProgram} from '@solana/web3.js';
import {collectionFixture} from './event-collection.mjs';
import {encodeEvent} from '../sdk.mjs';
const require=createRequire(import.meta.url),bs58=createRequire(require.resolve('@solana/web3.js'))('bs58');
const TOKEN='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',SYSTEM=SystemProgram.programId.toBase58();
const pda=(seeds,p)=>PublicKey.findProgramAddressSync(seeds,new PublicKey(p))[0].toBase58();
const wire=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?'__native_'+x:x).replace(/"__native_([0-9]+)"/g,'$1');
const messageJSON=m=>({header:{...m.header},accountKeys:m.accountKeys.map(k=>k.toBase58()),recentBlockhash:m.recentBlockhash,instructions:m.instructions.map(i=>({...i,accounts:[...i.accounts]}))});
export function sourceEconomicFixture(side=0,samePayer=false){
 const base=collectionFixture(),s=base.sides[side],sender=Keypair.generate(),payer=samePayer?sender:Keypair.generate(),recipient=Keypair.generate().publicKey,sourceToken=Keypair.generate().publicKey.toBase58();
 const pub=sender.publicKey.toBase58(),nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(11n);const amount=10000n,rent=2958000n,fee=samePayer?5000n:10000n,native=10000000n;
 const address=pda([Buffer.from('event'),new PublicKey(s.configAddress).toBuffer(),sender.publicKey.toBuffer(),nonce],s.pins.program);
 const event={bridge:s.pins.bridge,sourceChain:s.pins.genesis,destinationChain:s.pins.remoteGenesis,sourceProgram:s.pins.program,destinationProgram:s.pins.remoteProgram,sourceEvent:address,sender:pub,recipient:recipient.toBase58(),originAmount:amount,nonce:11n,slot:50n,epoch:1n,direction:side};
 const escrow=pda([Buffer.from('escrow'),new PublicKey(s.configAddress).toBuffer()],s.pins.program);
 const accounts=[pub,s.configAddress,s.vaultAddress,address,SYSTEM,...(side===0?[sourceToken,escrow,s.pins.originMint,TOKEN]:[])];
 const data=Buffer.alloc(49);data[0]=1;data.writeBigUInt64LE(amount,1);data.writeBigUInt64LE(11n,9);recipient.toBuffer().copy(data,17);
 const ix=new TransactionInstruction({programId:new PublicKey(s.pins.program),keys:accounts.map((k,i)=>({pubkey:new PublicKey(k),isSigner:i===0,isWritable:[0,1,2,3,5,6].includes(i)})),data});
 const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(ix);tx.sign(...(samePayer?[sender]:[payer,sender]));
 const message=tx.compileMessage(),keys=message.accountKeys.map(k=>k.toBase58()),index=k=>keys.indexOf(k),pre=keys.map(()=>9007199254740993n),post=[...pre];pre[index(address)]=0n;post[index(address)]=rent;post[index(pub)]-=rent+(side===1?native:0n);post[0]-=fee;if(side===1)post[index(s.vaultAddress)]+=native;
 const funding=Buffer.alloc(12);funding.writeUInt32LE(2);funding.writeBigUInt64LE(rent,4);
 const allocate=Buffer.alloc(12);allocate.writeUInt32LE(8);allocate.writeBigUInt64LE(297n,4);
 const assign=Buffer.alloc(36);assign.writeUInt32LE(1);new PublicKey(s.pins.program).toBuffer().copy(assign,4);
 const transfer=Buffer.alloc(side===0?10:12);if(side===0){transfer[0]=12;transfer.writeBigUInt64LE(amount,1);transfer[9]=6;}else{transfer.writeUInt32LE(2);transfer.writeBigUInt64LE(native,4);}
 const inner=[{programIdIndex:index(SYSTEM),accounts:[index(pub),index(address)],data:bs58.encode(funding),stackHeight:2},{programIdIndex:index(SYSTEM),accounts:[index(address)],data:bs58.encode(allocate),stackHeight:2},{programIdIndex:index(SYSTEM),accounts:[index(address)],data:bs58.encode(assign),stackHeight:2},{programIdIndex:index(side===0?TOKEN:SYSTEM),accounts:(side===0?[sourceToken,s.pins.originMint,escrow,pub]:[pub,s.vaultAddress]).map(index),data:bs58.encode(transfer),stackHeight:2}];
 const token=(a,owner,n)=>({accountIndex:index(a),mint:s.pins.originMint,owner,programId:TOKEN,uiTokenAmount:{amount:String(n),decimals:6,uiAmount:null,uiAmountString:'display ignored'}});
 const payload={jsonrpc:'2.0',id:1,result:{slot:50,blockTime:1,version:'legacy',transaction:{message:messageJSON(message),signatures:tx.signatures.map(r=>bs58.encode(r.signature))},meta:{err:null,fee,preBalances:pre,postBalances:post,innerInstructions:[{index:0,instructions:inner}],preTokenBalances:side===0?[token(sourceToken,pub,1000000n),token(escrow,s.vaultAddress,0n)]:[],postTokenBalances:side===0?[token(sourceToken,pub,990000n),token(escrow,s.vaultAddress,10000n)]:[],logMessages:['Program '+s.pins.program+' invoke [1]','Program log: SC_BRIDGE_EVENT '+address+' 10000','Program '+s.pins.program+' success'],loadedAddresses:{readonly:[],writable:[]},status:{Ok:null},rewards:[],returnData:null,computeUnitsConsumed:1000,costUnits:2000}}};
 const snapshot={genesis:s.pins.genesis,program:s.pins.program,commitment:'finalized',contextSlot:100,accounts:[...s.accounts.slice(0,2),{address,owner:s.pins.program,executable:false,lamports:rent.toString(),dataBase64:encodeEvent(event).toString('base64')}]};
 const options=()=>({raw:wire(payload),pins:s.pins,snapshot,signature:payload.result.transaction.signatures[0],sourceEvent:address});
 const resign=()=>{const m=new Message(payload.result.transaction.message),t=Transaction.populate(m,payload.result.transaction.signatures);t.sign(...(samePayer?[sender]:[payer,sender]));payload.result.transaction.message=messageJSON(t.compileMessage());payload.result.transaction.signatures=t.signatures.map(r=>bs58.encode(r.signature));};
 return {payload,options,snapshot,event,keys,index,accounts,resign,codeFixture:s,peerFixture:base.sides[1-side],decode:data=>Buffer.from(bs58.decode(data)),encode:data=>bs58.encode(data)};
}
