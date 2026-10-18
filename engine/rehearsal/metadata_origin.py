"""One fresh valueless metadata origin; no copied ledgers or settlement retries."""
from pathlib import Path
import json,os,shutil,socket,subprocess,time
import bootstrap_driver as driver
ROOT=Path('/data/bridge-metadata-observer-v1')
SERVICE='29189101-226c-483b-a424-b8cd140abd80'
PROJECT='356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
ENVIRONMENT='3367b373-2332-4702-8cce-c12b8f03949e'
PORT=24899

def validate_host(env):
    assert all(env.get(k)==v for k,v in [('RAILWAY_PROJECT_ID',PROJECT),('RAILWAY_ENVIRONMENT_ID',ENVIRONMENT),('RAILWAY_SERVICE_ID',SERVICE)]),'Separate private worker required'

def command(payer,program):
    return [str(driver.BIN),'--ledger',str(ROOT/'ledger'),'--rpc-port',str(PORT),'--faucet-port',str(PORT+2),'--gossip-port','26000','--bind-address','127.0.0.1','--dynamic-port-range','26001-26060','--limit-ledger-size','50000','--mint',payer,'--quiet','--bpf-program','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',str(ROOT/'token2022.so'),'--upgradeable-program',program,str(ROOT/'bridge.so'),payer]

def ready(genesis,health,slot):
    driver.validate_genesis(genesis,[])
    return health=='ok' and isinstance(slot,int) and not isinstance(slot,bool) and slot>0

def main():
    os.umask(0o077);validate_host(os.environ)
    assert ROOT.is_dir() and not (ROOT/'ledger').exists()
    # Reserve this attempt before generating any keys or starting a process.
    with (ROOT/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'state':'admitting','scope':'Fresh private metadata origin; no existing ledger reads or settlements','starts':0,'stops':[],'canonicalNetworkChanged':False,'productionReady':False}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    process=None
    try:
        assert driver.sha(driver.BIN)==driver.BIN_SHA
        assert driver.sha(ROOT/'bridge.so')==driver.ELF_SHA and driver.sha(ROOT/'token2022.so')==driver.TOKEN_SHA
        hashes=json.loads((ROOT/'public-source-hashes.json').read_text());assert hashes and all(driver.sha(ROOT/n)==v for n,v in hashes.items())
        assert shutil.disk_usage('/data').free>4*1024**3
        for proc in Path('/proc').glob('[0-9]*'):
            try:exe=(proc/'cmdline').read_bytes().split(b'\0')[0]
            except OSError:continue
            assert exe not in [str(driver.BIN).encode(),b'/data/target/release/agave-validator'],'Another private validator is active'
        for port in [PORT,PORT+1,PORT+2,26000,*range(26001,26061)]:
            for typ in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
                with socket.socket(type=typ) as sock:sock.bind(('127.0.0.1',port))
        modules=ROOT/'node_modules';modules.mkdir()
        (modules/'@solana').mkdir()
        for name,target in [('web3.js','/app/node_modules/@solana/web3.js'),('spl-token','/app/packages/chain/node_modules/@solana/spl-token'),('spl-token-metadata','/app/packages/chain/node_modules/@solana/spl-token-metadata')]:
            (modules/'@solana'/name).symlink_to(target,target_is_directory=True)
        script="""const fs=require('fs'),{Keypair}=require('@solana/web3.js');const keys={};for(const n of ['payer','mint','holder',...Array.from({length:5},(_,i)=>'member'+i)])keys[n]=Array.from(Keypair.generate().secretKey);const pub=()=>Keypair.generate().publicKey.toBase58();fs.writeFileSync('private-input.json',JSON.stringify({scope:'fresh-private-metadata-origin',keys,port:24899,program:pub(),bridge:pub(),remoteGenesis:pub(),remoteProgram:pub(),recipient:pub()}),{flag:'wx',mode:384});"""
        subprocess.run(['node','-e',script],cwd=ROOT,check=True,timeout=20)
        m=json.loads((ROOT/'private-input.json').read_text())
        payer=subprocess.check_output(['node','-e',"const {Keypair}=require('@solana/web3.js'),m=require('./private-input.json');process.stdout.write(Keypair.fromSecretKey(Uint8Array.from(m.keys.payer)).publicKey.toBase58())"],cwd=ROOT,text=True,timeout=20)
        with (ROOT/'validator-private.log').open('xb') as log:
            process=subprocess.Popen(command(payer,m['program']),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);state.update(state='starting',starts=1);save()
            deadline=time.monotonic()+180
            while time.monotonic()<deadline:
                assert process.poll() is None,'Fresh validator exited; preserve private log'
                try:
                    g=driver.rpc(PORT,'getGenesisHash')
                    if ready(g,driver.rpc(PORT,'getHealth'),driver.rpc(PORT,'getSlot',[{'commitment':'finalized'}])):break
                except (OSError,ValueError,RuntimeError):pass
                time.sleep(2)
            else:raise RuntimeError('Fresh validator readiness timeout')
            m['genesis']=g;assert g!=m['remoteGenesis'];(ROOT/'private-input.json').write_text(json.dumps(m))
            assert (Path('/proc')/str(process.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/'ledger').encode()]
            state.update(state='running',genesis=g);save()
            with (ROOT/'verification-private.log').open('xb') as out:subprocess.run(['node',str(ROOT/'metadata-origin.mjs')],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True,timeout=600)
            result=json.loads((ROOT/'public-result.json').read_text());assert result['state']=='passed' and result['settlementBroadcasts']==0
            state['state']='passed'
    except BaseException:
        state['state']='failed';raise
    finally:
        if process is not None:
            try:state['stops'].append({'returnCode':driver.stop(process),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        save()
    assert state['state']=='passed' and process.poll() is not None
    result.update(processes={**state,'allStopped':True},sourceBinarySHA256=driver.BIN_SHA,bridgeSBF_SHA256=driver.ELF_SHA,tokenSHA256=driver.TOKEN_SHA,uploadedSourceHashes=hashes,existingLedgersOpened=False)
    (ROOT/'public-result.json').write_text(json.dumps(result,indent=2));print(json.dumps({'state':result['state'],'checks':len(result['checks']),'allStopped':True,'settlementBroadcasts':0}))
if __name__=='__main__':main()
