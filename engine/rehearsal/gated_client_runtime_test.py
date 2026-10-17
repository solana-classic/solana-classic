import importlib.util,unittest,tempfile,os,json,hashlib
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('gated_client_runtime',Path(__file__).with_name('gated_client_runtime.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class GatedClientRuntimeGuards(unittest.TestCase):
 def environment(self):return {'RAILWAY_PROJECT_ID':m.PROJECT,'RAILWAY_ENVIRONMENT_ID':m.ENVIRONMENT,'RAILWAY_SERVICE_ID':m.SERVICE}
 def root(self):
  r=Mock();r.parent=Path('/data');r.name='gated-client-runtime-v1';r.is_symlink.return_value=False;r.resolve.return_value=r;r.is_dir.return_value=True;r.stat.return_value.st_uid=os.getuid();r.stat.return_value.st_mode=0o40700
  child=Mock();child.exists.return_value=False;child.is_symlink.return_value=False
  r.__truediv__=Mock(return_value=child);return r,child
 def fixture(self,root):
  for name in m.FILES:
   p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'public fixture');p.chmod(0o600)
  elf=root/'.tools/bridge-gated-artifacts/classic_bridge_gated_program.so';(root/'bridge/gated-program/artifact-sha256.txt').write_text(m.sha(elf)+'\n')
  inventory={n:m.sha(root/n) for n in m.FILES};(root/'public-source-hashes.json').write_text(json.dumps(inventory));return inventory
 def test_client_dependency_matches_repository_pin(self):
  package=json.loads((Path(__file__).resolve().parents[2]/'package.json').read_text())
  self.assertEqual(package['dependencies']['@solana/web3.js'],m.CLIENT_DEPENDENCY_VERSION)
  self.assertEqual(m.NODE_VERSION,'v24.19.0')
 def test_exact_worker_and_fresh_owned_root(self):
  r,_=self.root();m.admit(r,self.environment())
  for k in self.environment():
   env=self.environment();env[k]='different'
   with self.assertRaisesRegex(ValueError,'WORKER'):m.admit(r,env)
 def test_retained_attempt_and_unsafe_root_refuse(self):
  for field,value in [('name','gated-client-runtime-v0'),('parent',Path('/tmp'))]:
   r,_=self.root();setattr(r,field,value)
   with self.assertRaisesRegex(ValueError,'NAMESPACE'):m.admit(r,self.environment())
  for condition in ['exists','is_symlink']:
   r,child=self.root();getattr(child,condition).return_value=True
   with self.assertRaisesRegex(ValueError,'REUSED'):m.admit(r,self.environment())
  r,_=self.root();r.stat.return_value.st_mode=0o40755
  with self.assertRaisesRegex(ValueError,'OWNED'):m.admit(r,self.environment())
 def test_complete_source_closure_and_external_artifact_match(self):
  with tempfile.TemporaryDirectory() as d:
   r=Path(d).resolve();expected=self.fixture(r)
   with patch.object(m,'TOKEN',expected['.tools/programs/spl_token_2022-v10.0.0.so']):self.assertEqual(m.sources(r),expected)
   with self.assertRaisesRegex(ValueError,'SBF'):m.sources(r)
 def test_missing_extra_or_changed_public_inputs_refuse(self):
  for change in ['missing','extra','bytes']:
   with tempfile.TemporaryDirectory() as d:
    r=Path(d).resolve();expected=self.fixture(r)
    if change=='missing':expected.pop('bridge/program/Cargo.toml')
    if change=='extra':expected['unexpected']='0'*64
    if change=='bytes':(r/'bridge/program/Cargo.toml').write_bytes(b'changed')
    (r/'public-source-hashes.json').write_text(json.dumps(expected))
    with self.assertRaises(ValueError):m.sources(r)
 def test_symlink_or_shared_permission_public_inputs_refuse(self):
  for kind in ['symlink','mode']:
   with tempfile.TemporaryDirectory() as d:
    r=Path(d).resolve();self.fixture(r);p=r/'bridge/program/Cargo.toml'
    if kind=='symlink':p.unlink();p.symlink_to(r/'bridge/program/src/lib.rs')
    else:p.chmod(0o644)
    with self.assertRaisesRegex(ValueError,'INPUT'):m.sources(r)
 def test_failed_or_unselected_artifact_marker_refuses(self):
  with tempfile.TemporaryDirectory() as d:
   r=Path(d).resolve();expected=self.fixture(r);p=r/'bridge/gated-program/artifact-sha256.txt';p.write_text('unbuilt\n');expected['bridge/gated-program/artifact-sha256.txt']=m.sha(p);(r/'public-source-hashes.json').write_text(json.dumps(expected))
   with self.assertRaisesRegex(ValueError,'SBF'):m.sources(r)
if __name__=='__main__':unittest.main()
