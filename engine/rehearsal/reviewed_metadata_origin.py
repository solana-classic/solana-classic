"""Read-only exact-mint policy verification on one NEW cold origin copy."""
from pathlib import Path
import json,os,shutil,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import inventory,copy_cold_ledger,sha
ROOT=Path('/data/bridge-reviewed-metadata-origin-v1')
SOURCE=Path('/data/bridge-metadata-observer-v1')
PORT=25899

def validate(m,r):
    assert m['scope']=='fresh-private-metadata-origin' and r['state']=='passed' and r['processes']['allStopped']
    assert m['genesis']==r['genesis'] and m['genesis'] not in driver.FORBIDDEN
    assert len(r['signatures'])==4 and all(s['state']=='finalized' for s in r['signatures']) and r['settlementBroadcasts']==0
    assert r['sourceBinarySHA256']==driver.BIN_SHA and r['bridgeSBF_SHA256']==driver.ELF_SHA and r['tokenSHA256']==driver.TOKEN_SHA
    assert r['observation']['mintLayout']=='immutable-self-metadata-v1' and r['observation']['tokenCodeVerified']

def command():
    return [str(driver.BIN),'--ledger',str(ROOT/'ledger'),'--rpc-port',str(PORT),'--faucet-port',str(PORT+2),'--gossip-port','27000','--bind-address','127.0.0.1','--dynamic-port-range','27001-27060','--limit-ledger-size','50000','--quiet']

def ready(genesis,health,slot,expected,minimum):
    return genesis==expected and genesis not in driver.FORBIDDEN and health=='ok' and isinstance(slot,int) and not isinstance(slot,bool) and isinstance(minimum,int) and not isinstance(minimum,bool) and 0<=minimum<=slot

def main():
    os.umask(0o077)
    assert os.environ.get('RAILWAY_PROJECT_ID')=='356bcb0b-49c4-4bd3-bf10-bff7db8f33fe' and os.environ.get('RAILWAY_ENVIRONMENT_ID')=='3367b373-2332-4702-8cce-c12b8f03949e' and os.environ.get('RAILWAY_SERVICE_ID')=='29189101-226c-483b-a424-b8cd140abd80'
    assert ROOT.is_dir() and not (ROOT/'ledger').exists()
    with (ROOT/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'state':'admitting','starts':0,'stops':[],'scope':'Read-only private metadata origin copy; no submissions','canonicalNetworkChanged':False,'productionReady':False}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    process=None
    try:
        m=json.loads((SOURCE/'private-input.json').read_text());r=json.loads((SOURCE/'public-result.json').read_text());validate(m,r)
        assert sha(driver.BIN)==driver.BIN_SHA and sha(ROOT/'bridge.so')==driver.ELF_SHA and sha(ROOT/'token2022.so')==driver.TOKEN_SHA
        hashes=json.loads((ROOT/'public-source-hashes.json').read_text());assert hashes and all(sha(ROOT/n)==v for n,v in hashes.items())
        for proc in Path('/proc').glob('[0-9]*'):
            try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
            except OSError:continue
            assert first not in [str(driver.BIN).encode(),b'/data/target/release/agave-validator'],'Another private validator is active'
        for port in [PORT,PORT+1,PORT+2,27000,*range(27001,27061)]:
            for typ in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
                with socket.socket(type=typ) as sock:sock.bind(('127.0.0.1',port))
        assert shutil.disk_usage('/data').free>4*1024**3
        cold=inventory(SOURCE/'ledger')[0];protected={name:sha(SOURCE/name) for name in ['private-input.json','public-result.json',*[p.name for p in SOURCE.glob('transaction-*-private.json')]]};assert len(protected)==6
        state.update(originalInventory=cold,protectedSourceHashes=protected);save();copy_cold_ledger(SOURCE/'ledger',ROOT/'ledger')
        modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True);(modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
        with (ROOT/'prepare-private.log').open('xb') as log:subprocess.run(['node',str(ROOT/'prepare-reviewed-metadata.mjs')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=30)
        selected=json.loads((ROOT/'reviewed-policy.json').read_text());minimum=selected['minimumContextSlot'];assert selected['policy']['pins']['genesis']==m['genesis'] and isinstance(minimum,int) and minimum>=0
        with (ROOT/'validator-private.log').open('xb') as log:
            process=subprocess.Popen(command(),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);state.update(state='starting',starts=1);save();deadline=time.monotonic()+180
            while time.monotonic()<deadline:
                assert process.poll() is None,'Copied validator exited; preserve log'
                try:
                    if ready(driver.rpc(PORT,'getGenesisHash'),driver.rpc(PORT,'getHealth'),driver.rpc(PORT,'getSlot',[{'commitment':'finalized'}]),m['genesis'],minimum):break
                except (OSError,ValueError,RuntimeError):pass
                time.sleep(2)
            else:raise RuntimeError('Copied validator checkpoint readiness timed out')
            assert (Path('/proc')/str(process.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/'ledger').encode()]
            assert str(SOURCE/'ledger') not in (Path('/proc')/str(process.pid)/'maps').read_text()
            for fd in (Path('/proc')/str(process.pid)/'fd').iterdir():
                try:target=os.readlink(fd)
                except OSError:continue
                assert str(SOURCE/'ledger') not in target
            state['state']='running';save()
            with (ROOT/'verification-private.log').open('xb') as out:subprocess.run(['node',str(ROOT/'reviewed-metadata-origin.mjs')],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True,timeout=120)
            result=json.loads((ROOT/'public-result.json').read_text());assert result['state']=='passed' and result['broadcasts']==0 and result['simulations']==0
            assert inventory(SOURCE/'ledger')[0]==cold and all(sha(SOURCE/n)==v for n,v in protected.items());state['state']='passed'
    except BaseException:
        state['state']='failed';raise
    finally:
        if process is not None:
            try:state['stops'].append({'returnCode':driver.stop(process),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        save()
    assert state['state']=='passed' and process.poll() is not None
    result.update(processes={'starts':state['starts'],'stops':state['stops'],'allStopped':True},originalLedgerUnchanged=True,originalInputsAndTransactionRecordsUnchanged=True,originalInventory=cold,uploadedSourceHashes=hashes,sourceBinarySHA256=driver.BIN_SHA)
    (ROOT/'public-result.json').write_text(json.dumps(result,indent=2));print(json.dumps({'state':'passed','checks':len(result['checks']),'allStopped':True,'broadcasts':0}))
if __name__=='__main__':main()
