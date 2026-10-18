"""Archive only selected private capture files; no validator, ledger or RPC use."""
from pathlib import Path,PurePosixPath
import argparse,hashlib,io,json,os,stat,tarfile
from process_admission import no_active_validator
from offline_process import run_tool
FILES=['observation.json','response-record.json','response.rpc.json','selection.json','signature-status/response-record.json','signature-status/response.rpc.json','signature-status/selection.json']
NAMES={f'capture-{i}/{name}' for i in range(2) for name in FILES}|{f'source-receipt-{i}.json' for i in range(2)}
WORKER={'RAILWAY_PROJECT_ID':'356bcb0b-49c4-4bd3-bf10-bff7db8f33fe','RAILWAY_ENVIRONMENT_ID':'3367b373-2332-4702-8cce-c12b8f03949e','RAILWAY_SERVICE_ID':'29189101-226c-483b-a424-b8cd140abd80'}
def sha(b):return hashlib.sha256(b).hexdigest()
def private_directory(path):
    p=Path(path);s=p.lstat();assert p==p.resolve(strict=True) and stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o700
    return p

def read_private(path,limit=1048576):
    path=Path(path);assert path==path.resolve(strict=True);s=path.lstat();assert stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and 0<s.st_size<=limit
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    def same(a,b):return (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns)
    with os.fdopen(fd,'rb') as f:
        assert same(s,os.fstat(f.fileno()));data=f.read(limit+1);assert len(data)==s.st_size and same(s,os.fstat(f.fileno())) and same(s,path.lstat())
    return data

def bundle(root):
    root=private_directory(root);found=set();rows={};total=0
    for p in root.rglob('*'):
        name=p.relative_to(root).as_posix();s=p.lstat()
        if stat.S_ISDIR(s.st_mode):assert name in {'capture-0','capture-1','capture-0/signature-status','capture-1/signature-status'};private_directory(p)
        else:assert name in NAMES;found.add(name);data=read_private(p);total+=len(data);assert total<=3*1024**2;rows[name]=data
    assert found==NAMES
    return rows

def archive(root,path):
    rows=bundle(root);path=Path(path);private_directory(path.parent);assert not path.exists()
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as output:
        with tarfile.open(fileobj=output,mode='w',format=tarfile.USTAR_FORMAT) as tar:
            for name,data in sorted(rows.items()):
                entry=tarfile.TarInfo(name);entry.size=len(data);entry.mode=0o600;tar.addfile(entry,io.BytesIO(data))
        output.flush();os.fsync(output.fileno())
    return sha(read_private(path,4*1024**2))

def restore(path,destination,expected):
    data=read_private(path,4*1024**2);assert sha(data)==expected,'Archive differs from external selection'
    destination=Path(destination);private_directory(destination.parent);assert destination==destination.resolve(strict=False) and not destination.exists();members=[]
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:') as tar:
        all_members=tar.getmembers();assert len(all_members)==len(NAMES);seen=set();total=0
        for m in all_members:
            name=PurePosixPath(m.name);assert m.name in NAMES and m.name==name.as_posix() and not name.is_absolute() and '..' not in name.parts and m.name not in seen and m.isfile() and not m.sparse and not m.linkname
            assert 0<m.size<=1048576;total+=m.size;assert total<=3*1024**2;seen.add(m.name);stream=tar.extractfile(m);assert stream is not None
            with stream:value=stream.read(m.size+1)
            assert len(value)==m.size;members.append((m.name,value))
        assert seen==NAMES
    destination.mkdir(mode=0o700)
    for name,value in members:
        path=destination/name;path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:f.write(value);f.flush();os.fsync(f.fileno())
    assert bundle(destination)==dict(members)

def validate_config(config,env):
    assert set(config)=={'scope','attemptDirectory','sourceDirectory'} and config['scope']=='private-capture-archive-v1'
    assert all(env.get(k)==v for k,v in WORKER.items()),'Exact separate private worker required'
    root=private_directory(config['attemptDirectory']);source=private_directory(config['sourceDirectory'])
    assert all(p.is_absolute() and p.is_relative_to('/data') and p!=Path('/data') for p in [root,source]);assert not root.is_relative_to(source) and not source.is_relative_to(root)
    return root,source

