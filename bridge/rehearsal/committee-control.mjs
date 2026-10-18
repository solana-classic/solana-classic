// Read-only declared control analysis of a retained synthetic fixture roster.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {reviewCommitteeControl} from './committee-control.mjs';
import {reviewRetainedSourceCapture,retainedSourceCaptureDigest} from './retained-source-capture.mjs';
import {inspectReturnedProgramSnapshot} from './event-inventory.mjs';
const root=process.cwd(),hash=b=>createHash('sha256').update(b).digest('hex');
for(const [name,value] of Object.entries({RAILWAY_PROJECT_ID:'356bcb0b-49c4-4bd3-bf10-bff7db8f33fe',RAILWAY_ENVIRONMENT_ID:'3367b373-2332-4702-8cce-c12b8f03949e',RAILWAY_SERVICE_ID:'29189101-226c-483b-a424-b8cd140abd80'}))assert.equal(process.env[name],value);
const owned=path=>{const s=fs.lstatSync(path);assert(s.isDirectory()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&!s.isSymbolicLink()&&fs.realpathSync(path)===path);};owned(root);
const read=path=>{const s=fs.lstatSync(path);assert(s.isFile()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600&&!s.isSymbolicLink()&&s.size>0&&s.size<=1048576);return JSON.parse(fs.readFileSync(path));};
const save=(name,value)=>{const fd=fs.openSync(join(root,name),'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
save('attempt.json',{state:'admitting',scope:'retained synthetic roster declaration only'});
try{
 const config=read(join(root,'private-config.json'));assert.deepEqual(Object.keys(config).sort(),['anchorsDirectory','sourceDirectory']);for(const path of Object.values(config)){assert(resolve(path)===path&&path.startsWith('/data/')&&path!==root&&!path.startsWith(root+'/')&&!root.startsWith(path+'/'));owned(path);}
 const sources=read(join(root,'public-source-hashes.json'));assert(Object.entries(sources).every(([name,pin])=>hash(fs.readFileSync(join(root,name)))===pin));
 const anchors=read(join(config.anchorsDirectory,'selection-anchor-private.json'));assert.equal(anchors.length,2);const rosters=[];
 for(const [side,a] of anchors.entries()){
  assert.equal(a.side,side);const directory=join(config.sourceDirectory,'source-capture-'+side),receiptPath=join(config.sourceDirectory,'transaction-source-'+side+'-private.json');assert.equal(hash(fs.readFileSync(receiptPath)),a.receiptSHA256);const receipt=read(receiptPath);
  const verified=reviewRetainedSourceCapture({directory,expectedSHA256:a.expectedSHA256,pins:a.pins,transactionBase64:receipt.rawBase64,sourceEvent:a.sourceEvent,minimumContextSlot:a.minimumContextSlot});assert(verified.retainedSelectedEconomicMetadataMatched&&!verified.productionReady);
  const o=read(join(directory,'observation.json')).observation,inspected=inspectReturnedProgramSnapshot(o.privateSourceSnapshot,a.pins,a.minimumContextSlot);rosters.push(inspected.policy.committee.slice().sort());
 }
 assert.deepEqual(rosters[0],rosters[1]);
 const declaration={schemaVersion:1,scope:'declared-private-committee-controls-v1',threshold:3,members:rosters[0].map(publicKey=>({publicKey,operator:'fixture-owner',controllers:['fixture-signing','fixture-recovery'],availabilityDomains:['fixture-host']}))};
 const result=reviewCommitteeControl({expectedCommittee:rosters[0],declaration,requirements:{minimumOperatorsForQuorum:3,minimumControllersForQuorum:3,minimumDomainsForOutage:2}});
 assert.deepEqual(result.findings,['DECLARED_OPERATOR_CONCENTRATION','DECLARED_SIGNING_OR_RECOVERY_CONCENTRATION','DECLARED_AVAILABILITY_CONCENTRATION']);assert.equal(result.declaredRequirementsMet,false);for(const field of ['smallestDeclaredOperatorQuorum','smallestDeclaredControllerQuorum','smallestDeclaredOutage'])assert.equal(result[field].domainCount,1);
 for(const [side,a] of anchors.entries())assert.equal(retainedSourceCaptureDigest(join(config.sourceDirectory,'source-capture-'+side)).sha256,a.expectedSHA256);assert(Object.entries(sources).every(([name,pin])=>hash(fs.readFileSync(join(root,name)))===pin));
 save('private-result.json',{state:'passed',at:new Date().toISOString(),scope:'Actual retained synthetic committee keys with an explicit same-owner declaration; not verified operator identities or custody',checks:4,result,retainedCapturesMatched:2,bothSourcePoliciesShareSelectedRoster:true,originalCaptureFilesUnchanged:true,publicSourceHashesUnchanged:true,validatorStarts:0,chainRPCRequests:0,keysCreated:0,submissions:0,canonicalNetworkChanged:false,productionReady:false});
 fs.writeFileSync(join(root,'attempt.json'),JSON.stringify({state:'passed',checks:4,chainRPCRequests:0,submissions:0}));
}catch(error){save('failure-private.json',{state:'failed',failure:String(error.message).slice(0,500)});fs.writeFileSync(join(root,'attempt.json'),JSON.stringify({state:'failed'}));throw error;}
