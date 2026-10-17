// Read-only review binding. No signing, journal access, handoff or broadcast.
import {createHash} from 'node:crypto';
import {normalizeProgramPins} from './program-pins.mjs';
import {checkedOriginTokenCodePins,observeTokenPinnedOriginAssets} from './origin-token-code.mjs';
const SCOPE='private-reviewed-metadata-origin-v1';
const fields=['schemaVersion','scope','pins','tokenPins','expectedSupplyUnits','expectedDecimals','expectedMintDataSHA256','sha256'];
const hash=value=>createHash('sha256').update('solana-classic/private-reviewed-metadata-origin/v1\0').update(JSON.stringify(value)).digest('hex');
export function reviewedOriginMintPolicy({pins,tokenPins,expectedSupplyUnits,expectedDecimals,expectedMintDataSHA256}){
 pins=normalizeProgramPins(pins);tokenPins=checkedOriginTokenCodePins(tokenPins);
 if(['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'].some(k=>pins[k]==='11111111111111111111111111111111'))throw Error('Nonzero reviewed origin identities required');
 if(pins.side!==0||tokenPins.genesis!==pins.genesis)throw Error('Reviewed origin and token code must select the same private chain');
 if(typeof expectedSupplyUnits!=='string'||! /^(0|[1-9][0-9]*)$/.test(expectedSupplyUnits)||expectedSupplyUnits.length>20||BigInt(expectedSupplyUnits)===0n||BigInt(expectedSupplyUnits)>(1n<<64n)-1n)throw Error('Exact positive reviewed u64 mint supply required');
 if(!Number.isInteger(expectedDecimals)||expectedDecimals<0||expectedDecimals>9)throw Error('Reviewed mint precision required');
 if(typeof expectedMintDataSHA256!=='string'||! /^[0-9a-f]{64}$/.test(expectedMintDataSHA256))throw Error('Independently selected complete mint digest required');
 const selected={schemaVersion:1,scope:SCOPE,pins,tokenPins,expectedSupplyUnits,expectedDecimals,expectedMintDataSHA256};
 return Object.freeze({...selected,sha256:hash(selected)});
}
export function checkedReviewedOriginMintPolicy(value){
 if(!value||Array.isArray(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k))||value.schemaVersion!==1||value.scope!==SCOPE)throw Error('Exact reviewed metadata origin policy required');
 const selected=reviewedOriginMintPolicy(value);
 if(value.sha256!==selected.sha256)throw Error('Reviewed metadata origin policy digest changed');
 return selected;
}
export async function observeReviewedOriginAssets({rpc,policy,minimumContextSlot=0},fetcher=fetch){
 // Capture all selected scalar/code expectations before the first asynchronous read.
 const selected=checkedReviewedOriginMintPolicy(policy);
 const observation=await observeTokenPinnedOriginAssets({rpc,pins:selected.pins,tokenPins:selected.tokenPins,expectedSupplyUnits:selected.expectedSupplyUnits,expectedDecimals:selected.expectedDecimals,minimumContextSlot,mintPolicy:'immutable-self-metadata-v1'},fetcher);
 if(observation.mintLayout!=='immutable-self-metadata-v1'||observation.mintDataSHA256!==selected.expectedMintDataSHA256)throw Error('Observed mint bytes differ from independently reviewed metadata policy');
 return {...observation,scope:'Read-only private metadata origin observation bound to a selected review digest; not a claim-journal handoff or settlement approval',reviewedMintPolicySHA256:selected.sha256};
}
