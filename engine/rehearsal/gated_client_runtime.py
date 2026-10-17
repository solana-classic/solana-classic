"""Fresh in-memory gated-program execution on the separate compiler worker."""
from pathlib import Path
import argparse,datetime,hashlib,importlib.util,json,os,re,stat
PROJECT='356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
ENVIRONMENT='3367b373-2332-4702-8cce-c12b8f03949e'
SERVICE='29189101-226c-483b-a424-b8cd140abd80'
FILES={'bridge/program/Cargo.toml','bridge/program/src/lib.rs','bridge/program/src/state.rs','bridge/gated-program/Cargo.toml','bridge/gated-program/Cargo.lock','bridge/gated-program/src/lib.rs','bridge/gated-program/tests/runtime.rs','bridge/gated-program/artifact-sha256.txt','mainnet/offline_process.py','mainnet/process_admission.py','.tools/bridge-gated-artifacts/classic_bridge_gated_program.so','.tools/programs/spl_token_2022-v10.0.0.so','engine/rehearsal/gated_client_runtime.py','bridge/gated-native.mjs','bridge/gated-native.test.mjs','bridge/rehearsal/gated-native-wire.mjs','bridge/sdk.mjs','bridge/bootstrap.mjs','bridge/program-pins.mjs','mainnet/bootstrap.mjs'}
CLIENT_DEPENDENCY_VERSION='1.99.0'
NODE_VERSION='v24.19.0'
TOKEN='a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68'
CORE={'agave-validator':'34e468747f1a0d69399b61fd40edc32ce4690ec5a200b5684474aa60a97a6910','solana-test-validator':'3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a','solana':'6a880f1c79ec0e0d7b3ee972eaa9ad8d75b503616e1f0c29efa587137a129dcd','solana-keygen':'2f00a742ab0d99cad929e7a82b2d80f7c519cab9038ec45844fdbe9c305dea65'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def admit(root,environ):
 if any(environ.get(k)!=v for k,v in [('RAILWAY_PROJECT_ID',PROJECT),('RAILWAY_ENVIRONMENT_ID',ENVIRONMENT),('RAILWAY_SERVICE_ID',SERVICE)]):raise ValueError('SEPARATE_COMPILER_WORKER_REQUIRED')
 if root.parent!=Path('/data') or not re.fullmatch('gated-client-runtime-v[1-9][0-9]*',root.name):raise ValueError('NEW_GATED_RUNTIME_NAMESPACE_REQUIRED')
 if root.is_symlink() or root.resolve()!=root or not root.is_dir() or root.stat().st_uid!=os.getuid() or stat.S_IMODE(root.stat().st_mode)!=0o700:raise ValueError('OWNED_PRIVATE_RUNTIME_ROOT_REQUIRED')
 if (root/'attempt.json').exists() or (root/'attempt.json').is_symlink():raise ValueError('RETAINED_RUNTIME_MUST_NOT_BE_REUSED')
def sources(root):
 m=json.loads((root/'public-source-hashes.json').read_text())
 if set(m)!=FILES:raise ValueError('EXACT_GATED_SOURCE_CLOSURE_REQUIRED')
 for name,digest in m.items():
  p=root/name;s=p.lstat()
  if p.is_symlink() or p.resolve()!=p or not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)&0o077 or not re.fullmatch('[a-f0-9]{64}',digest) or sha(p)!=digest:raise ValueError('SELECTED_PUBLIC_INPUT_CHANGED')
 selected=(root/'bridge/gated-program/artifact-sha256.txt').read_text().strip()
 if not re.fullmatch('[a-f0-9]{64}',selected) or m['.tools/bridge-gated-artifacts/classic_bridge_gated_program.so']!=selected or m['.tools/programs/spl_token_2022-v10.0.0.so']!=TOKEN:raise ValueError('SELECTED_SBF_REQUIRED')
 return m

def run(root):
 admit(root,os.environ);os.umask(0o077);m=sources(root)
 def load(name):
  spec=importlib.util.spec_from_file_location(name,root/('mainnet/'+name+'.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
 admission=load('process_admission');offline=load('offline_process');admission.no_active_validator()
 original={k:sha(Path('/data/target/release')/k) for k in CORE}
 if original!=CORE:raise ValueError('ORIGINAL_RUNTIME_ARTIFACT_CHANGED')
 state={'schemaVersion':1,'state':'running','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'One new JavaScript-client wire group in fresh in-memory SBF VMs; no chain RPC or retained ledger/key inputs','validatorProcessesStarted':0,'chainRequests':0,'retainedPrivateKeysRead':0,'canonicalNetworkChanged':False,'productionReady':False}
 def save():(root/'attempt.json').write_text(json.dumps(state,indent=2)+'\n')
 save()
 try:
  import subprocess
  version=subprocess.check_output(['node','--version'],text=True,timeout=5).strip()
  if version!=NODE_VERSION:raise ValueError('NODE24_RUNTIME_REQUIRED')
  dependency=Path('/app/node_modules/@solana/web3.js')
  if json.loads((dependency/'package.json').read_text())['version']!=CLIENT_DEPENDENCY_VERSION:raise ValueError('SELECTED_PUBLIC_CLIENT_DEPENDENCY_REQUIRED')
  modules=root/'node_modules/@solana';modules.mkdir(parents=True);(modules/'web3.js').symlink_to(dependency,target_is_directory=True)
  with (root/'client-tests-private.stderr').open('xb') as log:client=offline.run_tool(['node','--test',str(root/'bridge/gated-native.test.mjs')],log,timeout=60)
  (root/'client-tests-private.stdout').write_bytes(client)
  if 'pass 13' not in client.decode() or 'fail 0' not in client.decode():raise ValueError('THIRTEEN_CLIENT_GROUPS_REQUIRED')
  state['clientGroupsPassed']=13;save()
  command=['cargo','+1.89.0','test','--offline','--locked','--manifest-path',str(root/'bridge/gated-program/Cargo.toml'),'--test','runtime','gated_js_client_wire','--','--nocapture']
  with (root/'runtime-private.stderr').open('xb') as log:out=offline.run_tool(command,log,timeout=300)
  (root/'runtime-private.stdout').write_bytes(out)
  text=out.decode();match=re.search(r'test result: ok\. ([0-9]+) passed; 0 failed; 0 ignored; 0 measured; 5 filtered out',text)
  if not match or int(match[1])!=1:raise ValueError('ONE_CLIENT_RUNTIME_GROUP_REQUIRED')
  state.update({'state':'passed','compiledSBFScenarioGroups':1,'olderScenarioGroupsFiltered':5,'selectedSBF':m['.tools/bridge-gated-artifacts/classic_bridge_gated_program.so']})
 except BaseException as error:
  state.update({'state':'failed','failureType':type(error).__name__})
  if type(error) is ValueError and re.fullmatch('[A-Z_0-9]+',str(error)):state['failureCode']=str(error)
 finally:
  try:
   if sources(root)!=m or any(sha(Path('/data/target/release')/k)!=v for k,v in original.items()):raise ValueError('REVIEWED_ARTIFACT_CHANGED')
   admission.no_active_validator();state.update({'publicSourcesUnchanged':True,'originalRuntimeArtifactsUnchanged':True,'privateValidatorCensusClear':True})
  except BaseException:state.update({'state':'failed','integrityReviewFailed':True})
  state['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 return state
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args();print(json.dumps(run(a.root)))
