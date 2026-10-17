import importlib.util,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('gated_operation_fault_agave',Path(__file__).with_name('gated_operation_fault_agave.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class OperationFaultAgaveAdmission(unittest.TestCase):
 def env(self):return {'RAILWAY_PROJECT_ID':m.PROJECT,'RAILWAY_ENVIRONMENT_ID':m.ENVIRONMENT,'RAILWAY_SERVICE_ID':m.SERVICE}
 def test_canonical_or_wrong_worker_refuses_before_attempt(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve()
   with patch.object(m,'ROOT',root):
    m.admit(root,self.env())
    for k in self.env():
     with self.assertRaisesRegex(ValueError,'SEPARATE_WORKER_REQUIRED'):m.admit(root,{**self.env(),k:'wrong'})
    with self.assertRaisesRegex(ValueError,'SEPARATE_WORKER_REQUIRED'):m.admit(root,{**self.env(),'RAILWAY_SERVICE_ID':'d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'})
   self.assertEqual(list(root.iterdir()),[])
 def test_reserved_failed_attempt_never_generates_keys_or_runs_tools(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();(root/'attempt.json').write_text('{"state":"failed"}')
   with patch.object(m,'ROOT',root),patch.dict(os.environ,self.env()),patch.object(m.subprocess,'run') as run:
    with self.assertRaisesRegex(ValueError,'ATTEMPT_ALREADY_RESERVED'):m.run(root)
    run.assert_not_called()
   self.assertEqual((root/'attempt.json').read_text(),'{"state":"failed"}');self.assertEqual(len(list(root.iterdir())),1)
 def test_ledger_input_or_result_reservations_refuse(self):
  for name in ['ledger-0','ledger-1','private-input.json','private-result.json']:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d).resolve();(root/name).touch()
    with patch.object(m,'ROOT',root):
     with self.assertRaisesRegex(ValueError,'ATTEMPT_ALREADY_RESERVED'):m.admit(root,self.env())
 def test_alias_and_open_root_refuse(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();target=root/'target';target.mkdir(mode=0o700);alias=root/'alias';alias.symlink_to(target,target_is_directory=True)
   for p in [alias,target]:
    if p==target:target.chmod(0o755)
    with patch.object(m,'ROOT',p):
     with self.assertRaisesRegex(ValueError,'PRIVATE_FRESH_ROOT_REQUIRED'):m.admit(p,self.env())
 def test_fresh_loopback_commands_select_distinct_exact_programmes(self):
  ports=[]
  for i in [0,1]:
   c=m.command(m.ROOT,i,'payer','program');self.assertEqual(c[c.index('--bind-address')+1],'127.0.0.1');self.assertEqual(c[c.index('--upgradeable-program')+1:],['program',str(m.ROOT/('origin.so' if i==0 else 'gated.so')),'payer'])
   for f in ['--reset','--clone','--url','--no-poh-speed-test','--no-os-network-limits-test']:self.assertNotIn(f,c)
   a,b=map(int,c[c.index('--dynamic-port-range')+1].split('-'));p=int(c[c.index('--rpc-port')+1]);g=int(c[c.index('--gossip-port')+1]);ports.append({p,p+1,p+2,g,*range(a,b+1)})
  self.assertFalse(ports[0]&ports[1])
  for args in [(m.ROOT,2,'payer','program'),(m.ROOT,0,'','program'),(Path('/data/wrong'),0,'payer','program')]:
   with self.assertRaises(ValueError):m.command(*args)
 def test_tampered_public_source_fails_before_any_process(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d).resolve();(root/'public-source-hashes.json').write_text('{"input.txt":"wrong"}');(root/'input.txt').write_text('altered')
   with patch.object(m,'ROOT',root),patch.dict(os.environ,self.env()),patch.object(m.subprocess,'Popen') as popen:
    result=m.run(root);self.assertEqual(result['state'],'failed');self.assertEqual(result['failureType'],'AssertionError');popen.assert_not_called()
   self.assertFalse((root/'private-input.json').exists())
if __name__=='__main__':unittest.main()
