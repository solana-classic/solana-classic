// Read-only isolated Token-2022 escrow observation. No keys, storage or broadcast.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins,observePinnedProgram} from './program-pins.mjs';
import {TOKEN_2022} from './sdk.mjs';
import {inspectImmutableMint} from './mint-metadata.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=v=>new PublicKey(v);
const MAX_WIRE=32768;
function units(v){if(typeof v!=='string'||v.length>20||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>(1n<<64n)-1n)throw new Error('Canonical u64 supply required');return BigInt(v);}
function checkpoint(v){if(!Number.isSafeInteger(v)||v<0)throw new Error('Safe finalized checkpoint required');return v;}
function endpoint(v){const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Explicit private loopback RPC required');return u.href;}
function data(a,owner,size,maximum=size){
  if(!a||a.owner!==owner||a.executable!==false||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length<Math.ceil(size/3)*4||a.data[0].length>Math.ceil(maximum/3)*4)throw new Error('Origin asset owner/layout differs or extensions are unsupported');
  const b=Buffer.from(a.data[0],'base64');if(b.length<size||b.length>maximum||b.toString('base64')!==a.data[0])throw new Error('Canonical origin asset data required');return b;
}
async function snapshot(url,addresses,minimum,fetcher){
  const r=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:minimum}]})});
  if(!r.ok||!r.body)throw new Error('Origin asset RPC unavailable');
  const reader=r.body.getReader(),chunks=[];let n=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>MAX_WIRE)throw new Error('Origin asset RPC exceeds bound');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel();reader.releaseLock();}
  const wire=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(wire.jsonrpc!=='2.0'||wire.id!==1||wire.error||!Object.hasOwn(wire,'result'))throw new Error('Origin asset RPC rejected observation');
  const result=wire.result;if(checkpoint(result?.context?.slot)<minimum||!Array.isArray(result.value)||result.value.length!==4)throw new Error('Origin asset snapshot lacks finalized accounts or precedes checkpoint');return result;
}
function decode(value,pins,supply,decimals,vault,mintPolicy){
  const config=data(value[0],pins.program,382),mint=data(value[1],TOKEN_2022,82,mintPolicy==='plain'?82:4096),escrow=data(value[2],TOKEN_2022,165),authority=data(value[3],pins.program,16);
  if(config.subarray(0,8).toString()!=='SCCFG001'||hash(config.subarray(0,358))!==pins.policySHA256||config[330]!==0||config[328]!==decimals||config[329]!==9||!config.subarray(136,168).equals(key(pins.originMint).toBuffer()))throw new Error('Origin asset policy differs from reviewed pins');
  if(mint.readUInt32LE(0)!==0||mint.readUInt32LE(46)!==0||mint[45]!==1||mint[44]!==decimals||mint.readBigUInt64LE(36)!==supply)throw new Error('Origin mint supply, precision or immutable authorities differ');
  const inspected=mintPolicy==='plain'?null:inspectImmutableMint(mint,pins.originMint);
  if(!escrow.subarray(0,32).equals(key(pins.originMint).toBuffer())||!escrow.subarray(32,64).equals(key(vault).toBuffer())||escrow[108]!==1||escrow.readUInt32LE(72)!==0||escrow.readUInt32LE(109)!==0||escrow.readBigUInt64LE(121)!==0n||escrow.readUInt32LE(129)!==0)throw new Error('Origin escrow mint, vault authority, state, delegate or close authority differs');
  if(authority.subarray(0,8).toString()!=='SCVLT002')throw new Error('Origin vault V2 authority account required');
  const locked=escrow.readBigUInt64LE(64),outstanding=config.readBigUInt64LE(374);
  if(locked<outstanding||locked>supply||outstanding>supply)throw new Error('Origin escrow does not cover recorded obligations within original supply');
  return {mintSupplyUnits:supply.toString(),originEscrowUnits:locked.toString(),originOutstandingUnits:outstanding.toString(),unallocatedEscrowSurplusUnits:(locked-outstanding).toString(),assetDataSHA256:hash(Buffer.concat([config,mint,escrow,authority])),...(inspected?{mintLayout:inspected.layout,mintMetadata:inspected.metadata,mintDataSHA256:hash(mint)}:{})};
}
export async function observeOriginAssets({rpc,pins,expectedSupplyUnits,expectedDecimals,minimumContextSlot=0,mintPolicy='plain'},fetcher=fetch){
  if(!['plain','immutable-self-metadata-v1'].includes(mintPolicy))throw new Error('Explicit supported mint policy required');
  const url=endpoint(rpc);pins=normalizeProgramPins(pins);minimumContextSlot=checkpoint(minimumContextSlot);
  const supply=units(expectedSupplyUnits),decimals=expectedDecimals;
  if(pins.side!==0||supply===0n||!Number.isInteger(decimals)||decimals<0||decimals>9)throw new Error('Isolated origin-side supply and precision required');
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),key(pins.bridge).toBuffer()],key(pins.program))[0];
  const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],key(pins.program))[0].toBase58();
  const escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),config.toBuffer()],key(pins.program))[0].toBase58();
  const addresses=[config.toBase58(),pins.originMint,escrow,vault];
  const before=await observePinnedProgram({rpc:url,pins,minimumContextSlot},fetcher);
  const first=await snapshot(url,addresses,before.contextSlot,fetcher),a=decode(first.value,pins,supply,decimals,vault,mintPolicy);
  const second=await snapshot(url,addresses,first.context.slot,fetcher),b=decode(second.value,pins,supply,decimals,vault,mintPolicy);
  if(a.assetDataSHA256!==b.assetDataSHA256)throw new Error('Origin asset state changed between finalized reads; obtain a fresh observation');
  const after=await observePinnedProgram({rpc:url,pins,minimumContextSlot:second.context.slot},fetcher);
  if(after.outstandingUnits!==b.originOutstandingUnits)throw new Error('Origin obligations changed during the final code observation');
  return {schemaVersion:1,state:'PINNED_ORIGIN_ASSET_SNAPSHOT',scope:mintPolicy==='plain'?'Two stable finalized plain Token-2022 escrow snapshots on a private chain; not complete genesis or economic history proof':'Two stable finalized private mint/escrow snapshots under an explicit immutable metadata policy; not settlement or complete backing proof',genesis:pins.genesis,program:pins.program,mint:pins.originMint,escrow,vault,originDecimals:decimals,...b,firstContextSlot:first.context.slot,contextSlot:second.context.slot,finalCodeContextSlot:after.contextSlot,assetSnapshots:2,codeObservations:4,mintAuthoritiesRevoked:true,escrowCoversRecordedObligations:true,programmePinsVerified:true,tokenExtensionsSupported:mintPolicy!=='plain'&&b.mintLayout==='immutable-self-metadata-v1',...(mintPolicy==='plain'?{}:{mintPolicy,supportedMintExtensions:['MetadataPointer','TokenMetadata'],escrowExtensionsSupported:false}),completeGenesisBackingVerified:false,pendingInventoryVerified:false,historyCompletenessVerified:false,operatorIndependenceVerified:false,canRetry:false,canSign:false,canBroadcast:false,productionReady:false};
}
