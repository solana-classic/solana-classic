// Only read-only methods on one NEW private copied metadata ledger.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {reviewedOriginMintPolicy,observeReviewedOriginAssets} from './reviewed-origin-mint.mjs';
const root='/data/bridge-reviewed-metadata-origin-v1';
const selected=JSON.parse(fs.readFileSync(root+'/reviewed-policy.json'));
const proof={schemaVersion:1,state:'running',scope:'Actual read-only review-bound metadata observation on one new private copied origin; no settlement or journal integration',startedAt:new Date().toISOString(),checks:[],broadcasts:0,simulations:0,canSign:false,canBroadcast:false,productionReady:false,canonicalNetworkChanged:false};
assert(!fs.existsSync(root+'/public-result.json'));
const save=()=>fs.writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
const pass=text=>{proof.checks.push(text);save();};
const calls=[],fetcher=(url,options)=>{const q=JSON.parse(options.body);assert(['getGenesisHash','getMultipleAccounts'].includes(q.method));calls.push(q.method);return fetch(url,options);};
const options={rpc:'http://127.0.0.1:25899',...selected};
try{
 save();const first=await observeReviewedOriginAssets(options,fetcher);
 assert.equal(first.reviewedMintPolicySHA256,selected.policy.sha256);assert.equal(first.mintDataSHA256,selected.policy.expectedMintDataSHA256);assert.equal(first.originOutstandingUnits,'100000');assert.equal(first.originEscrowUnits,'100000');assert.equal(first.tokenCodeVerified,true);assert.equal(first.mintLayout,'immutable-self-metadata-v1');pass('Actual mint bytes, selected supply and exact escrow/counter match the preselected private review and code pins');
 await assert.rejects(observeReviewedOriginAssets({...options,policy:reviewedOriginMintPolicy({...selected.policy,expectedMintDataSHA256:'0'.repeat(64)})},fetcher),/mint bytes differ/);pass('A different independently selected complete mint digest rejects against actual metadata bytes');
 const n=calls.length;await assert.rejects(observeReviewedOriginAssets({...options,policy:{...selected.policy,expectedSupplyUnits:'1999999'}},fetcher),/digest changed/);assert.equal(calls.length,n);pass('Edited review policy without matching digest rejects before any RPC');
 await assert.rejects(observeReviewedOriginAssets({...options,policy:reviewedOriginMintPolicy({...selected.policy,tokenPins:{...selected.policy.tokenPins,programDataSHA256:'0'.repeat(64)}})},fetcher),/selected pin/);pass('Changed selected token implementation pin rejects against actual deployed code');
 const last=await observeReviewedOriginAssets({...options,minimumContextSlot:first.finalTokenContextSlot},fetcher);assert.equal(last.assetDataSHA256,first.assetDataSHA256);assert.equal(last.reviewedMintPolicySHA256,first.reviewedMintPolicySHA256);assert(last.finalTokenContextSlot>=first.finalTokenContextSlot);assert.equal(last.canSign,false);assert.equal(last.canBroadcast,false);pass('Fresh observation retains identical assets and review after all negative checks; only read-only RPC methods used');
 proof.observation=last;proof.rpcReads=calls.length;proof.rpcMethodCounts=Object.fromEntries([...new Set(calls)].map(m=>[m,calls.filter(v=>v===m).length]));proof.state='passed';proof.completedAt=new Date().toISOString();save();
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
