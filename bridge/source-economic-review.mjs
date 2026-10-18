// Pure selected source-transaction review. Supplied RPC metadata is not proof of inclusion.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Message,PublicKey,Transaction} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {inspectReturnedProgramSnapshot} from './event-inventory.mjs';
import {exactNativeUnits} from './sdk.mjs';
import {parseNativeTransactionRPC} from './lossless-native-rpc.mjs';
const SYSTEM='11111111111111111111111111111111',TOKEN='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',U64=(1n<<64n)-1n;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pda=(seeds,program)=>PublicKey.findProgramAddressSync(seeds,new PublicKey(program))[0].toBase58();
function shape(value,required,optional=[]){assert(value&&typeof value==='object'&&!Array.isArray(value));assert(required.every(k=>Object.hasOwn(value,k)));assert(Object.keys(value).every(k=>required.includes(k)||optional.includes(k)));}
function u64(value){assert.equal(typeof value,'string');assert(value.length<=20&&/^(0|[1-9][0-9]*)$/.test(value));const n=BigInt(value);assert(n<=U64);return n;}
function rawU64(value,source){assert.equal(typeof value,'number');assert.equal(typeof source,'string');return u64(source);}
function integer(value,min,max){assert(Number.isSafeInteger(value)&&value>=min&&value<=max);return value;}
function key(value){assert.equal(typeof value,'string');assert.equal(new PublicKey(value).toBase58(),value);return value;}

