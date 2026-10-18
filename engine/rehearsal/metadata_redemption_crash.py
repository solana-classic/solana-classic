"""One reviewed metadata original-redemption process fault on new private copies."""
from pathlib import Path
import json,os,re,shutil,signal,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import inventory,copy_cold_ledger,sha
ROOT=Path('/data/bridge-metadata-redemption-crash-v1')
SOURCE=Path('/data/bridge-metadata-pending-crash-v1')
PROJECT='356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
ENVIRONMENT='3367b373-2332-4702-8cce-c12b8f03949e'
SERVICE='29189101-226c-483b-a424-b8cd140abd80'
PORTS=[26899,27899]
def validate_host(env):
    assert all(env.get(k)==v for k,v in [('RAILWAY_PROJECT_ID',PROJECT),('RAILWAY_ENVIRONMENT_ID',ENVIRONMENT),('RAILWAY_SERVICE_ID',SERVICE)]),'Separate private worker required'
def validate(m,r,a):
    assert m['scope']=='fresh-private-metadata-journal' and m['ports']==PORTS and len(m['genesi'])==2 and len(set(m['genesi']))==2
    assert all(isinstance(g,str) and g and g not in driver.FORBIDDEN for g in m['genesi'])
    assert r['state']==a['state']=='passed' and r['processes']['allStopped'] is True
    assert len(a['starts'])==3 and len(a['stops'])==2 and len(a['crashes'])==1
    assert all(s['returnCode'] in (0,-2) for s in a['stops']) and a['crashes'][0]['returnCode']==-9
    assert r['sourceBroadcasts']==r['claimBroadcasts']==1 and r['settlementAccepted'] is True
    assert r['operation']['state']=='FINALIZED' and re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',r['operation']['id'])
    assert r['final']=={'originOutstandingUnits':'10000','nativeOutstandingUnits':'10000','originEscrowUnits':'10000','originUserUnits':'1990000','reserveNativeUnits':'42000000','protectedFloorNativeUnits':'1002240'}
    assert r['sourceBinarySHA256']==driver.BIN_SHA and r['bridgeSBF_SHA256']==driver.ELF_SHA
    assert r['originalLedgersUnchanged'] is True and r['originalPrivateFilesUnchanged'] is True
    assert r['completeGenesisBackingVerified'] is False and r['productionReady'] is False and r['canonicalNetworkChanged'] is False

def command(i):
    assert i in (0,1)
    return [str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(PORTS[i]),'--faucet-port',str(PORTS[i]+2),'--gossip-port',str(28000+i*100),'--bind-address','127.0.0.1','--dynamic-port-range',str(28001+i*100)+'-'+str(28060+i*100),'--limit-ledger-size','50000','--quiet']
def ready(g,health,slot,expected,minimum):
    return g==expected and health=='ok' and isinstance(slot,int) and not isinstance(slot,bool) and isinstance(minimum,int) and not isinstance(minimum,bool) and 0<minimum<=slot

def validate_crash(raw,status,processed,finalized):
    assert raw.split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/'ledger-0').encode()]
    assert all(isinstance(n,int) and not isinstance(n,bool) and n>=0 for n in [processed,finalized]) and processed>finalized
    if status is not None:
        assert status['err'] is None and status['confirmationStatus'] in ('processed','confirmed')
        assert isinstance(status['slot'],int) and not isinstance(status['slot'],bool) and finalized<status['slot']<=processed

