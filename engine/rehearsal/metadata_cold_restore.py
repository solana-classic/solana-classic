"""Archive/extract/restore a stopped private metadata fixture; no broadcasts.

Private worker identities and paths are supplied by a retained private config.
Original ledgers and journal inputs are only read, never opened by validators.
"""
from pathlib import Path
import argparse,json,os,re,shutil,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import copy_cold_ledger,inventory,archive_backup,extract_backup,sha
from process_admission import no_active_validator
from offline_process import run_tool

def validate_config(config,env):
    assert config['scope']=='private-metadata-cold-restore-v1'
    expected=config['workerEnvironment'];assert set(expected)=={'RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RAILWAY_SERVICE_ID'}
    assert all(isinstance(v,str) and v and env.get(k)==v for k,v in expected.items())
    assert expected['RAILWAY_SERVICE_ID']!=config['canonicalService']
    root=Path(config['attemptDirectory']);source=Path(config['sourceDirectory'])
    for p in [root,source]:
        assert p.is_absolute() and p.is_relative_to('/data') and p!=Path('/data')
        assert not any(v.is_symlink() for v in [p,*p.parents])
        assert p==p.resolve(strict=True)
        assert p.is_dir() and p.stat().st_uid==os.getuid() and p.stat().st_mode&0o777==0o700
    assert not root.is_relative_to(source) and not source.is_relative_to(root)
    return root,source

