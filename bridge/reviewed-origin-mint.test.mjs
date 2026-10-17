import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {reviewedOriginMintPolicy,checkedReviewedOriginMintPolicy,observeReviewedOriginAssets} from './reviewed-origin-mint.mjs';
import {PUBLIC_GENESIS} from './sdk.mjs';
const key=()=>Keypair.generate().publicKey.toBase58();
function fixture(){
 const genesis=key(),pins={genesis,remoteGenesis:key(),program:key(),remoteProgram:key(),bridge:key(),originMint:key(),side:0,upgradeAuthority:null,elfBytes:8,elfSHA256:'1'.repeat(64),programDataSHA256:'2'.repeat(64),policySHA256:'3'.repeat(64)};
 const tokenPins={genesis,elfBytes:8,elfSHA256:'4'.repeat(64),programDataSHA256:'5'.repeat(64),upgradeAuthority:null};
 return {pins,tokenPins,expectedSupplyUnits:'9007199254740993',expectedDecimals:6,expectedMintDataSHA256:'6'.repeat(64)};
}
test('review digest retains exact large supply and immutable copies of all selected code and mint expectations',()=>{
 const input=fixture(),r=reviewedOriginMintPolicy(input);assert.equal(r.expectedSupplyUnits,'9007199254740993');assert.equal(checkedReviewedOriginMintPolicy(JSON.parse(JSON.stringify(r))).sha256,r.sha256);
 input.pins.originMint=key();input.tokenPins.programDataSHA256='7'.repeat(64);input.expectedSupplyUnits='1';assert.equal(r.expectedSupplyUnits,'9007199254740993');assert.equal(r.tokenPins.programDataSHA256,'5'.repeat(64));assert(Object.isFrozen(r)&&Object.isFrozen(r.pins)&&Object.isFrozen(r.tokenPins));
});
test('every reviewed identity, authority, code, supply, precision and mint digest is bound before observation',()=>{
 const policy=reviewedOriginMintPolicy(fixture());
 for(const field of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint','upgradeAuthority','elfSHA256','programDataSHA256','policySHA256']){
  const p=structuredClone(policy);p.pins[field]=field.endsWith('SHA256')?'a'.repeat(64):key();assert.throws(()=>checkedReviewedOriginMintPolicy(p));
 }
 for(const field of ['genesis','upgradeAuthority','elfSHA256','programDataSHA256','elfBytes']){const p=structuredClone(policy);p.tokenPins[field]=field==='elfBytes'?9:field.endsWith('SHA256')?'b'.repeat(64):key();assert.throws(()=>checkedReviewedOriginMintPolicy(p));}
 for(const [field,value]of [['expectedSupplyUnits','9007199254740994'],['expectedDecimals',7],['expectedMintDataSHA256','a'.repeat(64)],['scope','other'],['schemaVersion',2],['sha256','a'.repeat(64)]])assert.throws(()=>checkedReviewedOriginMintPolicy({...policy,[field]:value}));
});
test('ambiguous supply, malformed digests, unknown schemas and cross-chain code selections refuse',()=>{
 for(const value of ['0','01','-1','1.0','1e3',9007199254740993,'18446744073709551616','9'.repeat(21)])assert.throws(()=>reviewedOriginMintPolicy({...fixture(),expectedSupplyUnits:value}));
 for(const value of [-1,10,1.5,true])assert.throws(()=>reviewedOriginMintPolicy({...fixture(),expectedDecimals:value}));
 for(const value of ['a'.repeat(63),'A'.repeat(64),null,42])assert.throws(()=>reviewedOriginMintPolicy({...fixture(),expectedMintDataSHA256:value}));
 const f=fixture();for(const k of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'])assert.throws(()=>reviewedOriginMintPolicy({...f,pins:{...f.pins,[k]:'11111111111111111111111111111111'}}));assert.throws(()=>reviewedOriginMintPolicy({...f,tokenPins:{...f.tokenPins,genesis:key()}}));assert.throws(()=>reviewedOriginMintPolicy({...f,pins:{...f.pins,side:1}}));
 for(const value of [null,[],{...reviewedOriginMintPolicy(f),extra:true}])assert.throws(()=>checkedReviewedOriginMintPolicy(value));
});
test('public/canonical chains and altered reviewed policies reject before any RPC',async()=>{
 let calls=0;const fetcher=()=>{calls++;throw Error('Unexpected RPC');};
 for(const genesis of [...PUBLIC_GENESIS,'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon']){const f=fixture();assert.throws(()=>reviewedOriginMintPolicy({...f,pins:{...f.pins,genesis},tokenPins:{...f.tokenPins,genesis}}));}
 const p=reviewedOriginMintPolicy(fixture());await assert.rejects(observeReviewedOriginAssets({rpc:'http://127.0.0.1:24899',policy:{...p,expectedMintDataSHA256:'a'.repeat(64)}},fetcher));assert.equal(calls,0);
});
