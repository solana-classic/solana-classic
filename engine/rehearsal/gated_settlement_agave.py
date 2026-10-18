"""One fresh bounded private two-chain destination observation. Never replay a root."""
from pathlib import Path
import argparse,datetime,hashlib,importlib.util,json,os,shutil,signal,socket,subprocess,time
PROJECT='356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
ENVIRONMENT='3367b373-2332-4702-8cce-c12b8f03949e'
SERVICE='29189101-226c-483b-a424-b8cd140abd80'
ROOT=Path('/data/gated-settlement-agave-v1')
BIN=Path('/data/target/release/solana-test-validator')
CORE={'agave-validator':'34e468747f1a0d69399b61fd40edc32ce4690ec5a200b5684474aa60a97a6910','solana-test-validator':'3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a','solana':'6a880f1c79ec0e0d7b3ee972eaa9ad8d75b503616e1f0c29efa587137a129dcd','solana-keygen':'2f00a742ab0d99cad929e7a82b2d80f7c519cab9038ec45844fdbe9c305dea65'}
ARTIFACTS={'origin.so':'556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53','gated.so':'19424e0679c8d2d801fcb6ab015860b7b8f487cf0b1c6e2e7b41ca3d40efc16b','token2022.so':'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68'}
PORTS=[27891,28891]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def admit(root,env):
 if root!=ROOT or root.resolve()!=root or not root.is_dir() or root.is_symlink() or root.stat().st_uid!=os.getuid() or root.stat().st_mode&0o777!=0o700:raise ValueError('PRIVATE_FRESH_ROOT_REQUIRED')
 if any(env.get(k)!=v for k,v in [('RAILWAY_PROJECT_ID',PROJECT),('RAILWAY_ENVIRONMENT_ID',ENVIRONMENT),('RAILWAY_SERVICE_ID',SERVICE)]):raise ValueError('SEPARATE_WORKER_REQUIRED')
 if any((root/('ledger-'+str(i))).exists() for i in (0,1)) or any((root/n).exists() for n in ['attempt.json','private-input.json','private-result.json']):raise ValueError('ATTEMPT_ALREADY_RESERVED')
def command(root,i,payer,program):
 if root!=ROOT or i not in (0,1) or not payer or not program:raise ValueError('EXACT_FRESH_COMMAND_REQUIRED')
 return [str(BIN),'--ledger',str(root/('ledger-'+str(i))),'--rpc-port',str(PORTS[i]),'--faucet-port',str(PORTS[i]+2),'--gossip-port',str(29400+i*100),'--bind-address','127.0.0.1','--dynamic-port-range',str(29401+i*100)+'-'+str(29460+i*100),'--limit-ledger-size','50000','--quiet','--mint',payer,'--bpf-program','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',str(root/'token2022.so'),'--upgradeable-program',program,str(root/('origin.so' if i==0 else 'gated.so')),payer]