def main():
    os.umask(0o077);validate_host(os.environ)
    assert ROOT.is_dir() and all(not (ROOT/('ledger-'+str(i))).exists() for i in range(2)),'Fresh private copies required'
    with (ROOT/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'scope':'New private metadata original-redemption pre-finality process fault','state':'admitting','starts':[],'stops':[],'crashes':[],'canonicalNetworkChanged':False,'productionReady':False}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    processes={};handles=[]
    def start(i,minimum):
        assert i not in processes or processes[i].poll() is not None
        log=(ROOT/('validator-'+str(i)+'-start-'+str(len(state['starts']))+'-private.log')).open('xb');handles.append(log)
        p=subprocess.Popen(command(i),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p;state['starts'].append({'side':i,'minimumFinalizedSlot':minimum});save();until=time.monotonic()+180
        while time.monotonic()<until:
            assert p.poll() is None,'Copied validator exited; retain log'
            try:
                g=driver.rpc(PORTS[i],'getGenesisHash');assert g==m['genesi'][i]
                if ready(g,driver.rpc(PORTS[i],'getHealth'),driver.rpc(PORTS[i],'getSlot',[{'commitment':'finalized'}]),m['genesi'][i],minimum):break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Copied validator readiness timeout')
        assert (Path('/proc')/str(p.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/('ledger-'+str(i))).encode()]
        forbidden=[str(SOURCE/('ledger-'+str(j))) for j in range(2)]
        assert not any(v in (Path('/proc')/str(p.pid)/'maps').read_text() for v in forbidden)
        for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
            try:target=os.readlink(fd)
            except OSError:continue
            assert not any(v in target for v in forbidden)
        state['starts'][-1].update(genesisMatches=True,originalLedgerPathsOpened=False);save()
    def phase(name):
        with (ROOT/('phase-'+name+'-private.log')).open('xb') as out:subprocess.run(['node',str(ROOT/'metadata-redemption-crash.mjs'),name],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True,timeout=300)
    try:
        m=json.loads((SOURCE/'private-input.json').read_text());r=json.loads((SOURCE/'private-result.json').read_text());validate(m,r,json.loads((SOURCE/'attempt.json').read_text()))
        assert sha(driver.BIN)==driver.BIN_SHA and sha(ROOT/'bridge.so')==driver.ELF_SHA
        sources=json.loads((ROOT/'public-source-hashes.json').read_text());assert sources and all(sha(ROOT/n)==h for n,h in sources.items())
        assert all(sha(SOURCE/n)==h for n,h in r['uploadedSourceHashes'].items())
        for proc in Path('/proc').glob('[0-9]*'):
            try:exe=(proc/'cmdline').read_bytes().split(b'\0')[0]
            except OSError:continue
            assert exe not in [str(driver.BIN).encode(),b'/data/target/release/agave-validator'],'Another private validator is active'
        for i,port in enumerate(PORTS):
            for n in [port,port+1,port+2,28000+i*100,*range(28001+i*100,28061+i*100)]:
                for typ in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
                    with socket.socket(type=typ) as sock:sock.bind(('127.0.0.1',n))
        assert shutil.disk_usage('/data').free>8*1024**3
        old=[inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]
        names=['private-input.json','private-result.json','attempt.json','selected-review-private.json','baseline-result-private.json','baseline-claim-private.json','journal/'+r['operation']['id']+'.json'];old_files={n:sha(SOURCE/n) for n in names}
        records=[json.loads((SOURCE/('journal/'+r['operation']['id']+'.json')).read_text())];minimum=[1,1]
        for record in records:
            assert record['schemaVersion']==3 and record['state']=='FINALIZED' and record['programmePinHandoffAttempted']
            from_side=0 if record['scope']=='isolated-native-claim' else 1;to_side=1-from_side
            for i,n in [(from_side,max(record['sourceContextSlot'],record['programmePinAdmission']['source']['contextSlot'])),(to_side,max(record['minimumDestinationSlot'],record['programmePinAdmission']['destination']['contextSlot']))]:
                assert isinstance(n,int) and not isinstance(n,bool) and n>0;minimum[i]=max(minimum[i],n)
        state.update(state='copying',originalColdInventory=old,originalPrivateFileHashes=old_files);save()
        for i in range(2):copy_cold_ledger(SOURCE/('ledger-'+str(i)),ROOT/('ledger-'+str(i)))
        for source,destination in [('private-input.json','private-input.json'),('private-result.json','baseline-result-private.json'),('selected-review-private.json','selected-review-private.json'),('journal/'+r['operation']['id']+'.json','baseline-claim-private.json')]:shutil.copyfile(SOURCE/source,ROOT/destination)
        modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
        (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True);(modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
        state['state']='running';save();start(0,minimum[0]);start(1,minimum[1]);phase('submit')
        report=json.loads((ROOT/'private-result.json').read_text());assert report['claimBroadcasts']==report['sourceBroadcasts']==1 and report['clientConfirmationWithheld']
        p=processes[0];assert p.poll() is None and os.getpgid(p.pid)==p.pid
        status=driver.rpc(PORTS[0],'getSignatureStatuses',[[report['claimSignature']],{'searchTransactionHistory':True}])['value'][0];processed=driver.rpc(PORTS[0],'getSlot',[{'commitment':'processed'}]);finalized=driver.rpc(PORTS[0],'getSlot',[{'commitment':'finalized'}])
        validate_crash((Path('/proc')/str(p.pid)/'cmdline').read_bytes(),status,processed,finalized)
        os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=30);assert p.returncode==-9;processes.pop(0)
        state['crashes'].append({'side':0,'returnCode':-9,'claimStatusBeforeKill':status,'processedSlotBeforeKill':processed,'finalizedSlotBeforeKill':finalized,'knownFinalizedBeforeFault':False,'waitedForClaimFinality':False});save()
        phase('outage');j=json.loads((ROOT/('journal/'+report['operation']['id']+'.json')).read_text());start(0,max(1,j['minimumDestinationSlot']));phase('recover');state['state']='verifying'
    except BaseException:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'returnCode':driver.stop(p),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='verifying' and len(state['starts'])==3 and len(state['stops'])==2 and len(state['crashes'])==1
    try:
        assert [inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]==old and all(sha(SOURCE/n)==h for n,h in old_files.items())
    except BaseException:
        state['state']='failed';save();raise
    state['state']='passed';save()
    report=json.loads((ROOT/'private-result.json').read_text());assert report['state']=='passed' and report['operation']['state'] in ['FINALIZED','EXPIRED_UNRESOLVED']
    report['checks'].append('Actual destination SIGKILL before observed finality; all three copy starts stopped and original ledgers/private records unchanged')
    report.update(processes={**state,'allStopped':True},originalLedgersUnchanged=True,originalPrivateFilesUnchanged=True,sourceBinarySHA256=driver.BIN_SHA,bridgeSBF_SHA256=driver.ELF_SHA,uploadedSourceHashes=sources,processOpenPathCheckScope='Readiness fd/maps samples only; not continuous host auditing')
    (ROOT/'private-result.json').write_text(json.dumps(report,indent=2));print(json.dumps({'state':'passed','checks':len(report['checks']),'claimBroadcasts':1,'recoveredState':report['operation']['state'],'allStopped':True}))
if __name__=='__main__':main()