def main(config):
    os.umask(0o077);root,source=validate_config(config,os.environ)
    with (root/'attempt.json').open('x') as f:f.write('{"state":"admitting"}')
    state={'state':'admitting','scope':'Selected private source-capture archive restore only; no ledgers or chain operations','checks':[],'validatorStarts':0,'chainRPCRequests':0,'signaturesCreated':0,'submissions':0,'canonicalNetworkChanged':False,'productionReady':False}
    def save():(root/'attempt.json').write_text(json.dumps(state,indent=2))
    def passed(name):state['checks'].append(name);save()
    def phase(name):
        with (root/('phase-'+name+'-private.log')).open('xb') as log:run_tool(['node',str(root/'capture-archive.mjs'),name],log,timeout=30,stdout_limit=65536,stderr_limit=65536)
    try:
        no_active_validator();sources=json.loads(read_private(root/'public-source-hashes.json'));assert all(sha(read_private(root/name))==pin for name,pin in sources.items())
        report=json.loads(read_private(source/'private-result.json'));attempt=json.loads(read_private(source/'attempt.json'))
        assert report['state']==attempt['state']=='passed' and report['processes']['allStopped'] and len(attempt['starts'])==len(attempt['stops'])==2
        assert report['sourceBroadcasts']==report['claimBroadcasts']==len(report['sourceCaptures'])==2 and all(c['captureCompleted'] for c in report['sourceCaptures']) and report['canonicalNetworkChanged'] is False and report['productionReady'] is False
        assert all(sha(read_private(source/name))==pin for name,pin in report['uploadedSourceHashes'].items())
        originals={f'capture-{i}/{name}':read_private(source/f'source-capture-{i}'/name) for i in range(2) for name in FILES}
        originals.update({f'source-receipt-{i}.json':read_private(source/f'transaction-source-{i}-private.json') for i in range(2)});old_report=sha(read_private(source/'private-result.json'));old_attempt=sha(read_private(source/'attempt.json'))
        working=root/'working';working.mkdir(mode=0o700)
        for name,data in originals.items():
            p=working/name;p.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            with p.open('xb') as f:f.write(data)
        modules=root/'node_modules/@solana';modules.mkdir(parents=True);(modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
        phase('baseline');passed('Both retained signed-source economics and externally selected capture digests match before archive')
        selected=archive(working,root/'captures-private.tar');restore(root/'captures-private.tar',root/'restored',selected);assert bundle(root/'restored')==originals;passed('Owner-only archive restores all sixteen exact selected files without a ledger or validator')
        bad=bytearray(read_private(root/'captures-private.tar',4*1024**2));bad[0]^=1
        with (root/'corrupted-captures-private.tar').open('xb') as f:f.write(bad)
        try:restore(root/'corrupted-captures-private.tar',root/'refused',selected)
        except AssertionError:assert not (root/'refused').exists()
        else:raise AssertionError('Changed archive was accepted')
        passed('Changed archive hash refuses before any extraction directory exists')
        phase('restored');passed('Separate offline review rechecks both restored original signatures, raw status and exact economic metadata')
        for name,data in originals.items():
            path=source/('source-capture-'+name[8]+'/'+name.split('/',1)[1]) if name.startswith('capture-') else source/('transaction-source-'+name[len('source-receipt-')]+'-private.json')
            assert read_private(path)==data
        assert sha(read_private(source/'private-result.json'))==old_report and sha(read_private(source/'attempt.json'))==old_attempt and all(sha(read_private(root/name))==pin for name,pin in sources.items());no_active_validator();passed('Original selected captures, signed receipts, completed report and staged public sources stay unchanged')
        state.update(state='passed',restoredCaptures=2,restoredFiles=16,archiveVerified=True,alteredArchiveRefused=True,originalCaptureFilesUnchanged=True,privateValidatorCensusClear=True,oldNativeHistoryRecovered=False,independentFinalityVerified=False,historicalCodeVerified=False,completeHistoryVerified=False,backingVerified=False,settlementAccepted=False);save()
        print(json.dumps({'state':'passed','checks':len(state['checks']),'restoredCaptures':2,'validatorStarts':0,'submissions':0}))
    except BaseException:state['state']='failed';save();raise

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--private-config',required=True);main(json.loads(Path(p.parse_args().private_config).read_text()))