def load(root,name,path):
 spec=importlib.util.spec_from_file_location(name,root/path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def run(root):
 admit(root,os.environ);os.umask(0o077)
 with (root/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
 state={'schemaVersion':1,'state':'admitting','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'starts':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False}
 def save():(root/'attempt.json').write_text(json.dumps(state,indent=2)+'\n')
 processes=[];handles=[];sources={};original={}
 try:
  sources=json.loads((root/'public-source-hashes.json').read_text());assert sources and all(sha(root/p)==v for p,v in sources.items()),'PUBLIC_SOURCE_CHANGED'
  assert all(sha(root/p)==v for p,v in ARTIFACTS.items()),'SELECTED_SBF_CHANGED'
  original={n:sha(Path('/data/target/release')/n) for n in CORE};assert original==CORE,'RUNTIME_CHANGED'
  assert subprocess.check_output(['node','--version'],text=True,timeout=5).strip()=='v24.19.0','NODE_VERSION_CHANGED'
  for name,location,version in [('web3.js','/app/node_modules/@solana/web3.js','1.99.0'),('spl-token','/app/packages/chain/node_modules/@solana/spl-token',None)]:
   target=Path(location);assert target.is_dir()
   if version:assert json.loads((target/'package.json').read_text())['version']==version,'DEPENDENCY_CHANGED'
   parent=root/'node_modules/@solana';parent.mkdir(parents=True,exist_ok=True);(parent/name).symlink_to(target,target_is_directory=True)
  admission=load(root,'process_admission','mainnet/process_admission.py');admission.no_active_validator()
  assert shutil.disk_usage('/data').free>8*1024**3,'PRIVATE_FREE_DISK_REQUIRED'
  # This is the existing bounded test-validator profile, not full-validator host admission.
  for i,port in enumerate(PORTS):
   for n in [port,port+1,port+2,29400+i*100,*range(29401+i*100,29461+i*100)]:
    for kind in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
     with socket.socket(type=kind) as sock:sock.bind(('127.0.0.1',n))
  script="""const fs=require('fs'),{Keypair}=require('@solana/web3.js');const keys={};for(const n of ['payer','originUser','nativeUser','mint',...Array.from({length:5},(_,i)=>'member'+i)])keys[n]=Array.from(Keypair.generate().secretKey);const pub=()=>Keypair.generate().publicKey.toBase58();const payer=Keypair.fromSecretKey(Uint8Array.from(keys.payer)).publicKey.toBase58();fs.writeFileSync('private-input.json',JSON.stringify({scope:'fresh-gated-settlement-agave-v1',keys,payer,ports:[27891,28891],programs:[pub(),pub()],bridge:pub(),genesi:[]}),{flag:'wx',mode:384});"""
  subprocess.run(['node','-e',script],cwd=root,check=True,timeout=20)
  data=json.loads((root/'private-input.json').read_text());driver=load(root,'bootstrap_driver','engine/rehearsal/bootstrap.py')
  for i in (0,1):
   output=(root/('validator-'+str(i)+'-private.log')).open('xb');handles.append(output)
   p=subprocess.Popen(command(root,i,data['payer'],data['programs'][i]),stdout=output,stderr=subprocess.STDOUT,start_new_session=True);processes.append(p);state['starts'].append({'side':i,'pid':p.pid});save();deadline=time.monotonic()+180
   while time.monotonic()<deadline:
    assert p.poll() is None,'NEW_VALIDATOR_EXITED'
    try:
     g=driver.rpc(PORTS[i],'getGenesisHash');driver.validate_genesis(g,data['genesi'])
     if driver.rpc(PORTS[i],'getHealth')=='ok' and driver.rpc(PORTS[i],'getSlot',[{'commitment':'finalized'}])>0:break
    except (OSError,ValueError,RuntimeError):pass
    time.sleep(2)
   else:raise ValueError('NEW_VALIDATOR_READINESS_TIMEOUT')
   expected=[str(BIN).encode(),b'--ledger',str(root/('ledger-'+str(i))).encode()];assert (Path('/proc')/str(p.pid)/'cmdline').read_bytes().split(b'\0')[:3]==expected
   data['genesi'].append(g);state['starts'][-1]['identityAdmitted']=True;save()
  (root/'private-input.json').write_text(json.dumps(data));state['state']='running';save()
  offline=load(root,'offline_process','mainnet/offline_process.py')
  with (root/'integration-private.stderr').open('xb') as log:out=offline.run_tool(['node',str(root/'bridge/rehearsal/gated-settlement-agave.mjs'),str(root)],log,timeout=900)
  (root/'integration-private.stdout').write_bytes(out)
  report=json.loads((root/'private-result.json').read_text());assert report['state']=='passed' and report['sourceBroadcasts']==2 and report['claimBroadcasts']==1 and len(report['checks'])==14,'EXACT_NEW_REHEARSAL_REQUIRED';state['state']='passed'
 except BaseException as e:
  state['state']='failed';state['failureType']=type(e).__name__
  if isinstance(e,ValueError) and str(e).isupper():state['failureCode']=str(e)
 finally:
  for i,p in enumerate(processes):
   try:
    if p.poll() is None:
     os.killpg(p.pid,signal.SIGINT)
     try:p.wait(timeout=45)
     except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=10);raise ValueError('STOP_TIMEOUT')
    assert p.returncode in (0,-signal.SIGINT);state['stops'].append({'side':i,'returnCode':p.returncode,'applicationGracefulFlushVerified':False})
   except BaseException:state['state']='failed';state['stopFailed']=True
  for h in handles:h.close()
  try:
   assert sources and all(sha(root/p)==v for p,v in sources.items()) and all(sha(Path('/data/target/release')/n)==v for n,v in original.items())
   load(root,'process_admission_final','mainnet/process_admission.py').no_active_validator();state.update(publicSourcesUnchanged=True,originalRuntimeArtifactsUnchanged=True,allOwnedProcessesStopped=True,privateValidatorCensusClear=True)
  except BaseException:state['state']='failed';state['integrityOrCensusFailed']=True
  state['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 return state
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);args=p.parse_args();print(json.dumps(run(args.root)))
