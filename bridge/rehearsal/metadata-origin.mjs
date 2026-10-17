// Fresh synthetic origin only. Never opens an existing settlement journal.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const bs58=createRequire(import.meta.resolve('@solana/web3.js'))('bs58');
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID as TOKEN,ExtensionType,getMintLen,TYPE_SIZE,LENGTH_SIZE,createInitializeMetadataPointerInstruction,createInitializeMintInstruction,createInitializeAccount3Instruction,createMintToInstruction,createSetAuthorityInstruction,AuthorityType} from '@solana/spl-token';
import {pack,createInitializeInstruction,createUpdateAuthorityInstruction} from '@solana/spl-token-metadata';
import {inspectImmutableMint} from './mint-metadata.mjs';
import {observeTokenPinnedOriginAssets,genesisTokenCodePins} from './origin-token-code.mjs';
import {PUBLIC_GENESIS} from './sdk.mjs';
const root='/data/bridge-metadata-observer-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const input=JSON.parse(fs.readFileSync(root+'/private-input.json'));
assert.equal(input.scope,'fresh-private-metadata-origin');assert.equal(input.port,24899);
assert(!PUBLIC_GENESIS.has(input.genesis)&&input.genesis!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon');
const key=name=>Keypair.fromSecretKey(Uint8Array.from(input.keys[name]));
const payer=key('payer'),mint=key('mint'),holder=key('holder'),members=Array.from({length:5},(_,i)=>key('member'+i));
const program=new PublicKey(input.program),bridge=new PublicKey(input.bridge),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const connection=new Connection('http://127.0.0.1:24899','finalized');
const proof={schemaVersion:1,state:'running',scope:'Fresh private source-built Agave origin with actual valueless metadata mint, bridge initialization and one source lock; no native settlement',startedAt:new Date().toISOString(),genesis:input.genesis,checks:[],signatures:[],settlementBroadcasts:0,productionReady:false,canonicalNetworkChanged:false,independentVerification:false};
assert(!fs.existsSync(root+'/public-result.json'));
const save=()=>fs.writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
const pass=name=>{proof.checks.push(name);save();};
async function admit(){assert.equal(await connection.getGenesisHash(),input.genesis);}
async function send(label,instructions,signers=[]){
 await admit();assert(proof.signatures.length<4);assert(!proof.signatures.some(v=>v.label===label));
 const latest=await connection.getLatestBlockhash('finalized'),tx=new Transaction({feePayer:payer.publicKey,...latest}).add(...instructions);
 tx.sign(...[...new Map([payer,...signers].map(k=>[k.publicKey.toBase58(),k])).values()]);
 const raw=tx.serialize();assert(raw.length<=1232);const sim=await connection.simulateTransaction(tx);assert.equal(sim.value.err,null,JSON.stringify(sim.value.logs));await admit();
 const signature=(bs58.default??bs58).encode(tx.signature);
 // Persist the exact signed transaction before its sole submission attempt.
 const fd=fs.openSync(root+'/transaction-'+proof.signatures.length+'-private.json','wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({label,signature,rawBase64:raw.toString('base64'),...latest}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 proof.signatures.push({label,signature,state:'submission-attempted'});save();
 const actual=await connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:0});assert.equal(actual,signature);
 const confirmed=await connection.confirmTransaction({...latest,signature},'finalized');assert.equal(confirmed.value.err,null);proof.signatures.at(-1).state='finalized';save();
}
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],program)[0];
const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],program)[0];
const escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),config.toBuffer()],program)[0];
const pd=PublicKey.findProgramAddressSync([program.toBuffer()],loader)[0];
const ix=(keys,data)=>new TransactionInstruction({programId:program,keys,data});
try{
 save();await admit();
 const metadata={updateAuthority:payer.publicKey,mint:mint.publicKey,name:'Private fixture',symbol:'TEST',uri:'https://example.invalid/m',additionalMetadata:[]};
 const space=getMintLen([ExtensionType.MetadataPointer]),full=space+TYPE_SIZE+LENGTH_SIZE+pack(metadata).length;
 const mintRent=await connection.getMinimumBalanceForRentExemption(full),accountRent=await connection.getMinimumBalanceForRentExemption(165);
 await send('immutable-metadata-mint',[
  SystemProgram.createAccount({fromPubkey:payer.publicKey,newAccountPubkey:mint.publicKey,space,lamports:mintRent,programId:TOKEN}),
  createInitializeMetadataPointerInstruction(mint.publicKey,null,mint.publicKey,TOKEN),
  createInitializeMintInstruction(mint.publicKey,6,payer.publicKey,null,TOKEN),
  createInitializeInstruction({programId:TOKEN,metadata:mint.publicKey,updateAuthority:payer.publicKey,mint:mint.publicKey,mintAuthority:payer.publicKey,name:metadata.name,symbol:metadata.symbol,uri:metadata.uri}),
  SystemProgram.createAccount({fromPubkey:payer.publicKey,newAccountPubkey:holder.publicKey,space:165,lamports:accountRent,programId:TOKEN}),
  createInitializeAccount3Instruction(holder.publicKey,mint.publicKey,payer.publicKey,TOKEN),
  createMintToInstruction(mint.publicKey,holder.publicKey,payer.publicKey,2000000n,[],TOKEN),
  createSetAuthorityInstruction(mint.publicKey,payer.publicKey,AuthorityType.MintTokens,null,[],TOKEN),
  createUpdateAuthorityInstruction({programId:TOKEN,metadata:mint.publicKey,oldAuthority:payer.publicKey,newAuthority:null})
 ],[mint,holder]);
 const actualMint=await connection.getAccountInfo(mint.publicKey,'finalized');assert(actualMint.owner.equals(TOKEN));assert.equal(actualMint.executable,false);
 const decoded=inspectImmutableMint(actualMint.data,mint.publicKey.toBase58());assert.equal(decoded.layout,'immutable-self-metadata-v1');assert.equal(decoded.supplyUnits,'2000000');assert.equal(decoded.metadata.name,metadata.name);
 proof.mint={address:mint.publicKey.toBase58(),bytes:actualMint.data.length,dataSHA256:hash(actualMint.data),layout:decoded.layout};pass('Actual Token-2022 metadata mint finalized with exact supply and revoked authorities');
 const policy=Buffer.concat([Buffer.from('SCCFG001'),bridge.toBuffer(),new PublicKey(input.genesis).toBuffer(),new PublicKey(input.remoteGenesis).toBuffer(),new PublicKey(input.remoteProgram).toBuffer(),mint.publicKey.toBuffer(),...members.map(k=>k.publicKey.toBuffer()),Buffer.from([6,9,0,3]),u64(1n),Buffer.from([1,1]),u64(2000000n),u64(4000000n),u64(0n),u64(0n),u64(0n)]);assert.equal(policy.length,382);
 await send('initialize-origin', [ix([meta(payer.publicKey,true,true),meta(config,true),meta(vault,true),meta(escrow,true),meta(mint.publicKey),meta(TOKEN),meta(SystemProgram.programId),meta(program),meta(pd)],Buffer.concat([Buffer.from([0]),policy]))]);
 // Enable source locks only. All settlement remains paused on this fresh fixture.
 await send('enable-source-locks',[ix([meta(config,true),...members.slice(0,3).map(k=>meta(k.publicKey,false,true))],Buffer.from([3,0,1]))],members.slice(0,3));policy[340]=0;
 const event=PublicKey.findProgramAddressSync([Buffer.from('event'),config.toBuffer(),payer.publicKey.toBuffer(),u64(1n)],program)[0];
 await send('one-source-lock',[ix([meta(payer.publicKey,true,true),meta(config,true),meta(vault,true),meta(event,true),meta(SystemProgram.programId),meta(holder.publicKey,true),meta(escrow,true),meta(mint.publicKey),meta(TOKEN)],Buffer.concat([Buffer.from([1]),u64(100000n),u64(1n),new PublicKey(input.recipient).toBuffer()]))]);
 pass('Compiled bridge initialized metadata mint and finalized one source lock with settlement still paused');
 const elf=fs.readFileSync(root+'/bridge.so'),header=Buffer.alloc(45);header.writeUInt32LE(3);header[12]=1;payer.publicKey.toBuffer().copy(header,13);
 const pins={genesis:input.genesis,remoteGenesis:input.remoteGenesis,program:program.toBase58(),remoteProgram:input.remoteProgram,bridge:bridge.toBase58(),originMint:mint.publicKey.toBase58(),side:0,upgradeAuthority:payer.publicKey.toBase58(),elfBytes:elf.length,elfSHA256:hash(elf),programDataSHA256:hash(Buffer.concat([header,elf])),policySHA256:hash(policy.subarray(0,358))};
 const tokenPins=genesisTokenCodePins({genesis:input.genesis,artifact:fs.readFileSync(root+'/token2022.so'),upgradeAuthority:'11111111111111111111111111111111',expectedSHA256:'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68',expectedBytes:506896});
 let calls=0;const fetcher=(url,options)=>{const q=JSON.parse(options.body);assert(['getGenesisHash','getMultipleAccounts'].includes(q.method));calls++;return fetch(url,options);};
 const options={rpc:connection.rpcEndpoint,pins,tokenPins,expectedSupplyUnits:'2000000',expectedDecimals:6,minimumContextSlot:await connection.getSlot('finalized'),mintPolicy:'immutable-self-metadata-v1'};
 const first=await observeTokenPinnedOriginAssets(options,fetcher);assert.equal(first.originEscrowUnits,'100000');assert.equal(first.originOutstandingUnits,'100000');assert.equal(first.unallocatedEscrowSurplusUnits,'0');assert.equal(first.mintMetadata.name,metadata.name);assert.equal(first.tokenCodeVerified,true);assert.equal(first.mintLayout,'immutable-self-metadata-v1');assert.equal(first.productionReady,false);pass('Actual metadata mint and exact escrow/counter reconcile under complete bridge and token code pins');
 await assert.rejects(observeTokenPinnedOriginAssets({...options,mintPolicy:'plain'},fetcher),/layout/);pass('Default plain-mint policy refuses actual extended mint');
 await assert.rejects(observeTokenPinnedOriginAssets({...options,expectedSupplyUnits:'1999999'},fetcher),/mint supply/);
 await assert.rejects(observeTokenPinnedOriginAssets({...options,expectedDecimals:7},fetcher),/policy/);pass('Wrong selected supply and precision refuse actual finalized state');
 await assert.rejects(observeTokenPinnedOriginAssets({...options,tokenPins:{...tokenPins,programDataSHA256:'0'.repeat(64)}},fetcher),/selected pin/);pass('Wrong complete Token-2022 code pin refuses actual state');
 const last=await observeTokenPinnedOriginAssets({...options,minimumContextSlot:first.finalTokenContextSlot},fetcher);assert.equal(last.assetDataSHA256,first.assetDataSHA256);assert(last.finalTokenContextSlot>=first.finalTokenContextSlot);assert.equal(last.canSign,false);assert.equal(last.canBroadcast,false);
 proof.observation=last;proof.observerRpcReads=calls;assert.equal(proof.signatures.length,4);assert(proof.signatures.every(s=>s.state==='finalized'));proof.state='passed';proof.completedAt=new Date().toISOString();pass('Fresh observation after rejected inputs retains exact assets; observer uses read-only RPC only');
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
