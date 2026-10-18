import importlib.util,sys,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
for name,file in [('bootstrap_driver','bootstrap.py'),('metadata_journal','metadata_journal.py')]:
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m)
r=sys.modules['metadata_journal']
class MetadataJournalGuards(unittest.TestCase):
    def test_exact_private_worker_only(self):
        good={'RAILWAY_PROJECT_ID':r.PROJECT,'RAILWAY_ENVIRONMENT_ID':r.ENVIRONMENT,'RAILWAY_SERVICE_ID':r.SERVICE};r.validate_host(good)
        for k in good:
            with self.assertRaises(AssertionError):r.validate_host({**good,k:'wrong'})
        with self.assertRaises(AssertionError):r.validate_host({**good,'RAILWAY_SERVICE_ID':'d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'})
    def test_fresh_commands_pin_local_paths_and_restart_cannot_reinitialize(self):
        for i in range(2):
            fresh=r.command(i,'payer','program');restart=r.command(i)
            self.assertEqual(fresh[fresh.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))));self.assertEqual(fresh[fresh.index('--bind-address')+1],'127.0.0.1')
            self.assertEqual(fresh[fresh.index('--upgradeable-program')+1:],['program',str(r.ROOT/'bridge.so'),'payer'])
            for flag in ['--reset','--clone','--url','--no-poh-speed-test','--no-os-network-limits-test']:self.assertNotIn(flag,fresh)
            for flag in ['--mint','--bpf-program','--upgradeable-program']:self.assertNotIn(flag,restart)
        with self.assertRaises(AssertionError):r.command(2)
        with self.assertRaises(AssertionError):r.command(0,'payer')
    def test_finalized_checkpoint_and_private_identity_required(self):
        self.assertTrue(r.ready('private','ok',20,'private',20))
        for g in r.driver.FORBIDDEN:
            with self.assertRaises(AssertionError):r.ready(g,'ok',20)
        for args in [('private','ok',19,'private',20),('wrong','ok',20,'private',20),('private','bad',20,'private',20),('private','ok',True,'private',1),('private','ok',20,'private',0)]:self.assertFalse(r.ready(*args))
    def test_reserved_attempt_never_generates_keys_or_restarts(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'attempt.json').write_text('{"state":"failed"}')
            with patch.object(r,'ROOT',root),patch.object(r,'validate_host'),patch.object(r.subprocess,'run') as run:
                with self.assertRaises(FileExistsError):r.main()
                run.assert_not_called()
            self.assertEqual((root/'attempt.json').read_text(),'{"state":"failed"}')
if __name__=='__main__':unittest.main()
