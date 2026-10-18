// Offline inventory metadata review. No account data, keys, RPC or mutations.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
const SYSTEM='11111111111111111111111111111111';
const STAKE='Stake11111111111111111111111111111111111111';
const VOTE='Vote111111111111111111111111111111111111111';
const forbidden=new Set(['7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',SYSTEM]);
const protocolOwners=new Set(['Feature111111111111111111111111111111111111','Sysvar1111111111111111111111111111111111111','Config1111111111111111111111111111111111111','NativeLoader1111111111111111111111111111111']);
const U64=(1n<<64n)-1n;
const compare=(a,b)=>a<b?-1:a>b?1:0;
function address(v){if(typeof v!=='string'||v.length>44||new PublicKey(v).toBase58()!==v)throw Error('Canonical inventory address required');return v;}
function units(v){if(typeof v!=='string'||v.length>20||!/^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>U64)throw Error('Exact inventory u64 string required');return BigInt(v);}
function digest(v){if(typeof v!=='string'||! /^[a-f0-9]{64}$/.test(v))throw Error('Externally selected metadata digest required');return v;}
function normalize(g){
 if(g?.clusterType!=='development'||forbidden.has(g?.genesis))throw Error('Only fresh isolated development genesis metadata is supported');
 const genesis=address(g.genesis);
 if(!Number.isSafeInteger(g.accountCount)||g.accountCount<1||g.accountCount>4096||!Array.isArray(g.accounts)||g.accounts.length!==g.accountCount)throw Error('Complete bounded genesis metadata required');
 const seen=new Set();let total=0n;
 const accounts=g.accounts.map(a=>{
  if(!a||Object.keys(a).length!==5||!['address','owner','lamports','dataBytes','executable'].every(k=>Object.hasOwn(a,k)))throw Error('Exact inventory metadata row required');
  const row={address:address(a.address),owner:address(a.owner),lamports:units(a.lamports).toString(),dataBytes:a.dataBytes,executable:a.executable};
  if(seen.has(row.address))throw Error('Duplicate inventory account');seen.add(row.address);
  if(!Number.isSafeInteger(row.dataBytes)||row.dataBytes<0||row.dataBytes>10485760||typeof row.executable!=='boolean')throw Error('Bounded account layout metadata required');
  total+=BigInt(row.lamports);return row;
 }).sort((a,b)=>compare(a.address,b.address));
 if(total>U64||total!==units(g.totalLamports))throw Error('Complete inventory sum differs or exceeds u64');
 return {schemaVersion:1,scope:'isolated-genesis-account-metadata-v1',genesis,accountCount:accounts.length,totalLamports:total.toString(),accounts};
}
function fingerprint(normalized){return createHash('sha256').update('classic-genesis-custody-metadata-v1\0').update(JSON.stringify(normalized)).digest('hex');}
// Computing an anchor from these same rows does not independently verify them.
export function genesisInventoryMetadataDigest(genesisAudit){return fingerprint(normalize(genesisAudit));}
export function reviewGenesisCustody({genesisAudit,expectedGenesis,expectedInventorySHA256,reserveAddress,bridgeProgram,bridgeId}){
 const n=normalize(genesisAudit);
 if(n.genesis!==address(expectedGenesis)||fingerprint(n)!==digest(expectedInventorySHA256))throw Error('Selected genesis or inventory metadata differs');
 reserveAddress=address(reserveAddress);bridgeProgram=address(bridgeProgram);bridgeId=address(bridgeId);
 if([SYSTEM,STAKE,VOTE,...protocolOwners].includes(bridgeProgram)||bridgeId===SYSTEM||bridgeProgram===bridgeId)throw Error('Distinct selected bridge programme and bridge identity required');
 const config=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(bridgeId).toBuffer()],new PublicKey(bridgeProgram))[0];
 const expectedReserve=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],new PublicKey(bridgeProgram))[0].toBase58();
 const reserve=n.accounts.find(a=>a.address===reserveAddress);
 if(!reserve||BigInt(reserve.lamports)===0n)throw Error('Selected funded reserve account required');
 const groups={};
 for(const a of n.accounts){
  const category=a.owner===SYSTEM?(a.dataBytes===0&&!a.executable&&PublicKey.isOnCurve(new PublicKey(a.address).toBytes())?'system-signature-metadata':'other-system-metadata'):a.owner===STAKE?'stake-authorities-unread':a.owner===VOTE?'vote-authorities-unread':protocolOwners.has(a.owner)?'protocol-controls-unreviewed':'other-program-controls-unreviewed';
  groups[category]??={accounts:0,nativeUnits:0n};groups[category].accounts++;groups[category].nativeUnits+=BigInt(a.lamports);
 }
 const addressMatches=reserve.address===expectedReserve,ownerMatches=reserve.owner===bridgeProgram,layoutMatches=reserve.dataBytes===16,nonExecutable=reserve.executable===false;
 const reserveMetadataMatches=addressMatches&&ownerMatches&&layoutMatches&&nonExecutable;
 const findings=[];
 if(!addressMatches)findings.push('RESERVE_IS_NOT_SELECTED_BRIDGE_VAULT');
 if(!ownerMatches)findings.push('RESERVE_NOT_OWNED_BY_SELECTED_BRIDGE');
 if(!layoutMatches)findings.push('RESERVE_V2_LAYOUT_LENGTH_DIFFERS');
 if(!nonExecutable)findings.push('RESERVE_IS_EXECUTABLE');
 if(reserve.owner===SYSTEM)findings.push('SYSTEM_RESERVE_REQUIRES_SEPARATE_CUSTODY');
 for(const category of ['stake-authorities-unread','vote-authorities-unread','protocol-controls-unreviewed','other-program-controls-unreviewed'])if(groups[category])findings.push(category.toUpperCase().replaceAll('-','_'));
 return {schemaVersion:1,state:'GENESIS_CUSTODY_METADATA_REVIEW',scope:'Offline classification of selected supplied genesis account metadata; no account-byte decoding or control verification',
  genesis:n.genesis,inventoryMetadataSHA256:fingerprint(n),accountCount:n.accountCount,totalNativeUnits:n.totalLamports,
  groups:Object.fromEntries(Object.entries(groups).sort(([a],[b])=>compare(a,b)).map(([k,v])=>[k,{accounts:v.accounts,nativeUnits:String(v.nativeUnits)}])),
  reserve:{address:reserve.address,expectedAddress:expectedReserve,owner:reserve.owner,expectedOwner:bridgeProgram,nativeUnits:reserve.lamports,dataBytes:reserve.dataBytes,expectedDataBytes:16,addressMatches,ownerMatches,layoutMatches,nonExecutable,systemOwned:reserve.owner===SYSTEM,onCurveAddress:PublicKey.isOnCurve(new PublicKey(reserve.address).toBytes())},
  findings,inventoryMetadataMatched:true,classificationReconciled:true,reserveMetadataMatches,
  actualGenesisDecoded:false,inventoryAccountBytesVerified:false,reserveDataVerified:false,reserveCustodyVerified:false,allAccountAuthoritiesVerified:false,stakeWithdrawalAuthoritiesVerified:false,voteWithdrawalAuthoritiesVerified:false,programmeUpgradeControlsVerified:false,genesisBackingVerified:false,fullValidatorConsensusVerified:false,independentVerification:false,canPrepare:false,canSign:false,canBroadcast:false,activationEnabled:false,productionReady:false};
}
