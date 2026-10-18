// Repeatable offline projection from retained actual genesis evidence. Original
// mint/supply/backing below are hypothetical, never deployed or funded.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { auditBootstrap } from './bootstrap-core.mjs';
const bytes=readFileSync(new URL('../evidence/mainnet-validator-rehearsal.json',import.meta.url));
const previous=JSON.parse(bytes),genesisAudit=previous.genesisAudit;
const reserve=genesisAudit.accounts.find(a=>a.lamports===previous.budget.reserveNativeUnits);
if(!reserve)throw new Error('Retained reviewed reserve is missing');
const protection=946560n,allocated=BigInt(genesisAudit.totalLamports)-BigInt(reserve.lamports);
const locked=(allocated+protection+999n)/1000n;
const input={schemaVersion:1,environment:'isolated-rehearsal',genesisAudit,
  originMint:new PublicKey(Uint8Array.from({length:32},(_,i)=>42+i)).toBase58(),
  originDecimals:6,nativeDecimals:9,originSupplyUnits:'1000000000',
  prelockedOriginUnits:locked.toString(),reserveAddress:reserve.address,
  reserveDataBytes:8,protectedReserveNativeUnits:protection.toString(),
  declaredOriginCounterUnits:'0',declaredNativeCounterUnits:'0'};
const zeroCounterProjection=auditBootstrap(input);
const expectedCounterProjection=auditBootstrap({...input,declaredOriginCounterUnits:locked.toString(),declaredNativeCounterUnits:locked.toString()});
const paths=['mainnet/bootstrap.mjs','mainnet/bootstrap-core.mjs','mainnet/bootstrap.test.mjs','mainnet/bootstrap-fixture.mjs','mainnet/plan.mjs','mainnet/plan.test.mjs','bridge/program/src/lib.rs'];
console.log(JSON.stringify({schemaVersion:1,at:new Date().toISOString(),scope:'Offline exact accounting against retained real genesis inventory; original mint/supply/backing are hypothetical fixtures, not real escrow or production parameters',
  accountingPassed:true,productionReady:false,activationEnabled:false,canonicalNetworkChanged:false,
  sourceGenesisEvidenceSHA256:createHash('sha256').update(bytes).digest('hex'),
  sourceHashes:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex')])),
  checks:{localTestCommandsExecuted:false,actualGenesisAccounts:genesisAudit.accountCount,initialZeroCounterMismatchDetected:!zeroCounterProjection.gates.declaredCountersMatch},
  zeroCounterProjection,expectedCounterProjection,
  remaining:['Actual finalized original backing and custody evidence','On-chain bootstrap counters and one-time consumption of backing events','Protected-reserve enforcement and independent review','Full-validator hosting, consensus/recovery and independent operators']},null,2));
