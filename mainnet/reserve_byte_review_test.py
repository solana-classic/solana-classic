import importlib.util,json,tempfile,unittest,hashlib,os
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('reserve_byte_review',Path(__file__).with_name('reserve_byte_review.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ReserveByteReview(unittest.TestCase):
 def test_wrong_or_canonical_worker_refuses_before_inputs_or_attempt(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve()
   with patch.object(m,'ROOT',root):
    m.admit(root,m.WORKER)
    for k in m.WORKER:
     with self.assertRaisesRegex(ValueError,'EXACT_SEPARATE_WORKER'):m.admit(root,{**m.WORKER,k:'wrong'})
   self.assertEqual(list(root.iterdir()),[])
 def test_retained_outputs_and_target_cannot_be_reused(self):
  for name in ['attempt.json','decoded-private.json','integration-result-private.json','target']:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d).resolve();(root/name).write_text('retained')
    with patch.object(m,'ROOT',root),self.assertRaisesRegex(ValueError,'RETAINED'):m.admit(root,m.WORKER)
    self.assertEqual((root/name).read_text(),'retained')
 def test_alias_and_open_directory_refuse(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();target=root/'target';target.mkdir(mode=0o700);alias=root/'alias';alias.symlink_to(target,target_is_directory=True)
   with patch.object(m,'ROOT',alias),self.assertRaisesRegex(ValueError,'EXACT_PRIVATE'):m.admit(alias,m.WORKER)
   target.chmod(0o755)
   with patch.object(m,'ROOT',target),self.assertRaisesRegex(ValueError,'EXACT_PRIVATE'):m.admit(target,m.WORKER)
 def test_source_paths_and_hashes_are_selected_without_processes(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();(root/'public.txt').write_bytes(b'public');good={'public.txt':hashlib.sha256(b'public').hexdigest()};m.sources(root,good)
   for invalid in [{}, {'../escape':'0'*64},{'/absolute':'0'*64},{'public.txt':'0'*64}]:
    with self.assertRaises(ValueError):m.sources(root,invalid)
 def test_selected_inputs_reject_hash_alias_write_permissions_and_size(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();p=root/'input';p.write_bytes(b'bytes');sha=hashlib.sha256(b'bytes').hexdigest();alias=root/'alias';alias.symlink_to(p)
   self.assertEqual(m.selected_file(p,sha,5),b'bytes')
   for path,digest,maximum in [(p,'0'*64,5),(alias,sha,5),(p,sha,4)]:
    with self.assertRaises(ValueError):m.selected_file(path,digest,maximum)
   if hasattr(os,'mkfifo'):
    fifo=root/'fifo';os.mkfifo(fifo)
    with self.assertRaisesRegex(ValueError,'SELECTED_FILE_ADMISSION_FAILED'):m.selected_file(fifo,sha,5)
   p.chmod(0o666)
   with self.assertRaises(ValueError):m.selected_file(p,sha,5)
 def test_offline_tool_failure_retains_attempt_without_raw_errors_or_replay(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();(root/'public.txt').write_bytes(b'public');(root/'public-source-hashes.json').write_text(json.dumps({'public.txt':hashlib.sha256(b'public').hexdigest()}));selection={}
   for name,data in [('genesis',b'genesis'),('metadata',b'{}'),('binary',b'binary')]:
    p=root/name;p.write_bytes(data);selection[name]=str(p);selection[name+'_sha256']=hashlib.sha256(data).hexdigest()
   with patch.object(m,'ROOT',root),patch.dict(os.environ,m.WORKER),patch.object(m,'CORE',{}),patch.object(m,'no_active_validator'),patch.object(m,'dependencies'),patch.object(m,'run_tool',side_effect=OSError('PRIVATE INPUT MUST NOT APPEAR')):
    before=os.umask(0o077)
    try:r=m.run(root,selection)
    finally:os.umask(before)
    self.assertEqual(r['state'],'failed');self.assertEqual(r['failureCode'],'OFFLINE_ALLOCATION_REVIEW_REFUSED');self.assertNotIn('PRIVATE INPUT',json.dumps(r));self.assertTrue((root/'attempt.json').exists());self.assertFalse((root/'decoded-private.json').exists())
    with self.assertRaisesRegex(ValueError,'RETAINED'):m.run(root,selection)
if __name__=='__main__':unittest.main()
