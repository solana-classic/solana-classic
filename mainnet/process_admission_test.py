import importlib.util,os,select,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('process_admission',Path(__file__).with_name('process_admission.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

def row(root,comm='python',argv=b'python\0',state='S',executable='/runtime/python'):
 p=root/'123';p.mkdir();(p/'comm').write_text(comm+'\n');(p/'stat').write_text('123 ('+comm+') '+state+' 1 2 3\n');(p/'cmdline').write_bytes(argv)
 if executable is not None:(p/'exe').symlink_to(executable)
 return p

class ProcessAdmission(unittest.TestCase):
 def test_full_and_linux_truncated_validator_names_refuse(self):
  for name in ['agave-validator','solana-test-validator','solana-test-val']:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as temp:
    root=Path(temp);row(root,comm=name)
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):m.no_active_validator(root)
 def test_executable_argv_zero_catches_a_renamed_comm(self):
  for executable in ['agave-validator','/runtime/solana-test-validator']:
   with self.subTest(executable=executable),tempfile.TemporaryDirectory() as temp:
    root=Path(temp);row(root,argv=os.fsencode(executable)+b'\0--ledger\0/fresh/ledger\0')
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):m.no_active_validator(root)
 def test_kernel_executable_link_catches_rewritten_argv_even_after_binary_deletion(self):
  for executable in ['/runtime/agave-validator','/runtime/solana-test-validator (deleted)']:
   with self.subTest(executable=executable),tempfile.TemporaryDirectory() as temp:
    root=Path(temp);row(root,executable=executable)
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):m.no_active_validator(root)
 def test_other_arguments_do_not_create_false_validator_and_stat_names_may_contain_spaces(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);p=row(root,comm='other ) task',argv=b'python\0solana-test-validator\0');m.no_active_validator(root)
   (p/'cmdline').write_bytes(b'');(p/'exe').unlink();m.no_active_validator(root)
 def test_exited_and_zombie_records_do_not_require_executable_or_arguments(self):
  for state in ['Z','X','x']:
   with self.subTest(state=state),tempfile.TemporaryDirectory() as temp:
    root=Path(temp);p=row(root,comm='solana-test-val',state=state);(p/'comm').unlink();(p/'cmdline').unlink();m.no_active_validator(root)
 def test_missing_malformed_or_unbounded_live_identity_evidence_refuses(self):
  for mode in ['stat','state','comm','argv','missing']:
   with self.subTest(mode=mode),tempfile.TemporaryDirectory() as temp:
    root=Path(temp);p=row(root)
    if mode=='stat':(p/'stat').write_text('not a stat record')
    if mode=='state':(p/'stat').write_text('123 (python) UNKNOWN 1 2')
    if mode=='comm':(p/'comm').write_bytes(b'x'*65)
    if mode=='argv':(p/'cmdline').write_bytes(b'x'*8193)
    if mode=='missing':(p/'cmdline').unlink()
    with self.assertRaisesRegex(ValueError,'LINUX_PROCESS_'):m.no_active_validator(root)
 def test_permission_failure_is_redacted_and_disappearing_pid_is_tolerated(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);row(root)
   with patch.object(m.os,'readlink',side_effect=PermissionError('PRIVATE FAILURE')):
    with self.assertRaisesRegex(ValueError,'^LINUX_PROCESS_CENSUS_UNAVAILABLE$'):m.no_active_validator(root)
   vanished=root/'124'
   with patch.object(m.Path,'iterdir',return_value=iter([vanished])):m.no_active_validator(root)
 def test_missing_or_unreadable_process_root_cannot_admit_an_empty_host(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   with self.assertRaisesRegex(ValueError,'LINUX_PROCESS_CENSUS_REQUIRED'):m.no_active_validator(root/'missing')
   with patch.object(m.Path,'iterdir',side_effect=PermissionError('PRIVATE FAILURE')):
    with self.assertRaisesRegex(ValueError,'^LINUX_PROCESS_CENSUS_UNAVAILABLE$'):m.no_active_validator(root)
 def test_preparation_delegates_to_shared_guard_and_launch_refuses_before_ledger_or_process_creation(self):
  spec=importlib.util.spec_from_file_location('preparation_guard',Path(__file__).with_name('prepare-consensus.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
  with patch.object(p.c.process_admission,'no_active_validator',side_effect=ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')) as guard:
   with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):p.no_active_validator()
   guard.assert_called_once_with()
  c=p.c
  with tempfile.TemporaryDirectory() as temp:
   base=Path(temp).resolve()
   with patch.object(c,'BASE',base),patch.object(c.host,'probe',return_value={}),patch.object(c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(c,'check_bundle',return_value=({},{})),patch.object(c.process_admission,'no_active_validator',side_effect=ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')),patch.object(c.subprocess,'Popen') as start:
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):c.run(base,base,'fresh-process-001',True)
    start.assert_not_called();self.assertFalse((base/'runs').exists())
 @unittest.skipUnless(sys.platform=='linux','Real Linux comm fixture')
 def test_real_linux_kernel_truncation_is_detected_without_starting_a_validator(self):
  script="import ctypes,sys;assert ctypes.CDLL(None).prctl(15,b'solana-test-validator',0,0,0)==0;print('ready',flush=True);sys.stdin.readline()"
  child=subprocess.Popen([sys.executable,'-c',script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  try:
   self.assertTrue(select.select([child.stdout],[],[],5)[0]);self.assertEqual(child.stdout.readline(),b'ready\n')
   actual=Path('/proc')/str(child.pid);self.assertEqual((actual/'comm').read_text().strip(),'solana-test-val')
   with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);(root/str(child.pid)).symlink_to(actual,target_is_directory=True)
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):m.no_active_validator(root)
  finally:
   try:child.communicate(input=b'\n',timeout=5)
   except subprocess.TimeoutExpired:child.kill();child.communicate(timeout=5)
  self.assertEqual(child.returncode,0)
if __name__=='__main__':unittest.main()
