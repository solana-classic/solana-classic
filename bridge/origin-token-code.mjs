// Private read-only Token-2022 code admission, selected before RPC observations.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
import {observeOriginAssets} from './origin-assets.mjs';
import {TOKEN_2022,PUBLIC_GENESIS} from './sdk.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const SOAKING='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const DATA=PublicKey.findProgramAddressSync([new PublicKey(TOKEN_2022).toBuffer()],new PublicKey(LOADER))[0].toBase58();
const MAX_DATA=1048576,MAX_WIRE=2*1048576;
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=v=>new PublicKey(v);
const slot=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Safe finalized token checkpoint required');return v;};
function identity(v){if(typeof v!=='string'||key(v).toBase58()!==v)throw Error('Canonical token identity required');return v;}
function digest(v){if(typeof v!=='string'||! /^[0-9a-f]{64}$/.test(v))throw Error('Reviewed token SHA256 required');return v;}
function normalize(value){
 const fields=['genesis','elfBytes','elfSHA256','programDataSHA256','upgradeAuthority'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k)))throw Error('Exact reviewed token-code pin schema required');
 const p=Object.freeze(Object.fromEntries(fields.map(k=>[k,value[k]])));
 identity(p.genesis);if(PUBLIC_GENESIS.has(p.genesis)||p.genesis===SOAKING)throw Error('Public and soaking chains are forbidden');
 if(!Number.isSafeInteger(p.elfBytes)||p.elfBytes<4||p.elfBytes>MAX_DATA-45)throw Error('Bounded token ELF length required');
 digest(p.elfSHA256);digest(p.programDataSHA256);if(p.upgradeAuthority!==null)identity(p.upgradeAuthority);return p;
}
// Pure normalization for an explicitly selected private observation policy.
export function checkedOriginTokenCodePins(value){return normalize(value);}
// Only for the reviewed fixture's slot-zero genesis installation, not an upgrade.
// Artifact digest/length and authority must be independently selected by caller.
export function genesisTokenCodePins({genesis,artifact,upgradeAuthority,expectedSHA256,expectedBytes}){
 if(!Buffer.isBuffer(artifact)||artifact.length!==expectedBytes||hash(artifact)!==digest(expectedSHA256)||artifact.subarray(0,4).toString('hex')!=='7f454c46')throw Error('Reviewed token artifact differs');
 if(upgradeAuthority!==null)identity(upgradeAuthority);
 const header=Buffer.alloc(45);header.writeUInt32LE(3);if(upgradeAuthority!==null){header[12]=1;key(upgradeAuthority).toBuffer().copy(header,13);}
 return normalize({genesis,elfBytes:artifact.length,elfSHA256:hash(artifact),programDataSHA256:hash(Buffer.concat([header,artifact])),upgradeAuthority});
}
function endpoint(v){const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Explicit private loopback token RPC required');return u.href;}
function bytes(a,executable){
 if(!a||a.owner!==LOADER||a.executable!==executable||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length>Math.ceil(MAX_DATA/3)*4)throw Error('Token programme owner/layout differs');
 const b=Buffer.from(a.data[0],'base64');if(b.length>MAX_DATA||b.toString('base64')!==a.data[0])throw Error('Canonical token programme bytes required');return b;
}
async function rpc(url,method,params,fetcher){
 const r=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
 if(!r.ok||!r.body)throw Error('Token code RPC unavailable');
 const reader=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_WIRE)throw Error('Token code response exceeds bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel();reader.releaseLock();}
 const w=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(w.jsonrpc!=='2.0'||w.id!==1||w.error||!Object.hasOwn(w,'result'))throw Error('Token code RPC rejected');return w.result;
}
function snapshot(s,p,minimum){
 if(slot(s?.context?.slot)<minimum||!Array.isArray(s.value)||s.value.length!==2)throw Error('Finalized token snapshot missing or stale');
 const program=bytes(s.value[0],true),data=bytes(s.value[1],false);
 if(program.length!==36||program.readUInt32LE()!==2||!program.subarray(4).equals(key(DATA).toBuffer()))throw Error('Token ProgramData pointer differs');
 if(data.length<45+p.elfBytes||data.readUInt32LE()!==3||hash(data)!==p.programDataSHA256)throw Error('Token ProgramData differs from selected pin');
 if(p.upgradeAuthority===null?data[12]!==0:data[12]!==1||!data.subarray(13,45).equals(key(p.upgradeAuthority).toBuffer()))throw Error('Token upgrade authority differs');
 if(data.subarray(45,49).toString('hex')!=='7f454c46'||hash(data.subarray(45,45+p.elfBytes))!==p.elfSHA256||data.subarray(45+p.elfBytes).some(v=>v!==0))throw Error('Token ELF or trailing capacity differs');
 return s.context.slot;
}
export async function observeOriginTokenCode({rpc:address,pins,minimumContextSlot=0},fetcher=fetch){
 const url=endpoint(address),p=normalize(pins);minimumContextSlot=slot(minimumContextSlot);
 if(await rpc(url,'getGenesisHash',[],fetcher)!==p.genesis)throw Error('Token code genesis differs');
 const read=minimum=>rpc(url,'getMultipleAccounts',[[TOKEN_2022,DATA],{encoding:'base64',commitment:'finalized',minContextSlot:minimum}],fetcher);
 const first=snapshot(await read(minimumContextSlot),p,minimumContextSlot),last=snapshot(await read(first),p,first);
 if(await rpc(url,'getGenesisHash',[],fetcher)!==p.genesis)throw Error('Token code genesis changed');
 return {schemaVersion:1,state:'PINNED_PRIVATE_TOKEN_CODE',genesis:p.genesis,program:TOKEN_2022,programData:DATA,loader:LOADER,...p,firstContextSlot:first,contextSlot:last,snapshots:2,tokenCodeVerified:true,independentVerification:false,canSign:false,canBroadcast:false,productionReady:false};
}
export async function observeTokenPinnedOriginAssets({tokenPins,...options},fetcher=fetch){
 const pins=normalizeProgramPins(options.pins),selected=normalize(tokenPins);options={...options,pins};
 if(pins.side!==0||selected.genesis!==pins.genesis)throw Error('Origin asset and token-code identities differ');
 // Snapshot scalar expectations before awaiting, as well as the immutable pins.
 const before=await observeOriginTokenCode({rpc:options.rpc,pins:selected,minimumContextSlot:options.minimumContextSlot??0},fetcher);
 const assets=await observeOriginAssets({...options,minimumContextSlot:before.contextSlot},fetcher);
 const after=await observeOriginTokenCode({rpc:options.rpc,pins:selected,minimumContextSlot:assets.finalCodeContextSlot},fetcher);
 return {...assets,scope:'Private origin mint/escrow snapshots bracketed by selected Token-2022 and bridge code; not complete backing or historical upgrade proof',tokenCodeVerified:true,tokenCodeBoundaries:2,tokenCode:after,finalTokenContextSlot:after.contextSlot};
}