export function reviewSelectedSourceTransaction(options){
 shape(options,['raw','pins','snapshot','signature','sourceEvent']);
 const {raw,snapshot,signature,sourceEvent}=options,pins=normalizeProgramPins(options.pins);
 assert(typeof raw==='string'&&Buffer.byteLength(raw)<=65536);assert.equal(typeof signature,'string');assert(signature.length>=64&&signature.length<=88);
 const inspected=inspectReturnedProgramSnapshot(snapshot,pins,1),event=inspected.events.get(sourceEvent);assert(event,'Selected current source event missing');
 const selected=snapshot.accounts.find(a=>a.address===sourceEvent),rent=u64(selected.lamports);assert(rent>0n);
 const decoded=parseNativeTransactionRPC(raw);shape(decoded,['jsonrpc','id','result']);assert.equal(decoded.jsonrpc,'2.0');assert.equal(decoded.id,1);
 const r=decoded.result;if(r===null)throw Error('Selected source transaction unavailable at finalized commitment; history remains unresolved');shape(r,['slot','transaction','meta','version'],['blockTime']);assert.equal(r.version,'legacy');integer(r.slot,1,Number.MAX_SAFE_INTEGER);assert.equal(BigInt(r.slot),event.slot);
 shape(r.transaction,['message','signatures']);const m=r.transaction.message;
 shape(m,['header','accountKeys','recentBlockhash','instructions'],['addressTableLookups']);
 if(m.addressTableLookups!==undefined)assert.deepEqual(m.addressTableLookups,[]);
 assert(Array.isArray(m.accountKeys)&&m.accountKeys.length>=6&&m.accountKeys.length<=32);m.accountKeys.forEach(key);assert.equal(new Set(m.accountKeys).size,m.accountKeys.length);key(m.recentBlockhash);
 shape(m.header,['numRequiredSignatures','numReadonlySignedAccounts','numReadonlyUnsignedAccounts']);
 const signers=integer(m.header.numRequiredSignatures,1,2);integer(m.header.numReadonlySignedAccounts,0,signers-1);integer(m.header.numReadonlyUnsignedAccounts,0,m.accountKeys.length-signers);
 assert(Array.isArray(r.transaction.signatures)&&r.transaction.signatures.length===signers);assert.equal(r.transaction.signatures[0],signature);assert.equal(new Set(r.transaction.signatures).size,signers);
 const inspectInstruction=ix=>{shape(ix,['programIdIndex','accounts','data'],['stackHeight']);integer(ix.programIdIndex,0,m.accountKeys.length-1);assert(Array.isArray(ix.accounts)&&ix.accounts.length<=12);ix.accounts.forEach(i=>integer(i,0,m.accountKeys.length-1));assert(typeof ix.data==='string'&&ix.data.length<=512);if(ix.stackHeight!==undefined&&ix.stackHeight!==null)integer(ix.stackHeight,1,2);return ix;};
 assert(Array.isArray(m.instructions)&&m.instructions.length===1);const instruction=inspectInstruction(m.instructions[0]);if(instruction.stackHeight!==undefined&&instruction.stackHeight!==null)assert.equal(instruction.stackHeight,1);
 const message=new Message({header:m.header,accountKeys:m.accountKeys,recentBlockhash:m.recentBlockhash,instructions:m.instructions});
 const transaction=Transaction.populate(message,r.transaction.signatures);assert(transaction.verifySignatures(),'Source transaction signatures do not verify');const bytes=transaction.serialize();assert(bytes.length<=1232);
 const compiled=message.compiledInstructions[0],data=Buffer.from(compiled.data);assert.equal(m.accountKeys[instruction.programIdIndex],pins.program);assert.equal(data.length,49);assert.equal(data[0],1);assert.equal(data.readBigUInt64LE(1),event.originAmount);assert.equal(data.readBigUInt64LE(9),event.nonce);assert.equal(new PublicKey(data.subarray(17)).toBase58(),event.recipient);
 const config=pda([Buffer.from('config'),new PublicKey(pins.bridge).toBuffer()],pins.program),vault=pda([Buffer.from('vault'),new PublicKey(config).toBuffer()],pins.program);
 const accounts=instruction.accounts.map(i=>m.accountKeys[i]);assert.equal(new Set(accounts).size,accounts.length);
 const expected=[event.sender,config,vault,sourceEvent,SYSTEM];let escrow=null,sourceToken=null;
 if(pins.side===0){assert.equal(accounts.length,9);sourceToken=accounts[5];escrow=pda([Buffer.from('escrow'),new PublicKey(config).toBuffer()],pins.program);expected.push(sourceToken,escrow,pins.originMint,TOKEN);}else assert.equal(accounts.length,5);
 assert.deepEqual(accounts,expected);const feePayer=m.accountKeys[0];assert(!accounts.slice(1).includes(feePayer));
 assert.equal(signers,feePayer===event.sender?1:2);assert(new Set(m.accountKeys.slice(0,signers)).has(event.sender));assert.equal(m.header.numReadonlySignedAccounts,0);
 const wanted=new Set([...accounts,pins.program,feePayer]);assert.equal(wanted.size,m.accountKeys.length);assert(m.accountKeys.every(k=>wanted.has(k)));
 const writable=i=>i<signers?i<signers-m.header.numReadonlySignedAccounts:i<m.accountKeys.length-m.header.numReadonlyUnsignedAccounts;
 for(const a of [event.sender,config,vault,sourceEvent,...(sourceToken?[sourceToken,escrow]:[])])assert(writable(m.accountKeys.indexOf(a)));
 const meta=r.meta;shape(meta,['err','fee','preBalances','postBalances','innerInstructions','preTokenBalances','postTokenBalances','logMessages'],['status','loadedAddresses','rewards','returnData','computeUnitsConsumed','costUnits']);assert.equal(meta.err,null);
 if(meta.status!==undefined)assert.deepEqual(meta.status,{Ok:null});if(meta.loadedAddresses!==undefined)assert.deepEqual(meta.loadedAddresses,{readonly:[],writable:[]});if(meta.rewards!==undefined)assert.deepEqual(meta.rewards,[]);
 const fees=new WeakMap();const rawDecoded=JSON.parse(raw,function(k,v,c){if(k==='fee')fees.set(this,rawU64(v,c?.source));return v;});const fee=fees.get(rawDecoded.result.meta);assert.equal(typeof fee,'bigint');assert(fee>0n);
 assert.equal(meta.preBalances.length,m.accountKeys.length);assert.equal(meta.postBalances.length,m.accountKeys.length);
 const delta=new Map(m.accountKeys.map(k=>[k,0n]));const add=(k,n)=>delta.set(k,delta.get(k)+n);
 add(feePayer,-fee);add(event.sender,-rent);add(sourceEvent,rent);
 const native=exactNativeUnits(event.originAmount,inspected.policy.originDecimals);
 if(pins.side===1){add(event.sender,-native);add(vault,native);}
 assert.equal(meta.preBalances[m.accountKeys.indexOf(sourceEvent)],0n);assert.equal(meta.postBalances[m.accountKeys.indexOf(sourceEvent)],rent);
 for(let i=0;i<m.accountKeys.length;i++)assert.equal(meta.postBalances[i]-meta.preBalances[i],delta.get(m.accountKeys[i]),'Native transfer, fee or rent metadata differs');
 assert.equal(meta.preBalances.reduce((a,b)=>a+b,0n)-meta.postBalances.reduce((a,b)=>a+b,0n),fee);
 assert(Array.isArray(meta.innerInstructions)&&meta.innerInstructions.length===1);shape(meta.innerInstructions[0],['index','instructions']);assert.equal(meta.innerInstructions[0].index,0);const inner=meta.innerInstructions[0].instructions;assert(Array.isArray(inner)&&inner.length===4);
 const decodedInner=inner.map(ix=>{inspectInstruction(ix);if(ix.stackHeight!==undefined&&ix.stackHeight!==null)assert.equal(ix.stackHeight,2);const d=new Message({header:m.header,accountKeys:m.accountKeys,recentBlockhash:m.recentBlockhash,instructions:[ix]}).compiledInstructions[0];return {program:m.accountKeys[ix.programIdIndex],accounts:ix.accounts.map(i=>m.accountKeys[i]),data:Buffer.from(d.data)};});
 const funding=decodedInner[0];assert.equal(funding.program,SYSTEM);assert.deepEqual(funding.accounts,[event.sender,sourceEvent]);assert.equal(funding.data.length,12);assert.equal(funding.data.readUInt32LE(0),2);assert.equal(funding.data.readBigUInt64LE(4),rent);
 const allocate=decodedInner[1];assert.equal(allocate.program,SYSTEM);assert.deepEqual(allocate.accounts,[sourceEvent]);assert.equal(allocate.data.length,12);assert.equal(allocate.data.readUInt32LE(0),8);assert.equal(allocate.data.readBigUInt64LE(4),297n);
 const assign=decodedInner[2];assert.equal(assign.program,SYSTEM);assert.deepEqual(assign.accounts,[sourceEvent]);assert.equal(assign.data.length,36);assert.equal(assign.data.readUInt32LE(0),1);assert.equal(new PublicKey(assign.data.subarray(4)).toBase58(),pins.program);
 const transfer=decodedInner[3];
 if(pins.side===0){
  assert.equal(transfer.program,TOKEN);assert.deepEqual(transfer.accounts,[sourceToken,pins.originMint,escrow,event.sender]);assert.equal(transfer.data.length,10);assert.equal(transfer.data[0],12);assert.equal(transfer.data.readBigUInt64LE(1),event.originAmount);assert.equal(transfer.data[9],inspected.policy.originDecimals);
  const tokenSet=values=>{assert(Array.isArray(values)&&values.length===2);const result=new Map();for(const row of values){shape(row,['accountIndex','mint','owner','programId','uiTokenAmount']);integer(row.accountIndex,0,m.accountKeys.length-1);assert(!result.has(row.accountIndex));assert.equal(row.mint,pins.originMint);assert.equal(row.programId,TOKEN);const address=m.accountKeys[row.accountIndex];assert([sourceToken,escrow].includes(address));assert.equal(row.owner,address===sourceToken?event.sender:vault);shape(row.uiTokenAmount,['amount','decimals'],['uiAmount','uiAmountString']);assert.equal(row.uiTokenAmount.decimals,inspected.policy.originDecimals);result.set(row.accountIndex,u64(row.uiTokenAmount.amount));}return result;};
  const before=tokenSet(meta.preTokenBalances),after=tokenSet(meta.postTokenBalances),senderIndex=m.accountKeys.indexOf(sourceToken),escrowIndex=m.accountKeys.indexOf(escrow);
  assert.equal(before.get(senderIndex)-after.get(senderIndex),event.originAmount);assert.equal(after.get(escrowIndex)-before.get(escrowIndex),event.originAmount);
 }else{
  assert.equal(transfer.program,SYSTEM);assert.deepEqual(transfer.accounts,[event.sender,vault]);assert.equal(transfer.data.length,12);assert.equal(transfer.data.readUInt32LE(0),2);assert.equal(transfer.data.readBigUInt64LE(4),native);assert.deepEqual(meta.preTokenBalances,[]);assert.deepEqual(meta.postTokenBalances,[]);
 }
 assert(Array.isArray(meta.logMessages)&&meta.logMessages.length<=64&&meta.logMessages.every(v=>typeof v==='string'&&v.length<=1024));assert(meta.logMessages.includes('Program '+pins.program+' invoke [1]'));assert(meta.logMessages.includes('Program '+pins.program+' success'));assert.equal(meta.logMessages.filter(v=>v==='Program log: SC_BRIDGE_EVENT '+sourceEvent+' '+event.originAmount.toString()).length,1);
 return {schemaVersion:1,scope:'offline selected signed legacy source deposit plus supplied current event and economic RPC metadata; not chain inclusion or independent history',side:pins.side,sourceEvent,slot:r.slot,transactionSHA256:hash(bytes),snapshotSHA256:inspected.snapshotSHA256,eventSHA256:hash(Buffer.from(selected.dataBase64,'base64')),originAmount:event.originAmount.toString(),nativeAmount:native.toString(),feeNativeUnits:fee.toString(),eventRentNativeUnits:rent.toString(),accounts:m.accountKeys.length,selectedTransactionSignaturesVerified:true,selectedSourceInstructionBound:true,selectedEconomicMetadataMatched:true,selectedInnerTransfersMatched:true,rpcObservationExecuted:false,chainInclusionVerified:false,completeSourceEventInventoryVerified:false,transactionMetadataIndependentlyVerified:false,historicalCodeVerified:false,historicalCountersVerified:false,feeScheduleIndependentlyVerified:false,finalizedCommitmentIndependentlyVerified:false,sourceEconomicMovementsIndependentlyVerified:false,backingVerified:false,canRetry:false,canRefund:false,canResetAttempt:false,canSign:false,canBroadcast:false,settlementAccepted:false,productionReady:false};
}
