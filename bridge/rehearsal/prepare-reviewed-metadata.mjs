// Select a read-only policy from a completed private fixture before RPC startup.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {reviewedOriginMintPolicy} from './reviewed-origin-mint.mjs';
import {genesisTokenCodePins} from './origin-token-code.mjs';
const root='/data/bridge-reviewed-metadata-origin-v1',source='/data/bridge-metadata-observer-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(fs.readFileSync(source+'/private-input.json')),r=JSON.parse(fs.readFileSync(source+'/public-result.json'));
assert.equal(m.scope,'fresh-private-metadata-origin');assert.equal(r.state,'passed');assert(r.processes.allStopped&&r.signatures.length===4&&r.signatures.every(s=>s.state==='finalized'));assert.equal(r.genesis,m.genesis);assert.equal(r.settlementBroadcasts,0);
// Public halves of generated fixture keys only. No signing or key export.
const pub=name=>{const bytes=m.keys[name];assert(Array.isArray(bytes)&&bytes.length===64);return new PublicKey(Uint8Array.from(bytes.slice(32)));};
assert.equal(pub('mint').toBase58(),r.mint.address);
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
const policy=Buffer.concat([Buffer.from('SCCFG001'),new PublicKey(m.bridge).toBuffer(),new PublicKey(m.genesis).toBuffer(),new PublicKey(m.remoteGenesis).toBuffer(),new PublicKey(m.remoteProgram).toBuffer(),pub('mint').toBuffer(),...Array.from({length:5},(_,i)=>pub('member'+i).toBuffer()),Buffer.from([6,9,0,3]),u64(1n),Buffer.from([0,1]),u64(2000000n),u64(4000000n),u64(0n),u64(0n),u64(100000n)]);assert.equal(policy.length,382);
const elf=fs.readFileSync(root+'/bridge.so'),header=Buffer.alloc(45);header.writeUInt32LE(3);header[12]=1;pub('payer').toBuffer().copy(header,13);assert.equal(hash(elf),r.bridgeSBF_SHA256);
const pins={genesis:m.genesis,remoteGenesis:m.remoteGenesis,program:m.program,remoteProgram:m.remoteProgram,bridge:m.bridge,originMint:r.mint.address,side:0,upgradeAuthority:pub('payer').toBase58(),elfBytes:elf.length,elfSHA256:hash(elf),programDataSHA256:hash(Buffer.concat([header,elf])),policySHA256:hash(policy.subarray(0,358))};
const tokenPins=genesisTokenCodePins({genesis:m.genesis,artifact:fs.readFileSync(root+'/token2022.so'),upgradeAuthority:'11111111111111111111111111111111',expectedSHA256:'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68',expectedBytes:506896});
const selected=reviewedOriginMintPolicy({pins,tokenPins,expectedSupplyUnits:'2000000',expectedDecimals:6,expectedMintDataSHA256:r.mint.dataSHA256});
fs.writeFileSync(root+'/reviewed-policy.json',JSON.stringify({policy:selected,minimumContextSlot:r.observation.finalTokenContextSlot}),{flag:'wx',mode:0o600});