def validate_source(manifest,report,attempt,claim,redemption):
    assert manifest['scope']=='fresh-private-metadata-journal' and manifest['ports']==[26899,27899]
    assert len(manifest['genesi'])==len(set(manifest['genesi']))==2 and all(g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert report['state']==attempt['state']=='passed' and report['processes']['allStopped'] is True
    assert len(attempt['starts'])==3 and len(attempt['stops'])==2 and len(attempt['crashes'])==1
    assert all(v['returnCode'] in (0,-2) for v in attempt['stops']) and attempt['crashes'][0]['returnCode']==-9
    assert report['sourceBinarySHA256']==driver.BIN_SHA and report['bridgeSBF_SHA256']==driver.ELF_SHA
    assert report['originalLedgersUnchanged'] is True and report['originalPrivateFilesUnchanged'] is True
    assert report['sourceBroadcasts']==report['claimBroadcasts']==1 and report['settlementAccepted'] is True
    assert report['canonicalNetworkChanged'] is False and report['productionReady'] is False
    assert report['operation']['state']=='FINALIZED' and report['operation']['id']==redemption['id']
    for record,scope in [(claim,'isolated-native-claim'),(redemption,'isolated-origin-redemption')]:
        assert isinstance(record['id'],str) and re.fullmatch('[1-9A-HJ-NP-Za-km-z]{32,44}',record['id'])
        assert record['schemaVersion']==3 and record['state']=='FINALIZED' and record['scope']==scope and record['attempts']==1
        assert record['programmePinHandoffAttempted'] and record['reviewedMintAdmission']
    assert claim['id']!=redemption['id']
    assert report['final']=={'originOutstandingUnits':'0','nativeOutstandingUnits':'0','originEscrowUnits':'0','originUserUnits':'2000000','reserveNativeUnits':'52000000','protectedFloorNativeUnits':'1002240'}

def command(root,group,i):
    assert group in ['working','restored'] and type(i) is int and i in (0,1)
    port=[26899,27899][i]
    return [str(driver.BIN),'--ledger',str(root/group/('ledger-'+str(i))),'--rpc-port',str(port),'--faucet-port',str(port+2),'--gossip-port',str(28000+i*100),'--bind-address','127.0.0.1','--dynamic-port-range',str(28001+i*100)+'-'+str(28060+i*100),'--limit-ledger-size','50000','--quiet']

def main(config):
    os.umask(0o077);root,source=validate_config(config,os.environ)
    # Reserve before reading private inputs; a failed attempt is never reusable.
    with (root/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'schemaVersion':1,'state':'admitting','starts':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False}
    def save():(root/'attempt.json').write_text(json.dumps(state,indent=2))
    processes={};handles=[]
    def halt(i):
        p=processes[i];code=driver.stop(p);processes.pop(i);state['stops'].append({'side':i,'returnCode':code,'applicationGracefulFlushVerified':False});save()
    def start(group,i,minimum):
        assert sha(driver.BIN)==driver.BIN_SHA
        log=(root/(group+'-'+str(i)+'-private.log')).open('xb');handles.append(log)
        p=subprocess.Popen(command(root,group,i),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        state['starts'].append({'group':group,'side':i,'minimumFinalizedSlot':minimum});save();until=time.monotonic()+180
        while time.monotonic()<until:
            assert p.poll() is None,'Copied private validator exited'
            try:g=driver.rpc([26899,27899][i],'getGenesisHash')
            except (OSError,ValueError,RuntimeError):time.sleep(2);continue
            assert g==manifest['genesi'][i],'Copied genesis changed'
            try:
                slot=driver.rpc([26899,27899][i],'getSlot',[{'commitment':'finalized'}])
                if driver.rpc([26899,27899][i],'getHealth')=='ok' and type(slot) is int and slot>=minimum:break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Copied readiness timed out')
        raw=(Path('/proc')/str(p.pid)/'cmdline').read_bytes();assert raw.split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(root/group/('ledger-'+str(i))).encode()]
        forbidden=[str(source/('ledger-'+str(j))) for j in range(2)]
        if group=='restored':forbidden += [str(root/folder/('ledger-'+str(j))) for folder in ['working','backup','extracted'] for j in range(2)]
        assert not any(path in (Path('/proc')/str(p.pid)/'maps').read_text() for path in forbidden)
        for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
            try:target=os.readlink(fd)
            except OSError:continue
            assert not any(path in target for path in forbidden)
        state['starts'][-1].update(genesisMatches=True,forbiddenLedgerPathsOpened=False);save()
    def phase(name):
        with (root/('phase-'+name+'-private.log')).open('xb') as log:
            run_tool(['node',str(root/'run-restore.mjs'),name],log,timeout=300,stdout_limit=65536)
    try:
        assert all(not (root/folder).exists() for folder in ['working','backup','extracted','restored','journal'])
        no_active_validator()
        manifest=json.loads((source/'private-input.json').read_text());prior=json.loads((source/'private-result.json').read_text());attempt=json.loads((source/'attempt.json').read_text());claim=json.loads((source/'baseline-claim-private.json').read_text())
        selected=prior['operation']['id'];assert re.fullmatch('[1-9A-HJ-NP-Za-km-z]{32,44}',selected)
        redemption=json.loads((source/'journal'/(selected+'.json')).read_text());validate_source(manifest,prior,attempt,claim,redemption)
        assert sha(driver.BIN)==driver.BIN_SHA
        sources=json.loads((root/'public-source-hashes.json').read_text());assert sources and all(sha(root/name)==pin for name,pin in sources.items())
        assert all(sha(source/name)==pin for name,pin in prior['uploadedSourceHashes'].items())
        for i,port in enumerate(manifest['ports']):
            for number in [port,port+1,port+2,28000+i*100,*range(28001+i*100,28061+i*100)]:
                for kind in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
                    with socket.socket(type=kind) as sock:sock.bind(('127.0.0.1',number))
        assert shutil.disk_usage('/data').free>8*1024**3,'Private archive capacity insufficient'
        original=[inventory(source/('ledger-'+str(i)))[0] for i in range(2)]
        names=['private-input.json','private-result.json','attempt.json','selected-review-private.json','baseline-claim-private.json','journal/'+selected+'.json'];old_files={name:sha(source/name) for name in names}
        state.update(state='copying',originalInventories=original,originalPrivateFileHashes=old_files);save()
        for i in range(2):copy_cold_ledger(source/('ledger-'+str(i)),root/'working'/('ledger-'+str(i)))
        for src,dst in [('private-input.json','private-input.json'),('private-result.json','baseline-result-private.json'),('selected-review-private.json','selected-review-private.json')]:shutil.copyfile(source/src,root/dst)
        (root/'journal').mkdir(mode=0o700)
        for record,src in [(claim,'baseline-claim-private.json'),(redemption,'journal/'+selected+'.json')]:shutil.copyfile(source/src,root/'journal'/(record['id']+'.json'))
        (root/'selected-journals-private.json').write_text(json.dumps([claim['id'],redemption['id']]))
        modules=root/'node_modules/@solana';modules.mkdir(parents=True)
        (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True);(modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
        state['state']='baseline';save();start('working',0,1);start('working',1,1);phase('baseline');halt(0);halt(1)
        state['state']='archiving';save()
        backup=[copy_cold_ledger(root/'working'/('ledger-'+str(i)),root/'backup'/('ledger-'+str(i))) for i in range(2)]
        archive=archive_backup(root/'backup',root/'private-ledgers.tar');extracted=extract_backup(root/'private-ledgers.tar',root/'extracted',archive['sha256']);assert extracted==backup
        restored=[copy_cold_ledger(root/'extracted'/('ledger-'+str(i)),root/'restored'/('ledger-'+str(i))) for i in range(2)];assert restored==backup
        state['archive']={**archive,'extractionVerified':True,'restoredInventoriesMatch':True};state['state']='restoring';save()
        checkpoint=json.loads((root/'checkpoint-private.json').read_text());start('restored',0,checkpoint[0]['contextSlot']);start('restored',1,checkpoint[1]['contextSlot']);phase('verify')
        state['state']='verifying';save()
    except BaseException:
        state['state']='failed';raise
    finally:
        for i in list(processes):
            try:halt(i)
            except BaseException:state['state']='failed'
        for handle in handles:handle.close()
        save()
    assert state['state']=='verifying' and len(state['starts'])==len(state['stops'])==4
    try:
        assert [inventory(source/('ledger-'+str(i)))[0] for i in range(2)]==original and all(sha(source/name)==pin for name,pin in old_files.items())
        assert all(sha(root/name)==pin for name,pin in sources.items())
        proof=json.loads((root/'private-result.json').read_text());assert proof['state']=='passed' and proof['broadcasts']==0 and proof['simulations']==2
        proof['checks']+=['Archive hash and complete extracted/restored stopped-ledger inventories match before restart','All four owned copy starts stopped; readiness fd/maps samples exclude original and other copy ledger paths','Original ledger inventories and private inputs stay byte-identical; uploaded public sources unchanged']
        state['state']='passed';save()
        proof.update(archiveVerified=True,originalLedgersUnchanged=True,originalPrivateFilesUnchanged=True,processes={**state,'allStopped':True},sourceBinarySHA256=driver.BIN_SHA,bridgeSBF_SHA256=driver.ELF_SHA,uploadedSourceHashes=sources)
        (root/'private-result.json').write_text(json.dumps(proof,indent=2))
        print(json.dumps({'state':'passed','checks':len(proof['checks']),'broadcasts':0,'simulations':2,'allStopped':True,'archiveVerified':True}))
    except BaseException:state['state']='failed';save();raise

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--private-config',required=True);args=parser.parse_args();main(json.loads(Path(args.private_config).read_text()))
