// Future private rehearsal preparation with mandatory durable source capture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {captureInitialSourceConfirmation} from './source-confirmation-capture.mjs';
import {normalizeProgramPins} from './program-pins.mjs';
import {claimPinPolicy} from './claim-pin-policy.mjs';
import {prepareReviewedPendingClaim} from './pending-claim.mjs';
import {encodeEvent} from './sdk.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function prepareReviewedClaimWithSourceCapture(options,fetcher=fetch){
 assert(options&&typeof options==='object'&&!Array.isArray(options));assert.deepEqual(Object.keys(options).sort(),['claim','source']);const {source,claim}=options;assert(source&&claim);const selectedSource={...source,pins:normalizeProgramPins(source.pins)},selected=structuredClone({...claim,payer:new PublicKey(claim.payer).toBase58(),committee:claim.committee.map(p=>new PublicKey(p).toBase58()),originMint:claim.originMint?new PublicKey(claim.originMint).toBase58():null,destinationToken:claim.destinationToken?new PublicKey(claim.destinationToken).toBase58():null,transaction:Buffer.from(claim.transaction)});
 const a=resolve(selectedSource.evidenceDirectory),b=resolve(selected.directory);assert(a!==b&&!a.startsWith(b+'/')&&!b.startsWith(a+'/'),'Source evidence and claim journal must be disjoint');for(const p of [a,b]){const s=fs.lstatSync(p);assert(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync(p)===p&&s.uid===process.getuid()&&(s.mode&0o777)===0o700);}
 for(const value of [selected.sourceRpc,selected.rpc]){const u=new URL(value);assert(['http:','https:'].includes(u.protocol)&&['127.0.0.1','[::1]'].includes(u.hostname)&&u.port&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password);}
 assert.equal(new URL(selected.sourceRpc).href,new URL(selectedSource.rpc).href);assert.notEqual(new URL(selected.rpc).href,new URL(selectedSource.rpc).href);assert.equal(selected.event.sourceEvent,selectedSource.sourceEvent);const pins=claimPinPolicy(selected.programmePins,selected.event,selected.originMint);assert.deepEqual(pins.source,selectedSource.pins);
 const eventHash=hash(encodeEvent(selected.event)),capture=await captureInitialSourceConfirmation(selectedSource,fetcher);assert(capture.captureCompleted&&capture.rawResponseRetainedBeforeCollection&&capture.initialSourceFinalizedRPCStatusObserved);assert.equal(capture.eventSHA256,eventHash);assert(capture.sourceSnapshotContextSlot>=selected.sourceContextSlot);assert.equal(capture.canPrepareProductionClaim,false);
 const operation=prepareReviewedPendingClaim(selected);assert.equal(operation.state,'PREPARED');assert.equal(operation.attempts,0);return {capture,operation,sourceCaptureRequired:true,sourceEconomicMovementsIndependentlyVerified:false,canSign:false,canBroadcast:false,settlementAccepted:false,productionReady:false};
}
