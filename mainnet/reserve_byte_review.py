"""One fresh offline allocation-byte review on the separate compiler worker."""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,subprocess,stat
from genesis_authority_review import WORKER
from process_admission import no_active_validator
from offline_process import run_tool
ROOT=Path('/data/reserve-byte-review-v2')
CORE={'agave-validator':'34e468747f1a0d69399b61fd40edc32ce4690ec5a200b5684474aa60a97a6910','solana-test-validator':'3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a','solana':'6a880f1c79ec0e0d7b3ee972eaa9ad8d75b503616e1f0c29efa587137a129dcd','solana-keygen':'2f00a742ab0d99cad929e7a82b2d80f7c519cab9038ec45844fdbe9c305dea65'}
def selected_file(path,expected,limit):
 path=Path(path)
 if path.resolve()!=path or not isinstance(expected,str) or not re.fullmatch('[a-f0-9]{64}',expected):raise ValueError('EXACT_SELECTED_REGULAR_FILE_REQUIRED')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_mode&0o022 or not 0<before.st_size<=limit:raise ValueError('SELECTED_FILE_ADMISSION_FAILED')
  with os.fdopen(fd,'rb',closefd=False) as stream:data=stream.read(limit+1)
  after=os.fstat(fd)
  if len(data)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or path.resolve()!=path or hashlib.sha256(data).hexdigest()!=expected:raise ValueError('SELECTED_FILE_CHANGED')
  return data
 finally:os.close(fd)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def admit(root,environment):
 if any(environment.get(k)!=v for k,v in WORKER.items()):raise ValueError('EXACT_SEPARATE_WORKER_REQUIRED')
 if root!=ROOT or root.resolve()!=root or not root.is_dir() or root.is_symlink() or root.stat().st_uid!=os.getuid() or stat.S_IMODE(root.stat().st_mode)!=0o700:raise ValueError('EXACT_PRIVATE_REVIEW_ROOT_REQUIRED')
 if any((root/n).exists() or (root/n).is_symlink() for n in ['attempt.json','decoded-private.json','integration-result-private.json','target']):raise ValueError('RETAINED_REVIEW_MUST_NOT_BE_REUSED')
def sources(root,manifest):
 if not isinstance(manifest,dict) or not manifest:raise ValueError('EXACT_PUBLIC_SOURCES_REQUIRED')
 for name,digest in manifest.items():
  p=Path(name)
  if p.is_absolute() or '..' in p.parts:raise ValueError('RELATIVE_PUBLIC_SOURCE_REQUIRED')
  selected_file(root/p,digest,2*1024**2)
def dependencies(root):
 assert subprocess.check_output(['node','--version'],text=True,timeout=5).strip()=='v24.19.0'
 target=Path('/app/node_modules/@solana/web3.js');assert json.loads((target/'package.json').read_text())['version']=='1.99.0'
 parent=root/'node_modules/@solana';parent.mkdir(parents=True);(parent/'web3.js').symlink_to(target,target_is_directory=True)
def run(root,selection):
 admit(root,os.environ);os.umask(0o077);no_active_validator();manifest=json.loads((root/'public-source-hashes.json').read_text());sources(root,manifest)
 inputs=[(Path(selection[k]),selection[k+'_sha256'],limit) for k,limit in [('genesis',16*1024**2),('metadata',2*1024**2),('binary',32*1024**2)]]
 for item in inputs:selected_file(*item)
 if any(sha(Path('/data/target/release')/n)!=v for n,v in CORE.items()):raise ValueError('RUNTIME_ARTIFACTS_CHANGED')
 with (root/'attempt.json').open('x') as f:f.write('{"state":"running"}')
 result={'state':'running','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'validatorsStarted':0,'chainRequests':0,'privateKeysRead':0,'newGenesisCompiled':False,'hostChecksWeakened':False,'productionReady':False}
 def save():(root/'attempt.json').write_text(json.dumps(result,indent=2)+'\n')
 try:
  dependencies(root)
  os.environ['CARGO_TARGET_DIR']=str(root/'target');os.environ['CARGO_BUILD_JOBS']='2'
  for mode,timeout in [('test',420),('build',180)]:
   with (root/(mode+'-stderr-private.log')).open('xb') as log:out=run_tool(['cargo','+1.86.0',mode,'--offline','--locked','--manifest-path',str(root/'mainnet/genesis-allocation-bytes/Cargo.toml')],log,timeout=timeout,stdout_limit=2*1024**2)
   (root/(mode+'-stdout-private.log')).open('xb').write(out)
   if mode=='test':assert b'10 passed; 0 failed' in out,'EXACT_RUST_TEST_COUNT_REQUIRED'
  binary=root/'target/debug/classic-genesis-allocation-bytes';digest=sha(binary);selected_file(binary,digest,32*1024**2)
  genesis=selected_file(*inputs[0]);metadata=json.loads(selected_file(*inputs[1]));command=['sh','-c','exec < "$1"; shift; exec "$@"','allocation-byte-reader',str(inputs[0][0]),str(binary),'--isolated-genesis-stdin',metadata['genesisAudit']['genesis'],inputs[0][1]]
  with (root/'decode-stderr-private.log').open('xb') as log:decoded=run_tool(command,log,timeout=30,stdout_limit=8*1024**2)
  (root/'decoded-private.json').open('xb').write(decoded);(root/'review-selection-private.json').open('x').write(json.dumps({'decodedSHA256':hashlib.sha256(decoded).hexdigest(),'metadata':str(inputs[1][0])}))
  with (root/'integration-stderr-private.log').open('xb') as log:out=run_tool(['node',str(root/'mainnet/rehearsal/reserve-byte-input.mjs'),str(root)],log,timeout=30,stdout_limit=65536)
  (root/'integration-stdout-private.log').open('xb').write(out);summary=json.loads((root/'integration-result-private.json').read_text());assert summary['state']=='passed' and len(summary['checks'])==6
  for item in inputs:selected_file(*item)
  selected_file(binary,digest,32*1024**2);sources(root,manifest);no_active_validator();assert all(sha(Path('/data/target/release')/n)==v for n,v in CORE.items())
  result.update(state='passed',summary=summary,rustTestsPassed=10,selectedInputsUnchanged=True,publicSourcesUnchanged=True,originalRuntimeArtifactsUnchanged=True,privateValidatorCensusClear=True,artifact={'name':binary.name,'profile':'debug','sha256':digest,'bytes':binary.stat().st_size})
 except BaseException as e:
  result.update(state='failed',failureType=type(e).__name__,failureCode=str(e) if type(e) is ValueError and re.fullmatch('[A-Z_]+',str(e)) else 'OFFLINE_ALLOCATION_REVIEW_REFUSED')
 finally:result['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--selection',type=Path,required=True);a=p.parse_args();print(json.dumps(run(ROOT,json.loads(a.selection.read_text()))))
