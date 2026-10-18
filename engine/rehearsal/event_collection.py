"""Read-only account collection from new stopped-ledger copies; no transactions.

Worker and directory identities come only from an owner-only private config.
Original ledgers are inventoried but never opened by a validator.
"""
from pathlib import Path
import argparse,json,os,re,shutil,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import copy_cold_ledger,inventory,sha
from process_admission import no_active_validator
from offline_process import run_tool

def validate_config(config,env):
    assert config['scope']=='private-event-account-collection-v1'
    expected=config['workerEnvironment'];assert set(expected)=={'RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RAILWAY_SERVICE_ID'}
    assert all(isinstance(v,str) and v and env.get(k)==v for k,v in expected.items())
    assert expected['RAILWAY_SERVICE_ID']!=config['canonicalService']
    root=Path(config['attemptDirectory']);source=Path(config['sourceDirectory'])
    for p in [root,source]:
        assert p.is_absolute() and p.is_relative_to('/data') and p!=Path('/data')
        assert not any(v.is_symlink() for v in [p,*p.parents]) and p==p.resolve(strict=True)
        assert p.is_dir() and p.stat().st_uid==os.getuid() and p.stat().st_mode&0o777==0o700
    assert not root.is_relative_to(source) and not source.is_relative_to(root)
    ports=config['rpcPorts'];gossip=config['gossipPorts'];assert len(ports)==len(gossip)==2
    assert all(type(p) is int and 1024<p<65000 for p in ports+gossip)
    ranges=[set([p,p+1,p+2])|set(range(g,g+61)) for p,g in zip(ports,gossip)]
    assert all(3+61==len(r) for r in ranges) and ranges[0].isdisjoint(ranges[1])
    return root,source

