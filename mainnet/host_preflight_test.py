import importlib.util,unittest,copy,os,subprocess,sys,tempfile,json,hashlib
from unittest import mock
from pathlib import Path
s=importlib.util.spec_from_file_location('host_preflight',Path(__file__).with_name('host-preflight.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class HostPreflight(unittest.TestCase):
 def facts(self):return {'system':'Linux','architecture':'x86_64','fileLimitSoft':1024,'fileLimitHard':1000000,'fileLimitHardUnlimited':False,'effectiveMemoryBytes':m.MIN_MEMORY,'effectiveCpuCount':4,'containerLimitsObserved':True,'availableStorageBytes':m.MIN_FREE,'binaries':{k:{'matchesReviewedArtifact':True,'executable':True} for k in m.PINS}}
 def test_exact_boundaries_admit_only_preparation(self):
  f=self.facts();r=m.assess(f);self.assertTrue(r['canPrepareFreshPrivateRehearsal']);self.assertFalse(r['canStartValidators']);self.assertFalse(r['productionReady']);self.assertFalse(r['changedLimits']);self.assertEqual(f['fileLimitSoft'],1024)
 def test_current_container_fd_ceiling_refuses_before_keys_or_start(self):
  f=self.facts();f['fileLimitHard']=524288;r=m.assess(f);self.assertIn('HARD_OPEN_FILE_LIMIT_BELOW_1000000',r['blockingReasons']);self.assertFalse(r['canPrepareFreshPrivateRehearsal']);self.assertFalse(r['createdKeys']);self.assertFalse(r['createdLedger'])
 def test_unknown_or_low_resources_refuse(self):
  for field,value in [('system','Darwin'),('architecture','arm64'),('containerLimitsObserved',False),('effectiveMemoryBytes',m.MIN_MEMORY-1),('effectiveCpuCount',3.9),('effectiveCpuCount',float('nan')),('availableStorageBytes',None),('availableStorageBytes',m.MIN_FREE-1),('fileLimitHard',True)]:
   f=self.facts();f[field]=value;self.assertFalse(m.assess(f)['canPrepareFreshPrivateRehearsal'])
 def test_missing_or_nonexecutable_or_changed_binary_refuses(self):
  for name in m.PINS:
   for mode in ['missing','changed','executable']:
    f=self.facts()
    if mode=='missing':del f['binaries'][name]
    elif mode=='changed':f['binaries'][name]['matchesReviewedArtifact']=False
    else:f['binaries'][name]['executable']=False
    self.assertFalse(m.assess(f)['canPrepareFreshPrivateRehearsal'])
 def test_unlimited_hard_limit_is_explicit_and_does_not_change_soft_limit(self):
  f=self.facts();f['fileLimitHard']=None;self.assertFalse(m.assess(f)['canPrepareFreshPrivateRehearsal']);f['fileLimitHardUnlimited']=True;self.assertTrue(m.assess(f)['canPrepareFreshPrivateRehearsal']);self.assertEqual(f['fileLimitSoft'],1024)
class BinaryAdmission(unittest.TestCase):
 def test_fifo_in_probe_refuses_without_waiting_for_a_writer(self):
  with tempfile.TemporaryDirectory() as raw:
   root=Path(raw);os.mkfifo(root/'agave-validator')
   for name in ['solana-genesis','solana-keygen']:(root/name).write_bytes(b'x')
   code="""import importlib.util,sys,json
from pathlib import Path
s=importlib.util.spec_from_file_location('h',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
m.PINS={name:('0'*64,1) for name in m.PINS}
f=m.probe(sys.argv[2],sys.argv[2]);assert f['binaries']['agave-validator']['matchesReviewedArtifact'] is False
print('refused')
"""
   r=subprocess.run([sys.executable,'-B','-c',code,str(Path(m.__file__)),raw],capture_output=True,text=True,timeout=3)
   self.assertEqual(r.returncode,0);self.assertEqual(r.stdout.strip(),'refused')

 def test_exact_regular_binary_hash_and_executable_status(self):
  with tempfile.TemporaryDirectory() as raw:
   p=Path(raw)/'binary';p.write_bytes(b'public fixture');p.chmod(0o700)
   self.assertEqual(m.binary_fingerprint(p,14),{'bytes':14,'sha256':hashlib.sha256(b'public fixture').hexdigest(),'executable':True})
   p.chmod(0o600);self.assertFalse(m.binary_fingerprint(p,14)['executable'])
   for size in [0,-1,13,15,True]:
    with self.assertRaises(ValueError):m.binary_fingerprint(p,size)
 def test_aliases_special_files_and_wrong_sizes_refuse_before_read(self):
  with tempfile.TemporaryDirectory() as raw:
   root=Path(raw);p=root/'binary';p.write_bytes(b'x');alias=root/'alias';alias.symlink_to(p);directory=root/'directory';directory.mkdir();fifo=root/'fifo';os.mkfifo(fifo)
   with mock.patch.object(m.os,'read',side_effect=AssertionError('Unsafe file read')):
    for entry in [alias,directory,fifo]:
     with self.assertRaises(ValueError):m.binary_fingerprint(entry,1)
    with self.assertRaises(ValueError):m.binary_fingerprint(p,2)
 def test_content_growth_replacement_and_mode_changes_during_read_refuse(self):
  for mutation in ['replace','grow','mode']:
   with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as raw:
    root=Path(raw);p=root/'binary';p.write_bytes(b'original');p.chmod(0o700);read=os.read;changed=False
    def change(fd,size):
     nonlocal changed
     data=read(fd,size)
     if not changed:
      changed=True
      if mutation=='replace':
       replacement=root/'replacement';replacement.write_bytes(b'original');replacement.replace(p)
      elif mutation=='grow':
       with p.open('ab') as output:output.write(b'!')
      else:p.chmod(0o600)
     return data
    with mock.patch.object(m.os,'read',side_effect=change):
     with self.assertRaises(ValueError):m.binary_fingerprint(p,8)
 def test_descriptor_closes_when_the_read_fails(self):
  with tempfile.TemporaryDirectory() as raw:
   p=Path(raw)/'binary';p.write_bytes(b'x');opened=[];original=m.os.open
   def capture(*args,**kwargs):
    fd=original(*args,**kwargs);opened.append(fd);return fd
   with mock.patch.object(m.os,'open',side_effect=capture),mock.patch.object(m.os,'read',side_effect=OSError('Controlled read failure')):
    with self.assertRaises(OSError):m.binary_fingerprint(p,1)
   self.assertEqual(len(opened),1)
   with self.assertRaises(OSError):os.fstat(opened[0])

if __name__=='__main__':unittest.main()
