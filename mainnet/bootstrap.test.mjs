import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PublicKey } from '@solana/web3.js';
import { auditBootstrap } from './bootstrap.mjs';
const key=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58();
function fixture() {
  const row=(i,lamports,owner='11111111111111111111111111111111',dataBytes=0)=>({address:key(i),lamports,owner,dataBytes,executable:false});
  return {schemaVersion:1,environment:'isolated-rehearsal',originMint:key(40),originDecimals:6,nativeDecimals:9,originSupplyUnits:'1000000',prelockedOriginUnits:'100947',reserveAddress:key(1),reserveDataBytes:8,protectedReserveNativeUnits:'946560',genesisAudit:{genesis:key(99),clusterType:'development',accountCount:3,totalLamports:'1000000000',accounts:[row(1,'900000000'),row(2,'10000000'),row(3,'90000000','Stake11111111111111111111111111111111111111',200)],inflation:{initial:0,terminal:0,taper:0,foundation:0,foundationTerm:0,unused:0},feeRateGovernor:{burnPercent:0},rent:{burn_percent:0,exemption_threshold:2,lamports_per_byte_year:3480}}};
}
test('bootstrap includes all outside-reserve balances, reserve rent and exact precision slack',()=>{
  const r=auditBootstrap(fixture());assert.equal(r.backing.minimumPrelockedOriginUnits,'100947');assert.equal(r.backing.precisionOrExtraBackingNativeUnits,'440');assert.equal(r.backing.backedNativeInsideReserveUnits,'947000');assert.equal(r.backing.availableForNewOriginDepositsNativeUnits,'899053000');assert.equal(r.activationEnabled,false);assert.equal(r.productionReady,false);
});
test('allocations alone do not cover protected reserve rent',()=>{
  const f=fixture();f.prelockedOriginUnits='100000';assert.throws(()=>auditBootstrap(f),/Unbacked/);
});
test('reserve backing plus new-deposit tranche equals the entire actual reserve',()=>{
  const f=fixture();f.prelockedOriginUnits='200000';const r=auditBootstrap(f);
  assert.equal(BigInt(r.backing.backedNativeInsideReserveUnits)+BigInt(r.backing.availableForNewOriginDepositsNativeUnits),BigInt(r.totals.reserveNativeUnits));assert.equal(r.backing.precisionOrExtraBackingNativeUnits,'99053440');
});
test('zero/missing bootstrap counters remain a failed gate even with declared backing',()=>{
  for(const counters of [{},{declaredOriginCounterUnits:'0',declaredNativeCounterUnits:'0'}]){const r=auditBootstrap({...fixture(),...counters});assert.equal(r.gates.declaredCountersMatch,false);assert.equal(r.gates.onChainCountersApplied,false);}
  const r=auditBootstrap({...fixture(),declaredOriginCounterUnits:'100947',declaredNativeCounterUnits:'100947'});assert.equal(r.gates.declaredCountersMatch,true);assert.equal(r.bootstrapCounters.appliedOnChain,false);assert.equal(r.gates.finalizedOriginalEscrowVerified,false);assert.equal(r.activationEnabled,false);
});
test('duplicate, missing or misreported genesis accounts cannot reconcile',()=>{
  for(const mutate of [f=>f.genesisAudit.accounts[1].address=f.reserveAddress,f=>f.genesisAudit.accountCount=4,f=>f.genesisAudit.totalLamports='1000000001',f=>f.genesisAudit.accounts[0].lamports='900000001']){const f=fixture();mutate(f);assert.throws(()=>auditBootstrap(f));}
});
test('integer parsing and native/global supply overflow reject imprecise inputs',()=>{
  for(const value of ['1e6','1.0','01','-1',1000000]){const f=fixture();f.originSupplyUnits=value;assert.throws(()=>auditBootstrap(f));}
  const f=fixture();f.originSupplyUnits='18446744073709551615';assert.throws(()=>auditBootstrap(f));
});
test('large u64 integer budgets remain exact beyond JavaScript number precision',()=>{
  const f=fixture(),total=(1n<<64n)-1n;f.originDecimals=9;f.originSupplyUnits=total.toString();f.prelockedOriginUnits='100946560';f.genesisAudit.totalLamports=total.toString();f.genesisAudit.accounts[0].lamports=(total-100000000n).toString();const r=auditBootstrap(f);assert.equal(r.totals.nativeGenesisUnits,total.toString());assert.equal(r.backing.precisionOrExtraBackingNativeUnits,'0');
});
test('public/soaking genesi and production mode are refused',()=>{
  for(const genesis of ['7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']){const f=fixture();f.genesisAudit.genesis=genesis;assert.throws(()=>auditBootstrap(f));}
  const f=fixture();f.environment='mainnet';assert.throws(()=>auditBootstrap(f));
});
test('inflation or burn settings cannot reuse the zero-inflation accounting policy',()=>{
  for(const mutate of [f=>f.genesisAudit.inflation.initial=0.01,f=>f.genesisAudit.feeRateGovernor.burnPercent=50,f=>f.genesisAudit.rent.burn_percent=50]){const f=fixture();mutate(f);assert.throws(()=>auditBootstrap(f));}
});
test('reserve protection below rent, missing reserve and executable reserve are rejected',()=>{
  for(const mutate of [f=>f.protectedReserveNativeUnits='946559',f=>f.reserveAddress=key(20),f=>f.genesisAudit.accounts[0].executable=true]){const f=fixture();mutate(f);assert.throws(()=>auditBootstrap(f));}
});
test('fractional or unsafe floating-point rent policy is refused',()=>{
  for(const threshold of [1.5,100000000000]){const f=fixture();f.genesisAudit.rent.exemption_threshold=threshold;assert.throws(()=>auditBootstrap(f),/rent/i);}
});
test('inventory fingerprint is independent of input ordering',()=>{
  const f=fixture(),a=auditBootstrap(f);f.genesisAudit.accounts.reverse();const b=auditBootstrap(f);assert.equal(a.inventorySHA256,b.inventorySHA256);
});
test('actual retained 249-account genesis exposes the protected-rent/precision budget',()=>{
  const previous=JSON.parse(readFileSync(new URL('../evidence/mainnet-validator-rehearsal.json',import.meta.url)));
  const g=previous.genesisAudit,reserve=g.accounts.find(a=>a.lamports===previous.budget.reserveNativeUnits);
  assert(reserve);const outside=BigInt(g.totalLamports)-BigInt(reserve.lamports);const minimum=(outside+946560n+999n)/1000n;
  const r=auditBootstrap({...fixture(),genesisAudit:g,reserveAddress:reserve.address,originSupplyUnits:'1000000000',prelockedOriginUnits:minimum.toString()});
  assert.equal(r.accountCount,249);assert.equal(r.totals.nativeOutsideReserveUnits,'330309622560');assert.equal(r.backing.minimumPrelockedOriginUnits,'330310570');assert.equal(r.backing.precisionOrExtraBackingNativeUnits,'880');assert.equal(r.gates.finalizedOriginalEscrowVerified,false);assert.equal(r.activationEnabled,false);
});

