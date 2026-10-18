import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {genesisInventoryMetadataDigest,reviewGenesisCustody} from './genesis-custody.mjs';
const SYSTEM='11111111111111111111111111111111',STAKE='Stake11111111111111111111111111111111111111',VOTE='Vote111111111111111111111111111111111111111';
const key=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58();
const row=(i,owner,lamports='10',dataBytes=0)=>({address:key(i),owner,lamports,dataBytes,executable:false});
function fixture(){
 const genesisAudit={genesis:key(99),clusterType:'development',accountCount:4,totalLamports:'130',accounts:[row(1,SYSTEM,'100'),row(2,STAKE,'10',200),row(3,VOTE,'10',3762),row(4,key(50),'10',16)]};
 return {genesisAudit,expectedGenesis:genesisAudit.genesis,expectedInventorySHA256:genesisInventoryMetadataDigest(genesisAudit),reserveAddress:key(1),bridgeProgram:key(50),bridgeId:key(60)};
}
const refresh=f=>{f.expectedInventorySHA256=genesisInventoryMetadataDigest(f.genesisAudit);return f;};
const safety=['actualGenesisDecoded','inventoryAccountBytesVerified','reserveDataVerified','reserveCustodyVerified','allAccountAuthoritiesVerified','stakeWithdrawalAuthoritiesVerified','voteWithdrawalAuthoritiesVerified','programmeUpgradeControlsVerified','genesisBackingVerified','fullValidatorConsensusVerified','independentVerification','canPrepare','canSign','canBroadcast','activationEnabled','productionReady'];
test('all account metadata reconciles while a plain system reserve fails bridge custody shape',()=>{
 const r=reviewGenesisCustody(fixture());assert.equal(r.accountCount,4);assert.equal(r.reserveMetadataMatches,false);assert.equal(r.reserve.systemOwned,true);
 assert(r.findings.includes('RESERVE_NOT_OWNED_BY_SELECTED_BRIDGE'));assert(r.findings.includes('SYSTEM_RESERVE_REQUIRES_SEPARATE_CUSTODY'));assert(r.findings.includes('STAKE_AUTHORITIES_UNREAD'));assert(r.findings.includes('VOTE_AUTHORITIES_UNREAD'));
 assert.equal(Object.values(r.groups).reduce((s,g)=>s+g.accounts,0),4);assert.equal(Object.values(r.groups).reduce((s,g)=>s+BigInt(g.nativeUnits),0n),130n);
 for(const k of safety)assert.equal(r[k],false,k);
});
test('a matching selected PDA and sixteen-byte owner layout does not prove bytes or authority',()=>{
 const f=fixture(),expected=reviewGenesisCustody(f).reserve.expectedAddress;
 Object.assign(f.genesisAudit.accounts[0],{address:expected,owner:f.bridgeProgram,dataBytes:16});f.reserveAddress=expected;refresh(f);
 const r=reviewGenesisCustody(f);assert.equal(r.reserveMetadataMatches,true);assert.equal(r.reserve.onCurveAddress,false);
 for(const k of safety)assert.equal(r[k],false,k);
});
test('external genesis and metadata selections refuse altered addresses, balances and account owners',()=>{
 for(const change of [f=>f.expectedGenesis=key(98),f=>f.expectedInventorySHA256='0'.repeat(64),f=>f.genesisAudit.accounts[1].owner=key(51),f=>{f.genesisAudit.accounts[0].lamports='99';f.genesisAudit.accounts[1].lamports='11';}]){
  const f=fixture();change(f);assert.throws(()=>reviewGenesisCustody(f),/Selected/);
 }
});
test('reserve address, owner, layout and executable checks are separate from inventory admission',()=>{
 for(const [change,field] of [[a=>a.owner=key(51),'ownerMatches'],[a=>a.dataBytes=8,'layoutMatches'],[a=>a.executable=true,'nonExecutable']]){
  const f=fixture(),expected=reviewGenesisCustody(f).reserve.expectedAddress;Object.assign(f.genesisAudit.accounts[0],{address:expected,owner:f.bridgeProgram,dataBytes:16});f.reserveAddress=expected;change(f.genesisAudit.accounts[0]);
  const r=reviewGenesisCustody(refresh(f));assert.equal(r.reserve[field],false);assert.equal(r.reserveMetadataMatches,false);assert.equal(r.reserveCustodyVerified,false);
 }
 const f=fixture();f.bridgeId=key(61);const r=reviewGenesisCustody(f);assert.equal(r.reserve.addressMatches,false);
});
test('every owner class including zero balances contributes once without assuming spendability',()=>{
 const f=fixture();f.genesisAudit.accounts.push(row(5,'Sysvar1111111111111111111111111111111111111','0',20),row(6,SYSTEM,'0',80));f.genesisAudit.accountCount=6;
 const r=reviewGenesisCustody(refresh(f));assert.equal(Object.values(r.groups).reduce((s,g)=>s+g.accounts,0),6);assert.equal(r.groups['protocol-controls-unreviewed'].nativeUnits,'0');assert.equal(r.allAccountAuthoritiesVerified,false);
});
test('off-curve system addresses are not asserted to be unspendable or protected',()=>{
 const f=fixture();f.genesisAudit.accounts[0].address=reviewGenesisCustody(f).reserve.expectedAddress;f.reserveAddress=f.genesisAudit.accounts[0].address;
 const r=reviewGenesisCustody(refresh(f));assert.equal(r.groups['other-system-metadata'].nativeUnits,'100');assert.equal(r.reserve.onCurveAddress,false);assert.equal(r.reserveMetadataMatches,false);assert.equal(r.reserveCustodyVerified,false);
});
test('u64 native totals stay exact and overflow or ambiguous units refuse',()=>{
 const f=fixture();f.genesisAudit.totalLamports=((1n<<64n)-1n).toString();f.genesisAudit.accounts[0].lamports=((1n<<64n)-31n).toString();
 const r=reviewGenesisCustody(refresh(f));assert.equal(r.totalNativeUnits,'18446744073709551615');
 for(const value of [100,'01','1e2','1.0','-1','18446744073709551616','1'.repeat(1000)]){const x=fixture();x.genesisAudit.accounts[0].lamports=value;assert.throws(()=>genesisInventoryMetadataDigest(x.genesisAudit));}
 f.genesisAudit.accounts[1].lamports='11';assert.throws(()=>genesisInventoryMetadataDigest(f.genesisAudit),/exceeds/);
});
test('missing, duplicate, inconsistent and oversized inventories refuse before classification',()=>{
 for(const change of [f=>f.genesisAudit.accountCount=5,f=>f.genesisAudit.accounts[1].address=f.reserveAddress,f=>f.genesisAudit.totalLamports='131',f=>f.genesisAudit.accountCount=4097,f=>f.genesisAudit.accounts[0].dataBytes=10485761,f=>f.genesisAudit.accounts[0].dataBytes=1.5,f=>f.genesisAudit.accounts[0].executable=0,f=>f.genesisAudit.accounts[0].extra=true]){
  const f=fixture();change(f);assert.throws(()=>genesisInventoryMetadataDigest(f.genesisAudit));
 }
 const f=fixture();f.reserveAddress=key(80);assert.throws(()=>reviewGenesisCustody(f),/funded reserve/);
});
test('public genesi, canonical devnet, System identity and nondevelopment scope refuse',()=>{
 for(const genesis of ['7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',SYSTEM]){const f=fixture();f.genesisAudit.genesis=genesis;assert.throws(()=>genesisInventoryMetadataDigest(f.genesisAudit));}
 const f=fixture();f.genesisAudit.clusterType='mainnet-beta';assert.throws(()=>genesisInventoryMetadataDigest(f.genesisAudit));
 for(const change of [f=>f.bridgeProgram=SYSTEM,f=>f.bridgeProgram=STAKE,f=>f.bridgeId=SYSTEM,f=>f.bridgeId=f.bridgeProgram]){const f=fixture();change(f);assert.throws(()=>reviewGenesisCustody(f));}
});
test('metadata normalization and review preserve caller input and ignore ordering',()=>{
 const f=fixture(),before=structuredClone(f),a=reviewGenesisCustody(f);assert.deepEqual(f,before);
 f.genesisAudit.accounts.reverse();assert.equal(genesisInventoryMetadataDigest(f.genesisAudit),a.inventoryMetadataSHA256);assert.deepEqual(reviewGenesisCustody(f),a);
 const n={schemaVersion:1,scope:'isolated-genesis-account-metadata-v1',genesis:f.genesisAudit.genesis,accountCount:4,totalLamports:'130',accounts:[...f.genesisAudit.accounts].sort((a,b)=>a.address<b.address?-1:1).map(({address,owner,lamports,dataBytes,executable})=>({address,owner,lamports,dataBytes,executable}))};
 assert.equal(a.inventoryMetadataSHA256,createHash('sha256').update('classic-genesis-custody-metadata-v1\0').update(JSON.stringify(n)).digest('hex'));
});
test('actual retained 249-account inventory exposes a system reserve and unread stake/vote authorities',()=>{
 const p=JSON.parse(readFileSync(new URL('../evidence/mainnet-validator-rehearsal.json',import.meta.url))),g=p.genesisAudit;
 const reserve=g.accounts.filter(a=>a.lamports===p.budget.reserveNativeUnits);assert.equal(reserve.length,1);
 const r=reviewGenesisCustody({genesisAudit:g,expectedGenesis:g.genesis,expectedInventorySHA256:genesisInventoryMetadataDigest(g),reserveAddress:reserve[0].address,bridgeProgram:key(50),bridgeId:key(60)});
 assert.equal(r.accountCount,249);assert.equal(r.totalNativeUnits,'1000000000000');assert.equal(r.reserve.nativeUnits,'669690377440');assert.equal(r.reserve.systemOwned,true);assert.equal(r.reserve.onCurveAddress,true);assert.equal(r.reserveMetadataMatches,false);assert.equal(r.groups['stake-authorities-unread'].accounts,3);assert.equal(r.groups['vote-authorities-unread'].accounts,3);
 for(const k of safety)assert.equal(r[k],false,k);
});
