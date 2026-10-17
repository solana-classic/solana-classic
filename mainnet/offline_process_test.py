import importlib.util,io,os,signal,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('offline_process',Path(__file__).with_name('offline_process.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class OfflineProcess(unittest.TestCase):
 def execute(self,code,**options):
  log=io.BytesIO();out=m.run_tool([sys.executable,'-c',code],log,**options);return out,log.getvalue()
 def test_success_separates_public_result_and_private_stderr(self):
  out,err=self.execute("import sys;sys.stdout.write('RESULT');sys.stderr.write('PRIVATE LOG')")
  self.assertEqual(out,b'RESULT');self.assertEqual(err,b'PRIVATE LOG')
 def test_simultaneous_streams_are_drained_without_pipe_deadlock(self):
  out,err=self.execute("import os\nfor i in range(128):\n os.write(1,b'o'*4096);os.write(2,b'e'*4096)")
  self.assertEqual(out,b'o'*(128*4096));self.assertEqual(err,b'e'*(128*4096))
 def test_stdout_at_limit_is_accepted(self):
  out,_=self.execute("import os;os.write(1,b'x'*2048)",stdout_limit=2048);self.assertEqual(len(out),2048)
 def test_stream_limits_stop_real_processes_and_reap_them(self):
  for fd,code in [(1,'STDOUT'),(2,'STDERR')]:
   with self.subTest(stream=code):
    started=[];real=m.subprocess.Popen
    def start(*args,**kwargs):
     p=real(*args,**kwargs);started.append(p);return p
    with patch.object(m.subprocess,'Popen',side_effect=start),self.assertRaisesRegex(ValueError,'OFFLINE_TOOL_'+code+'_LIMIT'):
     self.execute('import os,time;os.write('+str(fd)+",b'x'*2048);time.sleep(60)",stdout_limit=1024,stderr_limit=1024)
    self.assertIsNotNone(started[0].returncode)
    with self.assertRaises(ChildProcessError):os.waitpid(started[0].pid,os.WNOHANG)
 def test_timeout_kills_and_reaps_real_process_group(self):
  started=[];real=m.subprocess.Popen
  def start(*args,**kwargs):
   p=real(*args,**kwargs);started.append(p);return p
  with patch.object(m.subprocess,'Popen',side_effect=start),self.assertRaisesRegex(ValueError,'OFFLINE_TOOL_TIMEOUT'):
   self.execute('import time;time.sleep(60)',timeout=0.15)
  self.assertEqual(started[0].returncode,-signal.SIGKILL)
  with self.assertRaises(ChildProcessError):os.waitpid(started[0].pid,os.WNOHANG)
 def test_cancellation_stops_real_child_and_propagates_interrupt(self):
  started=[];real=m.subprocess.Popen
  def start(*args,**kwargs):
   p=real(*args,**kwargs);started.append(p);return p
  with patch.object(m.subprocess,'Popen',side_effect=start),patch.object(m.selectors.DefaultSelector,'select',side_effect=KeyboardInterrupt),self.assertRaises(KeyboardInterrupt):
   self.execute('import time;time.sleep(60)')
  self.assertEqual(started[0].returncode,-signal.SIGKILL)
  with self.assertRaises(ChildProcessError):os.waitpid(started[0].pid,os.WNOHANG)
 def test_nonzero_exit_is_redacted_and_retains_private_error_log(self):
  log=io.BytesIO()
  with self.assertRaisesRegex(ValueError,'^OFFLINE_PREPARATION_TOOL_FAILED$'):
   m.run_tool([sys.executable,'-c',"import sys;sys.stderr.write('PRIVATE ERROR');sys.exit(7)"],log)
  self.assertEqual(log.getvalue(),b'PRIVATE ERROR')
 def test_timeout_stops_descendant_after_its_parent_exits(self):
  with tempfile.TemporaryDirectory() as tmp:
   marker=Path(tmp)/'descendant-marker'
   child="import pathlib,time;time.sleep(0.6);pathlib.Path("+repr(str(marker))+").write_text('unexpected')"
   parent="import subprocess,sys;subprocess.Popen([sys.executable,'-c',"+repr(child)+"])"
   with self.assertRaisesRegex(ValueError,'OFFLINE_TOOL_TIMEOUT'):self.execute(parent,timeout=0.15)
   time.sleep(0.7);self.assertFalse(marker.exists())
 def test_invalid_limits_do_not_start_any_process(self):
  for options in [{'timeout':0},{'timeout':True},{'timeout':float('inf')},{'timeout':float('nan')},{'stdout_limit':0},{'stderr_limit':-1},{'stdout_limit':True}]:
   with self.subTest(options=options),patch.object(m.subprocess,'Popen')as start,self.assertRaisesRegex(ValueError,'BOUNDED_OFFLINE'):
    self.execute('raise Exception()',**options)
   start.assert_not_called()
 def test_stderr_limit_does_not_write_overflow_chunk_to_private_log(self):
  log=io.BytesIO()
  with self.assertRaisesRegex(ValueError,'STDERR_LIMIT'):
   m.run_tool([sys.executable,'-c',"import os;os.write(2,b'x'*2048)"],log,stderr_limit=1024)
  self.assertLessEqual(len(log.getvalue()),1024)

class OfflineInput(unittest.TestCase):
 execute=OfflineProcess.execute
 def test_default_and_explicit_empty_input_both_deliver_eof(self):
  for options in [{},{'input_bytes':b''}]:
   with self.subTest(options=options):
    out,err=self.execute("import sys;print(len(sys.stdin.buffer.read()))",timeout=2,**options)
    self.assertEqual(out,b'0\n');self.assertEqual(err,b'')
 def test_exact_maximum_binary_input_is_delivered_without_logging(self):
  import hashlib
  data=bytes(range(256))*(m.STDIN_LIMIT//256)
  out,err=self.execute("import hashlib,sys;print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())",input_bytes=data,timeout=5)
  self.assertEqual(out.decode().strip(),hashlib.sha256(data).hexdigest());self.assertEqual(err,b'')
 def test_input_and_both_full_output_pipes_progress_without_deadlock(self):
  data=b'i'*(1024*1024)
  code="import os,sys\nfor _ in range(128):\n os.write(1,b'o'*4096);os.write(2,b'e'*4096)\ndata=sys.stdin.buffer.read()\nassert data==b'i'*(1024*1024)"
  out,err=self.execute(code,input_bytes=data,timeout=5)
  self.assertEqual(out,b'o'*(128*4096));self.assertEqual(err,b'e'*(128*4096))
 def test_invalid_input_does_not_start_a_process(self):
  for data in ['text',bytearray(b'x'),memoryview(b'x'),False,b'x'*(m.STDIN_LIMIT+1)]:
   with self.subTest(kind=type(data).__name__),patch.object(m.subprocess,'Popen') as start,self.assertRaisesRegex(ValueError,'^BOUNDED_OFFLINE_INPUT_REQUIRED$'):
    self.execute('raise Exception()',input_bytes=data)
   start.assert_not_called()
 def test_child_closing_stdin_is_reaped_without_input_in_error(self):
  started=[];real=m.subprocess.Popen
  def start(*args,**kwargs):
   p=real(*args,**kwargs);started.append(p);return p
  with patch.object(m.subprocess,'Popen',side_effect=start),self.assertRaisesRegex(ValueError,'^OFFLINE_TOOL_STDIN_CLOSED$'):
   self.execute('import os,time;os.close(0);time.sleep(60)',input_bytes=b'PRIVATE INPUT'*(128*1024),timeout=2)
  self.assertIsNotNone(started[0].returncode)
  with self.assertRaises(ChildProcessError):os.waitpid(started[0].pid,os.WNOHANG)
 def test_nonreading_child_times_out_and_is_reaped(self):
  started=[];real=m.subprocess.Popen
  def start(*args,**kwargs):
   p=real(*args,**kwargs);started.append(p);return p
  with patch.object(m.subprocess,'Popen',side_effect=start),self.assertRaisesRegex(ValueError,'^OFFLINE_TOOL_TIMEOUT$'):
   self.execute('import time;time.sleep(60)',input_bytes=b'x'*(1024*1024),timeout=0.15)
  self.assertEqual(started[0].returncode,-signal.SIGKILL)
  with self.assertRaises(ChildProcessError):os.waitpid(started[0].pid,os.WNOHANG)

if __name__=='__main__':unittest.main()
