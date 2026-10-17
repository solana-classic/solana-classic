import importlib.util,sys,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
for name,file in [('bootstrap_driver','bootstrap.py'),('metadata_origin','metadata_origin.py')]:
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
r=sys.modules['metadata_origin']
class MetadataOriginAdmission(unittest.TestCase):
    def test_exact_private_worker_identity(self):
        good={'RAILWAY_PROJECT_ID':r.PROJECT,'RAILWAY_ENVIRONMENT_ID':r.ENVIRONMENT,'RAILWAY_SERVICE_ID':r.SERVICE};r.validate_host(good)
        for field in good:
            for value in [None,'different']:
                with self.assertRaises(AssertionError):r.validate_host({**good,field:value})
        with self.assertRaises(AssertionError):r.validate_host({**good,'RAILWAY_SERVICE_ID':'d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'})
    def test_fresh_loopback_only_command_without_reset_or_cloning(self):
        c=r.command('payer','program');self.assertEqual(c[c.index('--ledger')+1],str(r.ROOT/'ledger'));self.assertEqual(c[c.index('--bind-address')+1],'127.0.0.1')
        for flag in ['--reset','--clone','--clone-upgradeable-program','--url','--no-poh-speed-test','--skip-preflight','--no-os-network-limits-test']:self.assertNotIn(flag,c)
        self.assertEqual(c.count('--upgradeable-program'),1);self.assertEqual(c[c.index('--upgradeable-program')+1:],[ 'program',str(r.ROOT/'bridge.so'),'payer'])
    def test_public_genesis_and_unfinalized_readiness_refuse(self):
        self.assertTrue(r.ready('private','ok',1))
        for g in r.driver.FORBIDDEN:
            with self.assertRaises(AssertionError):r.ready(g,'ok',1)
        for n in [0,-1,True,1.5]:self.assertFalse(r.ready('private','ok',n))
        self.assertFalse(r.ready('private','unavailable',100))
    def test_reserved_attempt_cannot_generate_keys_or_restart(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'attempt.json').write_text('{"state":"failed"}')
            with patch.object(r,'ROOT',root),patch.object(r,'validate_host'),patch.object(r.subprocess,'run') as run:
                with self.assertRaises(FileExistsError):r.main()
                run.assert_not_called()
            self.assertEqual((root/'attempt.json').read_text(),'{"state":"failed"}')
if __name__=='__main__':unittest.main()
