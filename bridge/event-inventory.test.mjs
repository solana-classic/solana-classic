import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Keypair,PublicKey} from '@solana/web3.js';
import {encodeEvent} from './sdk.mjs';
import {reconcileEventInventory} from './event-inventory.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),key=()=>Keypair.generate().publicKey.toBase58(),pda=(seeds,program)=>PublicKey.findProgramAddressSync(seeds,new PublicKey(program))[0].toBase58();
function fixture(){
 const chains=[key(),key()],programs=[key(),key()],bridge=key(),mint=key(),committee=Array.from({length:5},key),pins={},snapshots=[],configs=[],vaults=[];
 const account=(side,address,bytes,lamports='1000')=>({address,owner:programs[side],executable:false,lamports,dataBase64:bytes.toString('base64')});
 for(let side=0;side<2;side++){
  const config=Buffer.alloc(382);config.write('SCCFG001');for(const [offset,value] of [[8,bridge],[40,chains[side]],[72,chains[1-side]],[104,programs[1-side]],[136,mint]])new PublicKey(value).toBuffer().copy(config,offset);
  committee.forEach((member,i)=>new PublicKey(member).toBuffer().copy(config,168+i*32));config[328]=6;config[329]=9;config[330]=side;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(1000000000n,342);config.writeBigUInt64LE(2000000000n,350);
  const configAddress=pda([Buffer.from('config'),new PublicKey(bridge).toBuffer()],programs[side]),vault=pda([Buffer.from('vault'),new PublicKey(configAddress).toBuffer()],programs[side]);
  const vaultBytes=Buffer.alloc(16);vaultBytes.write('SCVLT002');vaultBytes.writeBigUInt64LE(1000n,8);
  snapshots.push({genesis:chains[side],program:programs[side],commitment:'finalized',contextSlot:100,accounts:[account(side,configAddress,config),account(side,vault,vaultBytes,'51000')]});configs.push(config);vaults.push(vaultBytes);
  pins[side===0?'origin':'native']={genesis:chains[side],remoteGenesis:chains[1-side],program:programs[side],remoteProgram:programs[1-side],bridge,originMint:mint,side,upgradeAuthority:key(),elfSHA256:'1'.repeat(64),elfBytes:4,programDataSHA256:'2'.repeat(64),policySHA256:sha(config.subarray(0,358))};
 }
 function updateCounters(origin,native){for(const [side,value] of [[0,origin],[1,native]]){configs[side].writeBigUInt64LE(value,374);snapshots[side].accounts[0].dataBase64=configs[side].toString('base64');}}
 let nonce=0n;
 function event(side,amount,consumed){
  const sender=key(),recipient=key(),n=++nonce,bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(n);const configAddress=snapshots[side].accounts[0].address;
  const sourceEvent=pda([Buffer.from('event'),new PublicKey(configAddress).toBuffer(),new PublicKey(sender).toBuffer(),bytes],programs[side]);
  const e={bridge,sourceChain:chains[side],destinationChain:chains[1-side],sourceProgram:programs[side],destinationProgram:programs[1-side],sourceEvent,sender,recipient,originAmount:amount,nonce:n,slot:50n,epoch:1n,direction:side};
  const row=account(side,sourceEvent,encodeEvent(e));snapshots[side].accounts.push(row);let receipt=null;
  if(consumed){const destination=1-side,config=snapshots[destination].accounts[0].address;receipt=account(destination,pda([Buffer.from('claim'),new PublicKey(config).toBuffer(),new PublicKey(sourceEvent).toBuffer()],programs[destination]),new PublicKey(sourceEvent).toBuffer());snapshots[destination].accounts.push(receipt);}
  return {e,row,receipt,side};
 }
 const events=[event(0,100n,true),event(0,50n,false),event(0,25n,true),event(1,40n,true),event(1,10n,false)];updateCounters(135n,75n);
 const options={pins,originSnapshot:snapshots[0],nativeSnapshot:snapshots[1],originEscrowUnits:'140',minimumContextSlots:[90,90]};
 return {options,snapshots,pins,configs,vaults,event,events,updateCounters,account};
}
const read=f=>reconcileEventInventory(f.options);
test('returned source events and opposite consumed receipts derive both pending liabilities without journal labels',()=>{
 const f=fixture(),before=JSON.stringify(f.options),r=read(f);assert.deepEqual(r.sourceEvents,[3,2]);assert.deepEqual(r.consumedReceipts,[1,2]);assert.equal(r.accounting.originOutstandingUnits,'135');assert.equal(r.accounting.nativeOutstandingUnits,'75');assert.equal(r.accounting.unallocatedEscrowSurplusUnits,'5');assert.deepEqual(r.pending,{nativeClaimOriginUnits:'50',originalRedemptionOriginUnits:'10',totalOriginUnits:'60',nativePayoutUnits:'50000'});assert.equal(JSON.stringify(f.options),before);
 for(const flag of ['rpcResponseCompletenessVerified','completeSourceEventInventoryVerified','sameLedgerHistoryVerified','simultaneousSnapshotVerified','finalizedCommitmentIndependentlyVerified','freshChainStateVerified','deployedCodeAndCustodyVerified','sourceEconomicMovementsIndependentlyVerified','backingVerified','canRetry','canRefund','canResetAttempt','canSign','canBroadcast','settlementAccepted','productionReady'])assert.equal(r[flag],false);
 assert.equal(r.returnedEventAndReceiptAccountingMatched,true);
});
test('omitted pending events or consumed receipts cannot silently shrink unchanged counters',()=>{
 for(const mode of ['event','receipt']){const f=fixture(),row=mode==='event'?f.events[1].row:f.events[2].receipt,side=mode==='event'?0:1;f.snapshots[side].accounts=f.snapshots[side].accounts.filter(account=>account!==row);assert.throws(()=>read(f),/do not reconcile/);}
});
test('an orphan or reassigned consumed receipt refuses even when counters are supplied',()=>{
 for(const mode of ['orphan','address']){const f=fixture(),receipt=f.events[0].receipt;
  if(mode==='orphan'){f.snapshots[0].accounts=f.snapshots[0].accounts.filter(account=>account!==f.events[0].row);}
  else receipt.address=key();assert.throws(()=>read(f),/receipt|PDA/);
 }
});
test('account ordering is deterministic without mutating caller selections',()=>{
 const f=fixture(),a=read(f);for(const snapshot of f.snapshots)snapshot.accounts.reverse();const b=read(f);assert.deepEqual(a,b);
});
test('wrong chain, commitment, stale context, domain or epoch refuses',()=>{
 for(const mode of ['chain','commitment','checkpoint','eventEpoch','eventDirection','eventSlot','eventSender','eventAddress','eventNativeOverflow','remotePin','zeroPin']){const f=fixture();
  if(mode==='chain')f.snapshots[0].genesis=key();if(mode==='commitment')f.snapshots[0].commitment='confirmed';if(mode==='checkpoint')f.snapshots[1].contextSlot=89;
  if(mode.startsWith('event')){const {e,row}=f.events[0];if(mode==='eventEpoch')e.epoch=2n;if(mode==='eventDirection')e.direction=1;if(mode==='eventSlot')e.slot=101n;if(mode==='eventNativeOverflow')e.originAmount=(1n<<64n)-1n;if(mode==='eventSender')e.sender='11111111111111111111111111111111';if(mode==='eventAddress')row.address=key();row.dataBase64=encodeEvent(e).toString('base64');}
  if(mode==='remotePin')f.pins.native.remoteProgram=key();if(mode==='zeroPin')f.pins.origin.originMint='11111111111111111111111111111111';assert.throws(()=>read(f));
 }
});
test('policy bytes, missing configuration/vault and unsupported bootstrap accounts refuse',()=>{
 for(const mode of ['policy','config','vault','bootstrap','unknown']){const f=fixture();
  if(mode==='policy'){f.configs[0][341]=1;f.snapshots[0].accounts[0].dataBase64=f.configs[0].toString('base64');}
  if(mode==='config')f.snapshots[0].accounts.shift();if(mode==='vault')f.snapshots[0].accounts.splice(1,1);
  if(mode==='bootstrap'||mode==='unknown'){const data=Buffer.alloc(mode==='bootstrap'?120:15);if(mode==='bootstrap')data.write('SCBST001');f.snapshots[0].accounts.push(f.account(0,key(),data));}assert.throws(()=>read(f));
 }
});
test('configuration semantics cannot be blessed by replacing a selected policy digest',()=>{
 for(const mode of ['committee','decimals','epoch','side','identity','quorum','limit']){const f=fixture(),c=f.configs[0];
  if(mode==='committee')c.subarray(168,200).copy(c,200);if(mode==='decimals')c[328]=10;if(mode==='epoch')c.writeBigUInt64LE(0n,332);if(mode==='side')c[330]=1;if(mode==='identity')c[72]^=1;if(mode==='quorum')c[331]=2;if(mode==='limit')c.writeBigUInt64LE(0n,342);
  f.pins.origin.policySHA256=sha(c.subarray(0,358));f.snapshots[0].accounts[0].dataBase64=c.toString('base64');assert.throws(()=>read(f));
 }
});
test('exact escrow coverage and native protected floor include pending payouts',()=>{
 for(const mode of ['escrow','reserve','floor','nativeCounter','originCounter']){const f=fixture();
  if(mode==='escrow')f.options.originEscrowUnits='134';if(mode==='reserve')f.snapshots[1].accounts[1].lamports='50999';if(mode==='floor'){f.vaults[1].writeBigUInt64LE(1001n,8);f.snapshots[1].accounts[1].dataBase64=f.vaults[1].toString('base64');}
  if(mode==='nativeCounter')f.updateCounters(135n,76n);if(mode==='originCounter')f.updateCounters(134n,75n);assert.throws(()=>read(f));
 }
});
test('exact u64 amounts above Number precision and recycled gross flows above u64 retain units',()=>{
 const f=fixture(),large=(1n<<64n)-1n;
 for(let side=0;side<2;side++){f.snapshots[side].accounts=f.snapshots[side].accounts.slice(0,2);f.configs[side][328]=9;f.pins[side===0?'origin':'native'].policySHA256=sha(f.configs[side].subarray(0,358));}
 f.event(0,large,true);f.event(0,large,true);f.event(1,large,true);f.event(1,large,true);f.updateCounters(0n,0n);f.options.originEscrowUnits='0';const r=read(f);assert.equal(r.flows.originLocksUnits,(large*2n).toString());assert.equal(r.flows.originalRedemptionsUnits,(large*2n).toString());assert.equal(r.pending.totalOriginUnits,'0');
});
test('duplicate accounts, malformed schemas/encoding, unsafe checkpoints and unbounded input refuse',()=>{
 for(const mode of ['duplicate','extra','owner','executable','base64','oversized','count','lamports','unsafe','zeroMinimum','public']){const f=fixture(),row=f.snapshots[0].accounts[2];
  if(mode==='duplicate')f.snapshots[0].accounts.push({...row});if(mode==='extra')row.canRetry=true;if(mode==='owner')row.owner=key();if(mode==='executable')row.executable=true;if(mode==='base64')row.dataBase64+=' ';if(mode==='oversized')row.dataBase64='A'.repeat(513);if(mode==='count')f.snapshots[0].accounts=Array(257).fill(row);if(mode==='lamports')row.lamports='1e3';if(mode==='unsafe')f.snapshots[0].contextSlot=Number.MAX_SAFE_INTEGER+1;if(mode==='zeroMinimum')f.options.minimumContextSlots[0]=0;if(mode==='public')f.pins.origin.genesis='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';assert.throws(()=>read(f));
 }
});
test('coordinated event omission and altered supplied counters remain explicitly unproven completeness',()=>{
 const f=fixture();f.snapshots[0].accounts=f.snapshots[0].accounts.filter(row=>row!==f.events[1].row);f.updateCounters(85n,75n);f.options.originEscrowUnits='90';const r=read(f);assert.equal(r.pending.nativeClaimOriginUnits,'0');assert.equal(r.rpcResponseCompletenessVerified,false);assert.equal(r.completeSourceEventInventoryVerified,false);assert.equal(r.backingVerified,false);
});