test('V2 protected vault rent requires the larger exact bootstrap budget',()=>{
  const f=fixture();delete f.reserveDataBytes;f.protectedReserveNativeUnits='1002240';f.prelockedOriginUnits='101003';
  const r=auditBootstrap(f);assert.equal(r.reserveDataBytes,16);assert.equal(r.backing.minimumVaultRentNativeUnits,'1002240');assert.equal(r.backing.precisionOrExtraBackingNativeUnits,'760');
  f.protectedReserveNativeUnits='946560';assert.throws(()=>auditBootstrap(f));
});


test('reserve library import never enters the bootstrap file CLI on an entrypoint collision',()=>{
  const cli=fileURLToPath(new URL('./bootstrap.mjs',import.meta.url));
  const library=new URL('./reserve-prefund-plan.mjs',import.meta.url).href;
  const source=`process.argv=[process.execPath,${JSON.stringify(cli)},'missing-bootstrap-input'];await import(${JSON.stringify(library)});process.stdout.write('imported');`;
  const r=spawnSync(process.execPath,['--input-type=module','--eval',source],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  assert.ifError(r.error);assert.equal(r.status,0);assert.equal(r.stdout,'imported');assert.equal(r.stderr,'');
});

test('bootstrap file CLI preserves the exact accounting report and rejects missing input',()=>{
  const cli=fileURLToPath(new URL('./bootstrap.mjs',import.meta.url));
  const directory=mkdtempSync(join(tmpdir(),'bootstrap-cli-'));
  try {
    const input=fixture(),file=join(directory,'input.json');writeFileSync(file,JSON.stringify(input));
    const r=spawnSync(process.execPath,[cli,file],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
    assert.ifError(r.error);assert.equal(r.status,0);assert.equal(r.stderr,'');
    assert.equal(r.stdout,JSON.stringify(auditBootstrap(input),null,2)+'\n');
    const missing=spawnSync(process.execPath,[cli],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
    assert.ifError(missing.error);assert.notEqual(missing.status,0);assert.equal(missing.stdout,'');assert.match(missing.stderr,/Usage: node mainnet\/bootstrap.mjs/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
