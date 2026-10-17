import bz2,hashlib,importlib.util,io,json,sys,tarfile,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from consensus_test import fixture
s=importlib.util.spec_from_file_location('bundle_inspection',Path(__file__).with_name('consensus.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class BundleInspection(unittest.TestCase):
 def tool(self,root,code):
  file=root/'fixture-tool';file.write_text('#!'+sys.executable+'\n'+code+'\n');file.chmod(0o700)
  return file,m.host.sha(file),file.stat().st_size
 def test_real_small_inspection_returns_only_stdout_and_creates_no_log(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);tool,pin,size=self.tool(root,"import os;os.write(2,b'private diagnostic');print('public-key')")
   self.assertEqual(m.inspect_tool(tool,[],pin,size,2,128),b'public-key\n')
   self.assertEqual([p.name for p in root.iterdir()],['fixture-tool'])
 def test_real_excess_stdout_and_stderr_refuse_before_return(self):
  for descriptor,count,limit,error in [(1,1048576,128,'STDOUT_LIMIT'),(2,131072,128,'STDERR_LIMIT')]:
   with self.subTest(descriptor=descriptor),tempfile.TemporaryDirectory() as tmp:
    tool,pin,size=self.tool(Path(tmp),'import os;os.write('+str(descriptor)+',b"x"*'+str(count)+')')
    with self.assertRaisesRegex(ValueError,error):m.inspect_tool(tool,[],pin,size,2,limit)
 def test_changed_or_symlinked_executable_never_starts(self):
  for mode in ['bytes','size','symlink']:
   with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);tool,pin,size=self.tool(root,'print("original")')
    if mode=='bytes':tool.write_bytes(tool.read_bytes().replace(b'original',b'modified'))
    if mode=='size':size+=1
    if mode=='symlink':
     other=root/'other';tool.rename(other);tool.symlink_to(other)
    with patch.object(m.offline_process,'run_tool') as run,self.assertRaises(ValueError):m.inspect_tool(tool,[],pin,size,2,128)
    run.assert_not_called()
 def test_real_nonzero_failure_does_not_expose_private_stderr(self):
  with tempfile.TemporaryDirectory() as tmp:
   tool,pin,size=self.tool(Path(tmp),"import sys;sys.stderr.write('private account');sys.exit(1)")
   with self.assertRaisesRegex(ValueError,'^OFFLINE_PREPARATION_TOOL_FAILED$'):m.inspect_tool(tool,[],pin,size,2,128)
 def test_nonexecutable_inspection_file_refuses_before_invocation(self):
  with tempfile.TemporaryDirectory() as tmp:
   tool,pin,size=self.tool(Path(tmp),'print("fixture")');tool.chmod(0o600)
   with patch.object(m.offline_process,'run_tool',return_value=b'not executed') as run:
    with self.assertRaisesRegex(ValueError,'^REVIEWED_INSPECTION_TOOL_REQUIRED$'):m.inspect_tool(tool,[],pin,size,2,128)
    run.assert_not_called()
 def test_wrong_length_refuses_before_opening_or_invoking(self):
  with tempfile.TemporaryDirectory() as tmp:
   tool,pin,size=self.tool(Path(tmp),'print("fixture")')
   with patch.object(Path,'open',side_effect=AssertionError('Wrong length must refuse before a buffered read')),patch.object(m.host.os,'open',side_effect=AssertionError('Wrong length must refuse before descriptor open')),patch.object(m.offline_process,'run_tool') as run:
    with self.assertRaisesRegex(ValueError,'^REVIEWED_INSPECTION_TOOL_REQUIRED$'):m.inspect_tool(tool,[],pin,size+1,2,128)
    run.assert_not_called()
 def test_same_byte_replacement_during_inspection_hash_refuses(self):
  with tempfile.TemporaryDirectory() as tmp:
   tool,pin,size=self.tool(Path(tmp),'print("fixture")');replacement=tool.with_name('replacement');replacement.write_bytes(tool.read_bytes());replacement.chmod(0o700)
   opened=Path.open;read=m.host.os.read;changed=False
   def replace():
    nonlocal changed
    if not changed:changed=True;replacement.replace(tool)
   def open_and_replace(path,*args,**kwargs):
    handle=opened(path,*args,**kwargs)
    if path==tool:replace()
    return handle
   def read_and_replace(fd,count):
    data=read(fd,count);replace();return data
   with patch.object(Path,'open',open_and_replace),patch.object(m.host.os,'read',side_effect=read_and_replace),patch.object(m.offline_process,'run_tool',return_value=b'not executed') as run:
    with self.assertRaisesRegex(ValueError,'^REVIEWED_INSPECTION_TOOL_REQUIRED$'):m.inspect_tool(tool,[],pin,size,2,128)
    run.assert_not_called()
   self.assertTrue(changed)
 def test_inspection_fingerprint_io_failure_is_path_free(self):
  with tempfile.TemporaryDirectory() as tmp:
   tool,pin,size=self.tool(Path(tmp),'print("fixture")')
   with patch.object(m.host,'binary_fingerprint',side_effect=OSError('private fixture path')),patch.object(m.offline_process,'run_tool',return_value=b'not executed') as run:
    with self.assertRaisesRegex(ValueError,'^REVIEWED_INSPECTION_TOOL_REQUIRED$'):m.inspect_tool(tool,[],pin,size,2,128)
    run.assert_not_called()
 def bundle(self,base):
  manifest,audit=fixture();bundle=base/'bundles'/'fixture';g=bundle/'genesis';g.mkdir(parents=True);keys=bundle/'keys';keys.mkdir()
  genesis=b'fresh synthetic genesis';(g/'genesis.bin').write_bytes(genesis);raw=io.BytesIO()
  with tarfile.open(fileobj=raw,mode='w:') as archive:
   for name,data in [('genesis.bin',genesis),('rocksdb/CURRENT',b'MANIFEST-000001')]:
    entry=tarfile.TarInfo(name);entry.size=len(data);archive.addfile(entry,io.BytesIO(data))
  compressed=bz2.compress(raw.getvalue());(g/'genesis.tar.bz2').write_bytes(compressed)
  manifest['genesisBinSHA256']=hashlib.sha256(genesis).hexdigest();manifest['genesisArchiveSHA256']=hashlib.sha256(compressed).hexdigest()
  (bundle/'manifest.json').write_text(json.dumps(manifest))
  for i in range(3):
   key=keys/('node-'+str(i)+'-identity.json');key.write_text('synthetic placeholder');key.chmod(0o600)
  return bundle,manifest,audit
 def test_complete_bundle_uses_selected_auditor_and_three_bounded_public_key_reads(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();bundle,manifest,audit=self.bundle(base);binaries=base/'tools'
   def inspect(binary,args,pin,size,timeout,stdout_limit):
    if binary.name=='classic-genesis-audit-v2':
     self.assertEqual((timeout,stdout_limit),(20,4*1024**2));return json.dumps(audit).encode()
    self.assertEqual(binary,binaries/'solana-keygen');self.assertEqual(args[0],'pubkey');self.assertEqual((pin,size),m.host.PINS['solana-keygen']);self.assertEqual((timeout,stdout_limit),(10,128))
    i=int(args[1].name.split('-')[1]);return (manifest['validators'][i]['identity']+'\n').encode()
   before=sorted(str(p.relative_to(base)) for p in base.rglob('*'))
   with patch.object(m,'BASE',base),patch.object(m,'inspect_tool',side_effect=inspect) as run:
    result,summary=m.check_bundle(bundle,binaries)
   self.assertEqual(result,manifest);self.assertTrue(summary['archiveGenesisMatches']);self.assertEqual(run.call_count,4)
   self.assertEqual(before,sorted(str(p.relative_to(base)) for p in base.rglob('*')))
 def test_tool_failure_or_wrong_identity_never_produces_bundle_acceptance(self):
  for fault in ['auditor','keygen','identity']:
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp).resolve();bundle,manifest,audit=self.bundle(base)
    def inspect(binary,*args):
     if binary.name=='classic-genesis-audit-v2':
      if fault=='auditor':raise ValueError('OFFLINE_TOOL_STDOUT_LIMIT')
      return json.dumps(audit).encode()
     if fault=='keygen':raise ValueError('OFFLINE_TOOL_TIMEOUT')
     return b'11111111111111111111111111111111'
    with patch.object(m,'BASE',base),patch.object(m,'inspect_tool',side_effect=inspect),self.assertRaises(ValueError):m.check_bundle(bundle,base/'tools')

if __name__=='__main__':unittest.main()
