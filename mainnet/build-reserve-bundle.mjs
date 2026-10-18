// Offline build only. The resulting artifact still requires runtime admission.
import {createRequire,builtinModules} from 'node:module';
import {readFileSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {endianness} from 'node:os';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(import.meta.url);
const BANNER='import {createRequire as bundleRequire,isBuiltin as bundleIsBuiltin} from "node:module";const nativeRequire=bundleRequire(import.meta.url);const require=id=>{if(typeof id!=="string"||!bundleIsBuiltin(id))throw new Error("RESERVE_BUNDLE_IMPORT_REFUSED");return nativeRequire(id);};';
const sourcePaths=['mainnet/build-reserve-bundle.mjs','mainnet/reserve-bundle-syntax.mjs','package.json','pnpm-lock.yaml','pnpm-workspace.yaml'];
function fingerprint(name){
 if(isAbsolute(name)||name.split('/').includes('..'))throw new Error('Input path refused');
 const actual=realpathSync(resolve(root,name)),local=relative(root,actual);
 if(isAbsolute(local)||local==='..'||local.startsWith('../'))throw new Error('Input outside source root');
 return hash(readFileSync(actual));
}
function inputs(result){
 if(result.warnings.length)throw new Error('Bundler warning requires review');
 return Object.fromEntries(Object.keys(result.metafile.inputs).sort().map(name=>{
  if(!name.startsWith('mainnet/')&&!name.startsWith('node_modules/'))throw new Error('Unexpected build input');
  return [name,fingerprint(name)];
 }));
}
function externals(result){
 const names=[...new Set(['node:module',...Object.values(result.metafile.outputs).flatMap(output=>output.imports.map(item=>{
  if(!item.external||(!builtinModules.includes(item.path)&&!builtinModules.includes(item.path.replace(/^node:/,''))))throw new Error('External package refused');
  return item.path;
 }))])].sort();
 return names;
}
export async function buildReserveBundle(){
 if(Object.hasOwn(process.env,'ESBUILD_BINARY_PATH'))throw new Error('Bundler binary override refused');
 if(!['linux','darwin'].includes(process.platform)||!['x64','arm64'].includes(process.arch)||endianness()!=='LE')throw new Error('Reviewed build platform required');
 if(process.version!=='v24.19.0')throw new Error('Selected Node version required');
 const parserPath=require.resolve('typescript'),parserHash=hash(readFileSync(parserPath));
 const {reviewReserveBundleSyntax}=await import('./reserve-bundle-syntax.mjs');
 const toolRequire=createRequire(require.resolve('tsx/package.json'));
 const toolPath=toolRequire.resolve('esbuild'),esbuild=toolRequire('esbuild');
 if(esbuild.version!=='0.28.2')throw new Error('Selected bundler version required');
 const toolHash=hash(readFileSync(toolPath));
 // Require the installed native package; do not accept the downloader fallback.
 const nativePackage=`@esbuild/${process.platform}-${process.arch}`;
 const nativeRequire=createRequire(toolPath);
 const nativePath=nativeRequire.resolve(`${nativePackage}/bin/esbuild`);
 const nativeMetadata=nativeRequire(`${nativePackage}/package.json`);
 if(nativeMetadata.version!==esbuild.version)throw new Error('Native bundler version differs');
 const executablePaths=[process.execPath,nativePath].map(p=>realpathSync(p));
 const executableRecords=()=>executablePaths.map(p=>{const bytes=readFileSync(p);return {bytes:bytes.length,sha256:hash(bytes)};});
 const executableBefore=executableRecords();
 const toolchain={node:{version:process.version,platform:process.platform,arch:process.arch,...executableBefore[0]},bundler:{package:nativePackage,version:nativeMetadata.version,...executableBefore[1]}};
 const selected=Object.fromEntries(sourcePaths.map(p=>[p,fingerprint(p)]));
 const options={absWorkingDir:root,entryPoints:['mainnet/reserve-byte-stdio.mjs'],bundle:true,write:false,platform:'node',target:'node24',format:'esm',mainFields:['browser','module','main'],define:{'process.env.WS_NO_BUFFER_UTIL':'"1"','process.env.WS_NO_UTF_8_VALIDATE':'"1"'},metafile:true,logLevel:'silent',banner:{js:BANNER}};
 const first=await esbuild.build(options),before=inputs(first),external=externals(first);
 if(Object.keys(before).some(p=>/node-gyp-build|\/bufferutil\/|\/utf-8-validate\//.test(p)))throw new Error('Native addon loader retained');
 const second=await esbuild.build(options),after=inputs(second);
 if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(external)!==JSON.stringify(externals(second)))throw new Error('Build inputs changed');
 if(sourcePaths.some(p=>selected[p]!==fingerprint(p))||toolHash!==hash(readFileSync(toolPath)))throw new Error('Build selection changed');
 if(JSON.stringify(executableBefore)!==JSON.stringify(executableRecords())||realpathSync(process.execPath)!==executablePaths[0]||realpathSync(nativePath)!==executablePaths[1])throw new Error('Build executable changed');
 if(first.outputFiles.length!==1||second.outputFiles.length!==1)throw new Error('Unexpected output set');
 const bytes=Buffer.from(first.outputFiles[0].contents);
 if(hash(bytes)!==hash(second.outputFiles[0].contents))throw new Error('Local rebuild differs');
 const syntaxReview=reviewReserveBundleSyntax(bytes);
 if(parserHash!==hash(readFileSync(parserPath)))throw new Error('Syntax parser changed');
 const manifest={schemaVersion:1,scope:'offline-reserve-adapter-bundle-v1',artifact:{file:'reserve-byte-stdio.mjs',bytes:bytes.length,sha256:hash(bytes)},build:{node:process.version,esbuild:esbuild.version,esbuildModuleSHA256:toolHash,platform:options.platform,target:options.target,format:options.format,mainFields:options.mainFields,defines:options.define,localRebuildIdentical:true},toolchain,syntaxReview:{...syntaxReview,parserModuleSHA256:parserHash},selectedFiles:selected,inputs:before,staticExternalImports:external,commonJSImportsRestrictedToBuiltins:true,nativeAddonLoadersExcluded:true,artifactAdmitted:false,preparerIntegrated:false,canSign:false,canBroadcast:false,mainnetActivated:false,productionReady:false};
 return {bytes,manifest};
}
export async function writeReserveBundle(directory){
 const {bytes,manifest}=await buildReserveBundle();
 // Exclusive directory creation preserves prior outputs, including failed attempts.
 mkdirSync(directory,{mode:0o700});
 writeFileSync(resolve(directory,'reserve-byte-stdio.mjs'),bytes,{flag:'wx',mode:0o600});
 writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return manifest;
}
function isEntrypoint(){try{return !!process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href;}catch{return false;}}
if(isEntrypoint()){
 try{
  if(process.argv.length!==3)throw new Error('One new output directory required');
  const manifest=await writeReserveBundle(process.argv[2]);
  process.stdout.write(JSON.stringify({sha256:manifest.artifact.sha256,artifactAdmitted:false,preparerIntegrated:false})+'\n');
 }catch{process.stderr.write('RESERVE_BUNDLE_BUILD_REFUSED\n');process.exitCode=78;}
}
