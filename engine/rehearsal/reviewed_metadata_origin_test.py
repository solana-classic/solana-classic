import importlib.util,sys,unittest
from pathlib import Path
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('reviewed_metadata_origin','reviewed_metadata_origin.py')]:
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
r=sys.modules['reviewed_metadata_origin']
class ReviewedMetadataCopyGuards(unittest.TestCase):
    def fixture(self):
        return {'scope':'fresh-private-metadata-origin','genesis':'private'}, {'state':'passed','processes':{'allStopped':True},'genesis':'private','signatures':[{'state':'finalized'}]*4,'settlementBroadcasts':0,'sourceBinarySHA256':r.driver.BIN_SHA,'bridgeSBF_SHA256':r.driver.ELF_SHA,'tokenSHA256':r.driver.TOKEN_SHA,'observation':{'mintLayout':'immutable-self-metadata-v1','tokenCodeVerified':True}}
    def test_incomplete_or_different_source_cannot_enter(self):
        r.validate(*self.fixture())
        for mode in ['pending','running','genesis','public','code','plain','token','settlement']:
            m,p=self.fixture()
            if mode=='pending':p['signatures'][0]={'state':'submission-attempted'}
            if mode=='running':p['processes']['allStopped']=False
            if mode=='genesis':m['genesis']='other'
            if mode=='public':m['genesis']=p['genesis']=next(iter(r.driver.FORBIDDEN))
            if mode=='code':p['tokenSHA256']='0'*64
            if mode=='plain':p['observation']['mintLayout']='plain'
            if mode=='token':p['observation']['tokenCodeVerified']=False
            if mode=='settlement':p['settlementBroadcasts']=1
            with self.assertRaises(AssertionError):r.validate(m,p)
    def test_checkpoint_cannot_be_lowered_or_replaced_by_health(self):
        self.assertTrue(r.ready('private','ok',90,'private',90))
        for args in [('private','ok',89,'private',90),('wrong','ok',90,'private',90),('private','bad',90,'private',90),('private','ok',True,'private',0),('private','ok',90,'private',-1),('private','ok',90,'private',True)]:self.assertFalse(r.ready(*args))
    def test_startup_opens_only_new_copy_and_does_not_change_genesis(self):
        c=r.command();self.assertEqual(c[c.index('--ledger')+1],str(r.ROOT/'ledger'));self.assertNotEqual(str(r.ROOT),str(r.SOURCE));self.assertEqual(c[c.index('--bind-address')+1],'127.0.0.1')
        for flag in ['--reset','--mint','--bpf-program','--upgradeable-program','--clone','--url']:self.assertNotIn(flag,c)
if __name__=='__main__':unittest.main()
