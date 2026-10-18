// Offline inspection only. No RPC, keys, signing, journal access or settlement.
import {PublicKey} from '@solana/web3.js';
const MAX_MINT=4096;
const zero=bytes=>bytes.every(v=>v===0);
const utf8=new TextDecoder('utf-8',{fatal:true});
function address(value){
  if(typeof value!=='string')throw Error('Canonical nonzero mint required');
  const key=new PublicKey(value);if(key.toBase58()!==value||key.equals(PublicKey.default))throw Error('Canonical nonzero mint required');return key.toBuffer();
}
function metadata(bytes,mint){
  if(bytes.length<80||!zero(bytes.subarray(0,32))||!bytes.subarray(32,64).equals(mint))throw Error('Immutable self-metadata required');
  let offset=64;
  const u32=()=>{if(offset+4>bytes.length)throw Error('Truncated metadata');const n=bytes.readUInt32LE(offset);offset+=4;return n;};
  const text=limit=>{const n=u32();if(n>limit||offset+n>bytes.length)throw Error('Metadata string exceeds bound');const s=utf8.decode(bytes.subarray(offset,offset+n));offset+=n;return s;};
  const name=text(256),symbol=text(32),uri=text(2048),count=u32();
  if(count>8)throw Error('Too many additional metadata fields');
  const additionalMetadata=[],seen=new Set();
  for(let i=0;i<count;i++){const k=text(128),v=text(512);if(seen.has(k))throw Error('Duplicate metadata key');seen.add(k);additionalMetadata.push([k,v]);}
  if(offset!==bytes.length)throw Error('Trailing metadata bytes');
  return {name,symbol,uri,additionalMetadata};
}
export function inspectImmutableMint(bytes,mintAddress){
  const mint=address(mintAddress);
  if(!Buffer.isBuffer(bytes)||bytes.length<82||bytes.length>MAX_MINT||bytes.length===355)throw Error('Bounded mint bytes required');
  if(bytes.readUInt32LE(0)!==0||bytes.readUInt32LE(46)!==0||bytes[45]!==1||bytes[44]>9)throw Error('Initialized immutable mint with supported precision required');
  const base={mint:mintAddress,supplyUnits:bytes.readBigUInt64LE(36).toString(),decimals:bytes[44],mintAuthority:null,freezeAuthority:null};
  if(bytes.length===82)return {...base,layout:'plain',extensions:[],metadata:null};
  if(bytes.length<=166||!zero(bytes.subarray(82,165))||bytes[165]!==1)throw Error('Canonical extended mint header required');
  const extensions=new Map();let offset=166;
  while(offset<bytes.length){
    if(offset+4>bytes.length)throw Error('Truncated extension header');
    const type=bytes.readUInt16LE(offset),length=bytes.readUInt16LE(offset+2);offset+=4;
    if(![18,19].includes(type)||extensions.has(type))throw Error('Unsupported or duplicate mint extension');
    if(offset+length>bytes.length)throw Error('Truncated extension payload');
    extensions.set(type,bytes.subarray(offset,offset+length));offset+=length;
  }
  if(extensions.size!==2)throw Error('Metadata pointer and metadata must both be present');
  const pointer=extensions.get(18);
  if(pointer.length!==64||!zero(pointer.subarray(0,32))||!pointer.subarray(32,64).equals(mint))throw Error('Immutable self-metadata pointer required');
  return {...base,layout:'immutable-self-metadata-v1',extensions:[18,19],metadata:metadata(extensions.get(19),mint)};
}
