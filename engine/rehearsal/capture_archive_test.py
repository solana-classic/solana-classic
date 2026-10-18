import importlib.util,io,json,os,sys,tarfile,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
for name in ['process_admission','offline_process']:
    path=Path(__file__).with_name(name+'.py');path=path if path.exists() else Path(__file__).parents[2]/'mainnet'/(name+'.py');s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
s=importlib.util.spec_from_file_location('capture_archive',Path(__file__).with_name('capture_archive.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class CaptureArchiveGuards(unittest.TestCase):
    def setUp(self):self.mask=os.umask(0o077)
    def tearDown(self):os.umask(self.mask)
    def fixture(self,base):
        p=base/'bundle';p.mkdir(mode=0o700)
        for name in r.NAMES:
            q=p/name;q.parent.mkdir(mode=0o700,parents=True,exist_ok=True);q.write_bytes(('private-test-'+name).encode())
        return p
    def test_exact_bounded_roundtrip_and_private_modes(self):
        with tempfile.TemporaryDirectory() as d:
            b=Path(d).resolve();p=self.fixture(b);original=r.bundle(p);a=b/'captures.tar';digest=r.archive(p,a);out=b/'restored';r.restore(a,out,digest);self.assertEqual(r.bundle(out),original);self.assertEqual(a.stat().st_mode&0o777,0o600)
            for f in out.rglob('*'):self.assertEqual(f.stat().st_mode&0o777,0o700 if f.is_dir() else 0o600)
    def test_changed_archive_or_existing_target_refuses_without_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            b=Path(d).resolve();a=b/'captures.tar';r.archive(self.fixture(b),a);out=b/'restored'
            with self.assertRaises(AssertionError):r.restore(a,out,'0'*64)
            self.assertFalse(out.exists());out.mkdir()
            with self.assertRaises(AssertionError):r.restore(a,out,r.sha(a.read_bytes()))
    def test_member_traversal_links_duplicates_and_oversize_refuse(self):
        for mode in ['path','symlink','hardlink','duplicate','oversize']:
            with tempfile.TemporaryDirectory() as d:
                b=Path(d).resolve();a=b/'bad.tar'
                with tarfile.open(a,'w') as tar:
                    names=sorted(r.NAMES)
                    for i,name in enumerate(names):
                        m=tarfile.TarInfo(name);value=b'x'
                        if i==0:
                            if mode=='path':m.name='../escape'
                            if mode=='symlink':m.type=tarfile.SYMTYPE;m.linkname='../escape'
                            if mode=='hardlink':m.type=tarfile.LNKTYPE;m.linkname=names[1]
                            if mode=='duplicate':m.name=names[1]
                            if mode=='oversize':value=b'x'*(1048576+1)
                        m.size=len(value) if m.isfile() else 0;tar.addfile(m,io.BytesIO(value) if m.isfile() else None)
                with self.assertRaises(AssertionError):r.restore(a,b/'restored',r.sha(a.read_bytes()))
                self.assertFalse((b/'restored').exists());self.assertFalse((b/'escape').exists())
    def test_unknown_missing_hardlinked_or_open_files_refuse(self):
        for mode in ['extra','missing','hardlink','public']:
            with tempfile.TemporaryDirectory() as d:
                b=Path(d).resolve();p=self.fixture(b);f=p/next(iter(r.NAMES))
                if mode=='extra':(p/'unexpected').write_text('x')
                if mode=='missing':f.unlink()
                if mode=='hardlink':os.link(f,b/'linked')
                if mode=='public':f.chmod(0o644)
                with self.assertRaises(AssertionError):r.archive(p,b/'captures.tar')
                self.assertFalse((b/'captures.tar').exists())
    def test_exact_worker_and_disjoint_private_roots_required(self):
        with patch.object(r,'private_directory',side_effect=lambda p:Path(p)):
            c={'scope':'private-capture-archive-v1','attemptDirectory':'/data/new','sourceDirectory':'/data/old'};self.assertEqual(r.validate_config(c,r.WORKER),(Path('/data/new'),Path('/data/old')))
            for key in r.WORKER:
                with self.assertRaises(AssertionError):r.validate_config(c,{**r.WORKER,key:'wrong'})
            for change in [{'attemptDirectory':'/data/old/sub'},{'attemptDirectory':'/data'},{'sourceDirectory':'/tmp/old'},{'extra':True}]:
                with self.assertRaises(AssertionError):r.validate_config({**c,**change},r.WORKER)
    def test_reserved_attempt_never_reads_inputs_or_runs_tools(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d).resolve();(p/'attempt.json').write_text('{"state":"failed"}')
            with patch.object(r,'validate_config',return_value=(p,p/'source')),patch.object(r,'read_private') as read,patch.object(r,'run_tool') as run:
                with self.assertRaises(FileExistsError):r.main({})
                read.assert_not_called();run.assert_not_called()
            self.assertEqual((p/'attempt.json').read_text(),'{"state":"failed"}')
if __name__=='__main__':unittest.main()
