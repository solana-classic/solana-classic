import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PublicKey} from '@solana/web3.js';
import {inspectImmutableMint} from './mint-metadata.mjs';
// Reuse the already pinned workspace SDK as an independent layout oracle.
const require=createRequire(new URL('../packages/chain/package.json',import.meta.url));
const {pack,unpack}=require('@solana/spl-token-metadata');
const {unpackMint,getMetadataPointerState,ExtensionType,getExtensionTypes,TOKEN_2022_PROGRAM_ID}=require('@solana/spl-token');
const mint=new PublicKey(Buffer.alloc(32,42)),other=new PublicKey(Buffer.alloc(32,43));
function plain(){const b=Buffer.alloc(82);b.writeBigUInt64LE(9007199254740993n,36);b[44]=6;b[45]=1;return b;}
function tlv(type,data){const h=Buffer.alloc(4);h.writeUInt16LE(type);h.writeUInt16LE(data.length,2);return Buffer.concat([h,data]);}
function fixture(meta={}){
 const pointer=Buffer.concat([Buffer.alloc(32),mint.toBuffer()]);
 const fields={mint,name:'Classic fixture',symbol:'SOC',uri:'https://example.invalid/metadata',additionalMetadata:[],...meta};
 const payload=Buffer.from(pack(fields)),header=Buffer.concat([plain(),Buffer.alloc(83),Buffer.from([1])]);
 return {header,pointer,payload,fields,bytes:Buffer.concat([header,tlv(18,pointer),tlv(19,payload)])};
}
test('plain immutable mint keeps exact u64 units and no metadata',()=>{
 const r=inspectImmutableMint(plain(),mint.toBase58());assert.equal(r.supplyUnits,'9007199254740993');assert.equal(r.layout,'plain');assert.equal(r.metadata,null);
});
test('metadata mint agrees with pinned SDK layouts and extension enum',()=>{
 const f=fixture({additionalMetadata:[['category','art']]}),r=inspectImmutableMint(f.bytes,mint.toBase58());
 const sdk=unpackMint(mint,{data:f.bytes,owner:TOKEN_2022_PROGRAM_ID,executable:false,lamports:1},TOKEN_2022_PROGRAM_ID);
 assert.equal(ExtensionType.MetadataPointer,18);assert.equal(ExtensionType.TokenMetadata,19);assert.deepEqual(getExtensionTypes(sdk.tlvData),r.extensions);
 assert.equal(getMetadataPointerState(sdk).metadataAddress.toBase58(),r.mint);assert.equal(getMetadataPointerState(sdk).authority,null);
 assert.equal(r.supplyUnits,sdk.supply.toString());assert.deepEqual(r.metadata,{name:unpack(f.payload).name,symbol:unpack(f.payload).symbol,uri:unpack(f.payload).uri,additionalMetadata:unpack(f.payload).additionalMetadata});
});
test('TLV order does not affect reviewed metadata policy',()=>{
 const f=fixture();assert.deepEqual(inspectImmutableMint(Buffer.concat([f.header,tlv(19,f.payload),tlv(18,f.pointer)]),mint.toBase58()),inspectImmutableMint(f.bytes,mint.toBase58()));
});
test('mint freeze, minting, initialization and precision controls remain mandatory',()=>{
 for(const [offset,value]of [[0,1],[46,1],[45,0],[45,2],[44,10]]){const b=plain();b[offset]=value;assert.throws(()=>inspectImmutableMint(b,mint.toBase58()));}
});
test('mutable, external or missing pointer is refused',()=>{
 for(const mode of ['authority','external','length','missing']){const f=fixture();let p=Buffer.from(f.pointer);if(mode==='authority')p[0]=1;if(mode==='external')other.toBuffer().copy(p,32);if(mode==='length')p=p.subarray(1);const parts=[f.header,tlv(19,f.payload)];if(mode!=='missing')parts.push(tlv(18,p));assert.throws(()=>inspectImmutableMint(Buffer.concat(parts),mint.toBase58()));}
});
test('metadata update authority and mint substitution are refused',()=>{
 for(const meta of [{updateAuthority:other},{mint:other}])assert.throws(()=>inspectImmutableMint(fixture(meta).bytes,mint.toBase58()),/Immutable self-metadata/);
});
test('transfer fees, hooks, delegates and every unselected extension are refused',()=>{
 const f=fixture();for(const type of [0,1,3,7,12,14,20,25,26,65535])assert.throws(()=>inspectImmutableMint(Buffer.concat([f.bytes,tlv(type,Buffer.alloc(0))]),mint.toBase58()),/Unsupported/);
});
test('duplicates, partial TLV headers and truncated lengths are refused',()=>{
 const f=fixture();for(const b of [Buffer.concat([f.bytes,tlv(18,f.pointer)]),Buffer.concat([f.bytes,Buffer.from([18])]),f.bytes.subarray(0,f.bytes.length-1),Buffer.concat([f.header,tlv(18,f.pointer)])])assert.throws(()=>inspectImmutableMint(b,mint.toBase58()));
});
test('extended header padding, account type and ambiguous account sizes are refused',()=>{
 for(const offset of [82,164,165]){const b=fixture().bytes;b[offset]=b[offset]===0?1:2;assert.throws(()=>inspectImmutableMint(b,mint.toBase58()));}
 for(const n of [0,81,83,165,166,355,4097])assert.throws(()=>inspectImmutableMint(Buffer.alloc(n),mint.toBase58()));
});
test('metadata string lengths, vector length, duplicate keys and trailing bytes are bounded',()=>{
 for(const meta of [{name:'x'.repeat(257)},{symbol:'x'.repeat(33)},{uri:'x'.repeat(2049)},{additionalMetadata:Array.from({length:9},(_,i)=>[String(i),'v'])},{additionalMetadata:[['k','a'],['k','b']]},{additionalMetadata:[['k'.repeat(129),'v']]},{additionalMetadata:[['k','v'.repeat(513)]]}])assert.throws(()=>inspectImmutableMint(fixture(meta).bytes,mint.toBase58()));
 const f=fixture();assert.throws(()=>inspectImmutableMint(Buffer.concat([f.header,tlv(18,f.pointer),tlv(19,Buffer.concat([f.payload,Buffer.from([0])]))]),mint.toBase58()),/Trailing/);
});
test('invalid UTF8 and oversized declared metadata lengths fail without replacement decoding',()=>{
 const f=fixture(),bad=Buffer.from(f.payload);bad[68]=255;assert.throws(()=>inspectImmutableMint(Buffer.concat([f.header,tlv(18,f.pointer),tlv(19,bad)]),mint.toBase58()));
 const huge=Buffer.from(f.payload);huge.writeUInt32LE(0xffffffff,64);assert.throws(()=>inspectImmutableMint(Buffer.concat([f.header,tlv(18,f.pointer),tlv(19,huge)]),mint.toBase58()),/bound/);
});
test('only canonical nonzero mint strings and Buffer inputs are accepted',()=>{
 for(const key of [null,42,'bad',PublicKey.default.toBase58()])assert.throws(()=>inspectImmutableMint(plain(),key));
 assert.throws(()=>inspectImmutableMint(new Uint8Array(plain()),mint.toBase58()));
});