def validate_source(manifest,report,attempt,claim,redemption):
    assert manifest['scope']=='fresh-private-metadata-journal' and len(manifest['genesi'])==len(set(manifest['genesi']))==2
    assert all(isinstance(g,str) and re.fullmatch('[1-9A-HJ-NP-Za-km-z]{32,44}',g) and g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert report['state']==attempt['state']=='passed' and report['processes']['allStopped'] is True
    assert len(attempt['starts'])==len(attempt['stops'])==2 and attempt['crashes']==[] and all(v['returnCode'] in (0,-2) for v in attempt['stops'])
    assert report['originalLedgersUnchanged'] is report['originalPrivateFilesUnchanged'] is True
    assert report['sourceBinarySHA256']==driver.BIN_SHA and report['bridgeSBF_SHA256']==driver.ELF_SHA
    assert report['sourceBroadcasts']==report['handoffs']==1 and report['claimBroadcasts']==0
    assert report['realHeightExpiryVerified'] is report['handoffAdmissionsRetained'] is report['signedBytesAndOriginalExpiryRetained'] is True
    assert report['settlementAccepted'] is report['canonicalNetworkChanged'] is report['productionReady'] is False
    assert report['operation']['state']=='EXPIRED_UNRESOLVED' and report['operation']['id']==redemption['id']
    for record,scope,state in [(claim,'isolated-native-claim','FINALIZED'),(redemption,'isolated-origin-redemption','EXPIRED_UNRESOLVED')]:
        assert isinstance(record['id'],str) and re.fullmatch('[1-9A-HJ-NP-Za-km-z]{32,44}',record['id'])
        assert record['schemaVersion']==3 and record['scope']==scope and record['state']==state and record['attempts']==1
        assert record['programmePinHandoffAttempted'] is True and record['reviewedMintAdmission']
    assert claim['id']!=redemption['id']
    assert report['expiry']['lastFinalizedHeight']>redemption['lastValidBlockHeight']
    assert [claim['programmePinPolicy'][side]['genesis'] for side in ['source','destination']]==manifest['genesi']
    assert report['final']=={'originOutstandingUnits':'10000','nativeOutstandingUnits':'0','originEscrowUnits':'10000','originUserUnits':'1990000','reserveNativeUnits':'52000000','protectedFloorNativeUnits':'1002240'}

def command(root,config,i):
    assert type(i) is int and i in (0,1)
    p=config['rpcPorts'][i];g=config['gossipPorts'][i]
    return [str(driver.BIN),'--ledger',str(root/('ledger-'+str(i))),'--rpc-port',str(p),'--faucet-port',str(p+2),'--gossip-port',str(g),'--bind-address','127.0.0.1','--dynamic-port-range',str(g+1)+'-'+str(g+60),'--limit-ledger-size','50000','--quiet']

def inspect_copy_process(p,root,source,i):
    proc=Path('/proc')/str(p.pid);assert (proc/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(root/('ledger-'+str(i))).encode()]
    forbidden=[str(source/('ledger-'+str(j))) for j in range(2)]+[str(root/('ledger-'+str(1-i)))]
    assert not any(v in (proc/'maps').read_text() for v in forbidden)
    for fd in (proc/'fd').iterdir():
        try:target=os.readlink(fd)
        except OSError:continue
        assert not any(v in target for v in forbidden)

def main(config):
    os.umask(0o077);root,source=validate_config(config,os.environ)
    with (root/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'schemaVersion':1,'state':'admitting','starts':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False};processes={};handles=[]
    def save():(root/'attempt.json').write_text(json.dumps(state,indent=2))
    def phase(name):
        with (root/('phase-'+name+'-private.log')).open('xb') as log:run_tool(['node',str(root/'run-collection.mjs'),name],log,timeout=240,stdout_limit=65536)
    def start(i,expected,minimum):
        assert sha(driver.BIN)==driver.BIN_SHA
        out=(root/('validator-'+str(i)+'-private.log')).open('xb');handles.append(out)
        p=subprocess.Popen(command(root,config,i),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        state['starts'].append({'side':i,'minimumFinalizedSlot':minimum});save();until=time.monotonic()+180;port=config['rpcPorts'][i]
        while time.monotonic()<until:
            assert p.poll() is None,'Copied private validator exited'
            try:g=driver.rpc(port,'getGenesisHash')
            except (OSError,ValueError,RuntimeError):time.sleep(2);continue
            assert g==expected,'Copied private genesis differs'
            try:
                slot=driver.rpc(port,'getSlot',[{'commitment':'finalized'}])
                if type(slot) is int and slot>=minimum and driver.rpc(port,'getHealth')=='ok':break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Copied private readiness timeout')
        inspect_copy_process(p,root,source,i)
        state['starts'][-1].update(genesisMatches=True,forbiddenLedgerPathsOpened=False);save()
    try:
        no_active_validator();assert all(not (root/name).exists() for name in ['ledger-0','ledger-1','journal','private-result.json'])
        m=json.loads((source/'private-input.json').read_text());prior=json.loads((source/'private-result.json').read_text());old_attempt=json.loads((source/'attempt.json').read_text());claim=json.loads((source/'baseline-claim-private.json').read_text())
        selected=prior['operation']['id'];assert re.fullmatch('[1-9A-HJ-NP-Za-km-z]{32,44}',selected)
        redemption=json.loads((source/'journal'/(selected+'.json')).read_text());validate_source(m,prior,old_attempt,claim,redemption)
        assert sha(driver.BIN)==driver.BIN_SHA
        sources=json.loads((root/'public-source-hashes.json').read_text());assert sources and all(sha(root/name)==pin for name,pin in sources.items())
        assert all(sha(source/name)==pin for name,pin in prior['uploadedSourceHashes'].items())
        for port,g in zip(config['rpcPorts'],config['gossipPorts']):
            for number in [port,port+1,port+2,*range(g,g+61)]:
                for kind in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
                    with socket.socket(type=kind) as sock:sock.bind(('127.0.0.1',number))
        assert shutil.disk_usage('/data').free>4*1024**3,'Private copy capacity insufficient'
        original=[inventory(source/('ledger-'+str(i)))[0] for i in range(2)]
        names=['private-input.json','private-result.json','attempt.json','selected-review-private.json','baseline-result-private.json','baseline-claim-private.json','journal/'+selected+'.json'];protected={name:sha(source/name) for name in names}
        state.update(originalInventories=original,originalPrivateFileHashes=protected);save()
        for src,dst in [('private-result.json','baseline-result-private.json'),('selected-review-private.json','selected-review-private.json'),('baseline-result-private.json','historical-baseline-private.json')]:shutil.copyfile(source/src,root/dst)
        (root/'journal').mkdir(mode=0o700)
        for record,src in [(claim,'baseline-claim-private.json'),(redemption,'journal/'+selected+'.json')]:shutil.copyfile(source/src,root/'journal'/(record['id']+'.json'))
        (root/'collection-config-private.json').write_text(json.dumps({'ports':config['rpcPorts'],'selection':[claim['id'],redemption['id']]}))
        module=root/'node_modules/@solana';module.mkdir(parents=True,exist_ok=True)
        dependency=module/'web3.js'
        if dependency.is_symlink():assert os.readlink(dependency)=='/app/node_modules/@solana/web3.js'
        else:dependency.symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
        phase('preflight');admission=json.loads((root/'preflight-private.json').read_text());assert admission['genesi']==m['genesi']
        for i in range(2):copy_cold_ledger(source/('ledger-'+str(i)),root/('ledger-'+str(i)))
        state['state']='collecting';save()
        for i in range(2):start(i,admission['genesi'][i],admission['minimums'][i])
        phase('collect');state['state']='verifying';save()
    except BaseException:
        state['state']='failed';raise
    finally:
        for i,p in list(processes.items()):
            try:
                code=driver.stop(p);state['stops'].append({'side':i,'returnCode':code,'applicationGracefulFlushVerified':False});del processes[i]
            except BaseException:state['state']='failed'
        for handle in handles:handle.close()
        save()
    try:
        assert state['state']=='verifying' and len(state['starts'])==len(state['stops'])==2 and not processes
        assert [inventory(source/('ledger-'+str(i)))[0] for i in range(2)]==original and all(sha(source/name)==pin for name,pin in protected.items())
        assert all(sha(root/name)==pin for name,pin in sources.items())
        proof=json.loads((root/'private-result.json').read_text());assert proof['state']=='passed' and proof['broadcasts']==proof['simulations']==proof['handoffs']==proof['signaturesCreated']==0
        proof['checks']+=['Both owned validator-copy processes stopped after read-only collection; readiness samples exclude original and opposite copy ledger paths','Complete original cold inventories, seven selected private files and all uploaded public sources remain unchanged']
        state['state']='passed';save();proof.update(originalLedgersUnchanged=True,originalPrivateFilesUnchanged=True,processes={**state,'allStopped':True},sourceBinarySHA256=driver.BIN_SHA,bridgeSBF_SHA256=driver.ELF_SHA,uploadedSourceHashes=sources)
        (root/'private-result.json').write_text(json.dumps(proof,indent=2));print(json.dumps({'state':'passed','checks':len(proof['checks']),'allStopped':True,'broadcasts':0}))
    except BaseException:state['state']='failed';save();raise

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--private-config',required=True);args=parser.parse_args();main(json.loads(Path(args.private_config).read_text()))
