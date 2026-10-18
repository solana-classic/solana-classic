// Separate offline reviews of original and archive-restored capture bundles.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {retainedSourceCaptureDigest,reviewRetainedSourceCapture} from './retained-source-capture.mjs';
const root=process.cwd(),phase=process.argv[2],hash=b=>createHash('sha256').update(b).digest('hex');assert(['baseline','restored'].includes(phase));
const write=(name,value)=>{const fd=fs.openSync(join(root,name),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
write('phase-'+phase+'-reserved-private.json',{phase});
const bundle=join(root,phase==='baseline'?'working':'restored');
const select=i=>{const directory=join(bundle,'capture-'+i),receipt=fs.readFileSync(join(bundle,'source-receipt-'+i+'.json')),s=JSON.parse(fs.readFileSync(join(directory,'selection.json'))).selection;return {side:i,pins:s.pins,sourceEvent:s.sourceEvent,minimumContextSlot:s.minimumSelectedContextSlot,expectedSHA256:retainedSourceCaptureDigest(directory).sha256,receiptSHA256:hash(receipt)};};
const anchors=phase==='baseline'?[select(0),select(1)]:JSON.parse(fs.readFileSync(join(root,'selection-anchor-private.json')));assert.equal(anchors.length,2);
if(phase==='baseline')write('selection-anchor-private.json',anchors);
const results=anchors.map((a,i)=>{assert.equal(a.side,i);const directory=join(bundle,'capture-'+i),receipt=fs.readFileSync(join(bundle,'source-receipt-'+i+'.json'));assert.equal(hash(receipt),a.receiptSHA256);const r=reviewRetainedSourceCapture({directory,expectedSHA256:a.expectedSHA256,pins:a.pins,sourceEvent:a.sourceEvent,minimumContextSlot:a.minimumContextSlot,transactionBase64:JSON.parse(receipt).rawBase64});assert.equal(r.side,i);assert.equal(r.state,'retained-selected-capture-matched');assert.equal(r.rpcObservationExecuted,false);assert.equal(r.productionReady,false);return r;});
write('phase-'+phase+'-result-private.json',{state:'passed',results,chainRPCRequests:0,submissions:0});
