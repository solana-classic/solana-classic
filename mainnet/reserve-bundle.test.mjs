import test,{before,after} from 'node:test';
import {reviewReserveBundleSyntax} from './reserve-bundle-syntax.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=mkdtempSync(join(tmpdir(),'reserve-build-check-'));
const output=join(directory,'bundle'),artifact=join(output,'reserve-byte-stdio.mjs');
const builder=fileURLToPath(new URL('./build-reserve-bundle.mjs',import.meta.url));
const options={cwd:directory,env:{PATH:process.env.PATH},encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let manifest,bytes;
before(()=>{
 const r=spawnSync(process.execPath,[builder,output],options);
 assert.ifError(r.error);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');
 manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));bytes=readFileSync(artifact);
 assert.equal(JSON.parse(r.stdout).sha256,hash(bytes));
});
after(()=>rmSync(directory,{recursive:true,force:true}));
test('built adapter runs all selected transport fixtures outside the checkout',()=>{
 assert.equal(manifest.artifact.sha256,hash(bytes));assert.equal(manifest.artifact.bytes,bytes.length);
 const ownRequire=createRequire(import.meta.url),toolRequire=createRequire(ownRequire.resolve('tsx/package.json'));
 const nativeRequire=createRequire(toolRequire.resolve('esbuild'));
 const nativePath=nativeRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`);
 for(const [record,path] of [[manifest.toolchain.node,process.execPath],[manifest.toolchain.bundler,nativePath]]){
  const contents=readFileSync(path);assert.equal(record.sha256,hash(contents));assert.equal(record.bytes,contents.length);
 }
 assert.equal(manifest.toolchain.node.version,process.version);assert.equal(manifest.toolchain.node.platform,process.platform);assert.equal(manifest.toolchain.node.arch,process.arch);
 assert.equal(manifest.toolchain.bundler.package,`@esbuild/${process.platform}-${process.arch}`);assert.equal(manifest.toolchain.bundler.version,'0.28.2');
 assert.equal(manifest.build.localRebuildIdentical,true);assert.equal(manifest.nativeAddonLoadersExcluded,true);
 assert.equal(manifest.commonJSImportsRestrictedToBuiltins,true);
 assert.equal(manifest.syntaxReview.noImportExpressions,true);assert.equal(manifest.syntaxReview.parserVersion,'5.9.3');
 const parserPath=ownRequire.resolve('typescript');assert.equal(manifest.syntaxReview.parserModuleSHA256,hash(readFileSync(parserPath)));
 assert.deepEqual(manifest.syntaxReview.staticModuleSpecifiers,reviewReserveBundleSyntax(bytes).staticModuleSpecifiers);
 for(const key of ['artifactAdmitted','preparerIntegrated','canSign','canBroadcast','mainnetActivated','productionReady'])assert.equal(manifest[key],false);
 assert(!Object.keys(manifest.inputs).some(p=>/node-gyp-build|\/bufferutil\/|\/utf-8-validate\//.test(p)));
 assert.deepEqual(readdirSync(output).sort(),['manifest.json','reserve-byte-stdio.mjs']);
 const suite=fileURLToPath(new URL('./reserve-byte-input.test.mjs',import.meta.url));
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',suite],{...options,env:{PATH:process.env.PATH,RESERVE_TEST_ARTIFACT:artifact}});
 assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stderr,'');
 assert.match(r.stdout,/# tests 23\b/);assert.match(r.stdout,/# pass 23\b/);assert.match(r.stdout,/# fail 0\b/);
});
test('generated CommonJS import guard refuses package and file resolution before execution',async()=>{
 const unexpected=join(directory,'unexpected.cjs');writeFileSync(unexpected,'throw new Error("UNEXPECTED_MODULE_EXECUTED");');
 const probe=join(output,'guard-probe.mjs');
 // Derived fixture exposes the actual generated guard, without modifying the artifact.
 writeFileSync(probe,Buffer.concat([bytes,Buffer.from('\nexport const probeRequire=id=>require(id);\n')]));
 const {probeRequire}=await import(pathToFileURL(probe).href);
 assert.equal(probeRequire('node:crypto').createHash('sha256').update('fixture').digest('hex'),hash('fixture'));
 for(const id of ['encoding','bufferutil','utf-8-validate',unexpected,'./unexpected.cjs',null,{}])assert.throws(()=>probeRequire(id),/^Error: RESERVE_BUNDLE_IMPORT_REFUSED$/);
 assert.equal(hash(readFileSync(artifact)),manifest.artifact.sha256);
});
test('builder refuses existing output and invalid arguments without replacing retained bytes',()=>{
 const before=new Map(readdirSync(output).map(name=>[name,hash(readFileSync(join(output,name)))]));
 for(const args of [[output],[],[output,'extra']]){
  const r=spawnSync(process.execPath,[builder,...args],options);
  assert.ifError(r.error);assert.equal(r.status,78);assert.equal(r.stdout,'');assert.equal(r.stderr,'RESERVE_BUNDLE_BUILD_REFUSED\n');
 }
 assert.deepEqual(new Map(readdirSync(output).map(name=>[name,hash(readFileSync(join(output,name)))])),before);
});

test('builder refuses binary overrides before executing them or creating output',()=>{
 const fake=join(directory,'unexpected-esbuild'),marker=join(directory,'override-invoked');
 writeFileSync(fake,'#!/bin/sh\nprintf invoked > "$RESERVE_OVERRIDE_MARKER"\nexit 1\n',{mode:0o700});
 for(const [index,value] of [fake,'/usr/bin/esbuild',''].entries()){
  const destination=join(directory,'override-output-'+index);
  const r=spawnSync(process.execPath,[builder,destination],{...options,env:{...options.env,ESBUILD_BINARY_PATH:value,RESERVE_OVERRIDE_MARKER:marker}});
  assert.ifError(r.error);assert.equal(r.status,78);assert.equal(r.stdout,'');assert.equal(r.stderr,'RESERVE_BUNDLE_BUILD_REFUSED\n');
  assert.equal(existsSync(marker),false,'unselected executable must not run');
  assert.equal(existsSync(destination),false,'refusal must precede output creation');
 }
});

test('syntax review rejects executable import expressions without evaluating fixture code',()=>{
 for(const source of [
  'import("node:fs")','import(packageName)','import(`./${name}.mjs`)',
  'const lazy=()=>import("https://invalid.example/module.mjs")',
  'if(false){import("./unused.mjs")}',
  'import /* comment */ ("data:text/javascript,export default 1")',
  'const lazy=()=>import(name,{with:{type:"json"}})',
 ])assert.throws(()=>reviewReserveBundleSyntax(Buffer.from(source)),/Dynamic import syntax refused/);
 for(const source of ['import x from "external-package"','export * from "./external.mjs"','export {x} from "external-package"'])assert.throws(()=>reviewReserveBundleSyntax(Buffer.from(source)),/Static external package refused/);
});
test('syntax review distinguishes inert text, checks syntax and bounds exact bytes',()=>{
 const source='import fs from "node:fs"; export {createHash} from "node:crypto"; const text="import(packageName)"; const pattern=/import\\(.*\\)/; /* import("ignored") */';
 assert.deepEqual(reviewReserveBundleSyntax(Buffer.from(source)).staticModuleSpecifiers,['node:crypto','node:fs']);
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(4*1024*1024+1),'import("x")'])assert.throws(()=>reviewReserveBundleSyntax(bytes),/Bounded bundle bytes required/);
 assert.throws(()=>reviewReserveBundleSyntax(Buffer.from([0xff])),TypeError);
 assert.throws(()=>reviewReserveBundleSyntax(Buffer.from('import(')),/Bundle syntax refused/);
});


test('built adapter crosses the selected preparation boundary with genuine plan and refusal responses',()=>{
 const driver=fileURLToPath(new URL('./reserve_preparation_interop_fixture.py',import.meta.url));
 const result=spawnSync('python3',['-B',driver,process.execPath,artifact],{...options,timeout:45000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
 const report=JSON.parse(result.stdout);
 assert.equal(report.passed,true);assert.equal(report.realAdapterInvocations,5);assert.equal(report.plannerInvocations,3);
 assert.deepEqual(report.cases.map(row=>row.result.state),['prepared','failed','failed']);
 assert.deepEqual(report.cases.map(row=>row.result.compilerCalls),[1,0,1]);
 assert.deepEqual(report.cases.map(row=>row.result.replayCalls),[4,0,0]);
 assert.equal(report.artifacts.node.sha256,manifest.toolchain.node.sha256);
 assert.equal(report.artifacts.bundle.sha256,manifest.artifact.sha256);
 for(const field of ['actualGenesisCompiled','actualAccountBytesDecoded','actualSlotZeroReplayExecuted','hostAdmitted','productionReady'])assert.equal(report[field],false);
 assert.equal(report.validatorsStarted,0);
 assert.equal(hash(readFileSync(artifact)),manifest.artifact.sha256);
});
