"""Fresh private metadata journal round trip; no prior ledger/journal opens."""
from pathlib import Path
import json,os,shutil,socket,subprocess,time
import bootstrap_driver as driver
ROOT=Path('/data/bridge-metadata-journal-v2')
PROJECT='356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
ENVIRONMENT='3367b373-2332-4702-8cce-c12b8f03949e'
SERVICE='29189101-226c-483b-a424-b8cd140abd80'
PORTS=[26899,27899]
def validate_host(env):
    assert all(env.get(k)==v for k,v in [('RAILWAY_PROJECT_ID',PROJECT),('RAILWAY_ENVIRONMENT_ID',ENVIRONMENT),('RAILWAY_SERVICE_ID',SERVICE)]),'Separate private worker required'
def command(i,payer=None,program=None):
    assert i in (0,1)
    c=[str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(PORTS[i]),'--faucet-port',str(PORTS[i]+2),'--gossip-port',str(28000+i*100),'--bind-address','127.0.0.1','--dynamic-port-range',str(28001+i*100)+'-'+str(28060+i*100),'--limit-ledger-size','50000','--quiet']
    assert (payer is None)==(program is None)
    if payer is not None:c+=['--mint',payer,'--bpf-program','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',str(ROOT/'token2022.so'),'--upgradeable-program',program,str(ROOT/'bridge.so'),payer]
    return c
def ready(genesis,health,finalized,expected=None,minimum=1):
    driver.validate_genesis(genesis,[])
    return (expected is None or genesis==expected) and health=='ok' and isinstance(finalized,int) and not isinstance(finalized,bool) and isinstance(minimum,int) and not isinstance(minimum,bool) and 0<minimum<=finalized

def main():
    os.umask(0o077);validate_host(os.environ)
    assert ROOT.is_dir() and not any((ROOT/('ledger-'+str(i))).exists() for i in range(2)),'Fresh private ledgers required'
    with (ROOT/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'scope':'Fresh private metadata settlement and known-finalized restart recovery','state':'admitting','starts':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    processes={};handles=[]
    def stop(i):
        p=processes[i];rc=driver.stop(p);state['stops'].append({'side':i,'returnCode':rc,'applicationGracefulFlushVerified':False});save()
    def start(i,payer=None,program=None,expected=None,minimum=1):
        assert i not in processes or processes[i].poll() is not None
        log=(ROOT/('validator-'+str(i)+'-start-'+str(len(state['starts']))+'-private.log')).open('xb');handles.append(log)
        p=subprocess.Popen(command(i,payer,program),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        state['starts'].append({'side':i,'fresh':payer is not None,'pid':p.pid});save();until=time.monotonic()+180
        while time.monotonic()<until:
            assert p.poll() is None,'Private validator exited; preserve retained log'
            try:
                g=driver.rpc(PORTS[i],'getGenesisHash')
                if ready(g,driver.rpc(PORTS[i],'getHealth'),driver.rpc(PORTS[i],'getSlot',[{'commitment':'finalized'}]),expected,minimum):break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Private validator readiness timeout')
        assert (Path('/proc')/str(p.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/('ledger-'+str(i))).encode()]
        state['starts'][-1].update(genesis=g,minimumFinalizedSlot=minimum);save();return g
    def phase(name):
        with (ROOT/('phase-'+name+'-private.log')).open('xb') as out:subprocess.run(['node',str(ROOT/'metadata-journal.mjs'),name],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True,timeout=900 if name=='run' else 90)
    try:
        assert driver.sha(driver.BIN)==driver.BIN_SHA
        assert driver.sha(ROOT/'bridge.so')==driver.ELF_SHA and driver.sha(ROOT/'token2022.so')==driver.TOKEN_SHA
        hashes=json.loads((ROOT/'public-source-hashes.json').read_text());assert hashes and all(driver.sha(ROOT/n)==v for n,v in hashes.items())
        assert shutil.disk_usage('/data').free>8*1024**3
        for proc in Path('/proc').glob('[0-9]*'):
            try:exe=(proc/'cmdline').read_bytes().split(b'\0')[0]
            except OSError:continue
            assert exe not in [str(driver.BIN).encode(),b'/data/target/release/agave-validator'],'Another private validator is active'
        for i,port in enumerate(PORTS):
            for n in [port,port+1,port+2,28000+i*100,*range(28001+i*100,28061+i*100)]:
                for typ in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
                    with socket.socket(type=typ) as sock:sock.bind(('127.0.0.1',n))
        modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
        for name,target in [('web3.js','/app/node_modules/@solana/web3.js'),('spl-token','/app/packages/chain/node_modules/@solana/spl-token'),('spl-token-metadata','/app/packages/chain/node_modules/@solana/spl-token-metadata')]: (modules/name).symlink_to(target,target_is_directory=True)
        script="""const fs=require('fs'),{Keypair}=require('@solana/web3.js');const keys={};for(const n of ['payer','originUser','nativeUser','mint',...Array.from({length:5},(_,i)=>'member'+i)])keys[n]=Array.from(Keypair.generate().secretKey);const pub=()=>Keypair.generate().publicKey.toBase58();fs.writeFileSync('private-input.json',JSON.stringify({scope:'fresh-private-metadata-journal',keys,ports:[26899,27899],programs:[pub(),pub()],bridge:pub(),genesi:[]}),{flag:'wx',mode:384});"""
        subprocess.run(['node','-e',script],cwd=ROOT,check=True,timeout=20);m=json.loads((ROOT/'private-input.json').read_text())
        payer=subprocess.check_output(['node','-e',"const {Keypair}=require('@solana/web3.js'),m=require('./private-input.json');process.stdout.write(Keypair.fromSecretKey(Uint8Array.from(m.keys.payer)).publicKey.toBase58())"],cwd=ROOT,text=True,timeout=20)
        for i in range(2):
            g=start(i,payer,m['programs'][i]);driver.validate_genesis(g,m['genesi']);m['genesi'].append(g)
        (ROOT/'private-input.json').write_text(json.dumps(m));state['state']='running';save();phase('run')
        r=json.loads((ROOT/'private-result.json').read_text());assert r['state']=='awaiting-recovery' and r['sourceBroadcasts']==r['claimBroadcasts']==2 and r['negativeHandoffs']==4
        for i in range(2):
            op=next(o for o in r['operations'] if 1-o['direction']==i);journal=ROOT/'journal'/(op['id']+'.json');j=json.loads(journal.read_text());assert j['state']=='FINALIZED' and j['schemaVersion']==3
            stop(i);phase('offline-'+str(i));start(i,expected=m['genesi'][i],minimum=max(1,j['minimumDestinationSlot']));phase('recover-'+str(i))
        r=json.loads((ROOT/'private-result.json').read_text());assert r['state']=='passed' and sorted(r['recoveredSides'])==[0,1];state['state']='passed'
    except BaseException:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            if p.poll() is None:
                try:stop(i)
                except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed' and all(p.poll() is not None for p in processes.values()) and len(state['starts'])==len(state['stops'])==4
    r.update(processes={**state,'allStopped':True},sourceBinarySHA256=driver.BIN_SHA,bridgeSBF_SHA256=driver.ELF_SHA,tokenSHA256=driver.TOKEN_SHA,uploadedSourceHashes=hashes,existingLedgersOpened=False)
    (ROOT/'private-result.json').write_text(json.dumps(r,indent=2))
    print(json.dumps({'state':'passed','checks':len(r['checks']),'sourceBroadcasts':2,'claimBroadcasts':2,'negativeHandoffs':4,'allStopped':True}))
if __name__=='__main__':main()
