import hashlib,io,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import reserve_adapter_process as m

class ReserveAdapterProcess(unittest.TestCase):
 def setUp(self):
  self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
  self.root=Path(self.directory.name).resolve();self.node=self.root/'runtime';self.bundle=self.root/'bundle'
  self.node.write_bytes(b'selected runtime');self.node.chmod(0o700);self.bundle.write_bytes(b'selected bundle');self.bundle.chmod(0o600)
  self.options={'node_sha256':hashlib.sha256(self.node.read_bytes()).hexdigest(),'node_bytes':self.node.stat().st_size,'bundle_sha256':hashlib.sha256(self.bundle.read_bytes()).hexdigest(),'bundle_bytes':self.bundle.stat().st_size,'mode':'prepare','input_bytes':b'private input','log':io.BytesIO()}
 def run_selected(self,**changes):return m.run_selected(self.node,self.bundle,**{**self.options,**changes})
 def test_fixed_invocation_selects_empty_environment_and_adapter_limits(self):
  with patch.object(m.offline_process,'run_tool',return_value=b'{"result":1}') as run:
   self.assertEqual(self.run_selected(),b'{"result":1}')
  args,kw=run.call_args
  self.assertEqual(args,([str(self.node),str(self.bundle),'prepare'],self.options['log']))
  self.assertEqual(kw,{'input_bytes':b'private input','environment':{},'stdin_limit':32*1024**2,'stdout_limit':1024**2,'stderr_limit':65536,'timeout':30})
 def test_bad_selection_or_input_never_starts_process(self):
  for options in [{'node_sha256':'0'*64},{'bundle_sha256':'0'*64},{'node_bytes':True},{'bundle_bytes':4*1024**2+1},{'mode':'--eval'},{'mode':['prepare']},{'input_bytes':b''},{'input_bytes':bytearray(b'x')},{'input_bytes':b'x'*(32*1024**2+1)}]:
   with self.subTest(fields=list(options)),patch.object(m.offline_process,'run_tool') as run,self.assertRaises(ValueError):self.run_selected(**options)
   run.assert_not_called()
 def test_canonical_service_refuses_before_artifact_reads(self):
  with patch.dict(os.environ,{'RAILWAY_SERVICE_ID':m.CANONICAL_SERVICE}),patch.object(m,'artifact') as check,self.assertRaisesRegex(ValueError,'^CANONICAL_SERVICE_FORBIDDEN$'):self.run_selected()
  check.assert_not_called()
 def test_alias_fifo_hardlink_and_writable_files_are_refused(self):
  alias=self.root/'alias';alias.symlink_to(self.bundle)
  parent=self.root/'alias-directory';parent.symlink_to(self.root,target_is_directory=True)
  for selected in [alias,parent/'bundle',Path('relative')]:
   with self.subTest(kind=str(selected.name)),self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_ARTIFACT_REQUIRED$'):m.artifact(selected,self.options['bundle_sha256'],self.options['bundle_bytes'],m.MAX_BUNDLE_BYTES)
  hard=self.root/'hard';os.link(self.bundle,hard)
  with self.assertRaises(ValueError):m.artifact(hard,self.options['bundle_sha256'],self.options['bundle_bytes'],m.MAX_BUNDLE_BYTES)
  hard.unlink();self.bundle.chmod(0o666)
  with self.assertRaises(ValueError):self.run_selected()
  fifo=self.root/'fifo';os.mkfifo(fifo)
  with self.assertRaises(ValueError):m.artifact(fifo,'0'*64,1,m.MAX_BUNDLE_BYTES)
 def test_replacement_or_in_place_change_during_read_is_refused(self):
  for replace in [False,True]:
   before=self.bundle.read_bytes();inode=self.bundle.stat().st_ino;read=os.read;changed=False
   def mutate(fd,amount):
    nonlocal changed
    block=read(fd,amount)
    if not changed and os.fstat(fd).st_ino==inode:
     changed=True
     if replace:
      replacement=self.root/'during-read';replacement.write_bytes(before);replacement.chmod(0o600);replacement.replace(self.bundle)
     else:self.bundle.write_bytes(before+b'changed')
    return block
   with self.subTest(replacement=replace),patch.object(m.os,'read',side_effect=mutate),self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_ARTIFACT_REQUIRED$'):
    m.artifact(self.bundle,self.options['bundle_sha256'],self.options['bundle_bytes'],m.MAX_BUNDLE_BYTES)
   self.assertTrue(changed);self.bundle.write_bytes(before)
 def test_runtime_requires_execute_permission(self):
  self.node.chmod(0o600)
  with patch.object(m.offline_process,'run_tool') as run,self.assertRaises(ValueError):self.run_selected()
  run.assert_not_called()
 def test_change_after_execution_withholds_stdout(self):
  for target in [self.node,self.bundle]:
   saved=target.read_bytes()
   def changed(*args,**kwargs):target.write_bytes(saved+b'changed');return b'private success'
   with self.subTest(target=target.name),patch.object(m.offline_process,'run_tool',side_effect=changed),self.assertRaises(ValueError):self.run_selected()
   target.write_bytes(saved)
 def test_identical_byte_replacement_after_execution_is_refused(self):
  def replaced(*args,**kwargs):
   replacement=self.root/'replacement';replacement.write_bytes(self.bundle.read_bytes());replacement.chmod(0o600);replacement.replace(self.bundle);return b'private success'
  with patch.object(m.offline_process,'run_tool',side_effect=replaced),self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_ARTIFACT_CHANGED$'):self.run_selected()
 def test_failures_are_sanitized_and_empty_output_is_not_success(self):
  for error in [OSError('private path'),ValueError('private diagnostic')]:
   with patch.object(m.offline_process,'run_tool',side_effect=error),self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_PROCESS_REFUSED$'):self.run_selected()
  with patch.object(m.offline_process,'run_tool',return_value=b''),self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_OUTPUT_REQUIRED$'):self.run_selected()
 def test_real_selected_process_receives_input_mode_and_no_parent_environment(self):
  # Python stands in for a caller-selected runtime in this transport test.
  self.node=Path(sys.executable).resolve();self.bundle.write_text("import os,sys;assert 'PRIVATE_PARENT' not in os.environ;assert sys.argv[1]=='review';sys.stdout.buffer.write(sys.stdin.buffer.read())")
  options={'node_sha256':hashlib.sha256(self.node.read_bytes()).hexdigest(),'node_bytes':self.node.stat().st_size,'bundle_sha256':hashlib.sha256(self.bundle.read_bytes()).hexdigest(),'bundle_bytes':self.bundle.stat().st_size,'mode':'review'}
  with patch.dict(os.environ,{'PRIVATE_PARENT':'private value'}):self.assertEqual(self.run_selected(**options),b'private input')

if __name__=='__main__':unittest.main()
