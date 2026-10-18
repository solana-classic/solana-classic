import importlib.util,sys,unittest,tempfile,copy
from pathlib import Path
from unittest.mock import patch
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('metadata_redemption_expiry','metadata_redemption_expiry.py')]:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['metadata_redemption_expiry']
class MetadataRedemptionExpiryGuards(unittest.TestCase):
    def fixture(self):
        m={'scope':'fresh-private-metadata-journal','ports':r.PORTS,'genesi':['private-a','private-b']}
        a={'state':'passed','starts':[{} for _ in range(3)],'stops':[{'returnCode':-2} for _ in range(2)],'crashes':[{'returnCode':-9}]}
        p={'state':'passed','processes':{'allStopped':True},'sourceBroadcasts':1,'claimBroadcasts':1,'settlementAccepted':True,'operation':{'state':'FINALIZED','id':'J5x5U82o7MdUPvZ7e7FBbBA7ounJ25mC4xAgW2G6QUzn'},'final':{'originOutstandingUnits':'10000','nativeOutstandingUnits':'10000','originEscrowUnits':'10000','originUserUnits':'1990000','reserveNativeUnits':'42000000','protectedFloorNativeUnits':'1002240'},'sourceBinarySHA256':r.driver.BIN_SHA,'bridgeSBF_SHA256':r.driver.ELF_SHA,'originalLedgersUnchanged':True,'originalPrivateFilesUnchanged':True,'completeGenesisBackingVerified':False,'productionReady':False,'canonicalNetworkChanged':False};return m,p,a
    def test_worker_identity_is_canonical_compiler_only(self):
        good={'RAILWAY_PROJECT_ID':r.PROJECT,'RAILWAY_ENVIRONMENT_ID':r.ENVIRONMENT,'RAILWAY_SERVICE_ID':r.SERVICE};r.validate_host(good)
        for k in good:
            with self.assertRaises(AssertionError):r.validate_host({**good,k:'wrong'})
    def test_incomplete_public_changed_code_or_economics_baseline_refuses(self):
        r.validate(*self.fixture())
        for mode in ['state','running','pending','public','code','balance','backing','path','stops']:
            m,p,a=copy.deepcopy(self.fixture())
            if mode=='state':a['state']='failed'
            if mode=='running':p['processes']['allStopped']=False
            if mode=='pending':p['operation']['state']='PENDING'
            if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
            if mode=='code':p['sourceBinarySHA256']='0'*64
            if mode=='balance':p['final']['originEscrowUnits']='1'
            if mode=='backing':p['completeGenesisBackingVerified']=True
            if mode=='path':p['operation']['id']='../../wrong'
            if mode=='stops':a['stops'][0]['returnCode']=-9
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_expiry_requires_actual_height_zero_handoffs_and_retained_liability(self):
        final={'originOutstandingUnits':'10000','nativeOutstandingUnits':'0','originEscrowUnits':'10000','originUserUnits':'1990000','reserveNativeUnits':'52000000','protectedFloorNativeUnits':'1002240'}
        good={'state':'passed','operation':{'state':'EXPIRED_UNRESOLVED','attempts':1},'settlementAccepted':False,'realHeightExpiryVerified':True,'signedBytesAndOriginalExpiryRetained':True,'claimBroadcasts':0,'handoffs':0,'sourceBroadcasts':1,'expiredPreparedRefusals':3,'expiredUnresolvedRefusals':3,'expiry':{'firstFinalizedHeight':50,'originalLastValidBlockHeight':200,'lastFinalizedHeight':201,'observations':30},'final':final,'afterReturn':copy.deepcopy(final),'claimDirection':1}
        r.validate_expiry_result(good)
        for mode in ['notExpired','fakeHeight','submitted','handoff','finalized','attempt','paid','missingRefusal','bytes','backing','clockOnly','wrongDirection']:
            p=copy.deepcopy(good)
            if mode=='notExpired':p['expiry']['lastFinalizedHeight']=200
            if mode=='fakeHeight':p['expiry']['firstFinalizedHeight']=True
            if mode=='submitted':p['claimBroadcasts']=1
            if mode=='handoff':p['handoffs']=1
            if mode=='finalized':p['operation']['state']='FINALIZED'
            if mode=='attempt':p['operation']['attempts']=0
            if mode=='paid':p['settlementAccepted']=True
            if mode=='missingRefusal':p['expiredPreparedRefusals']=2
            if mode=='bytes':p['signedBytesAndOriginalExpiryRetained']=False
            if mode=='backing':p['final']['originEscrowUnits']='0'
            if mode=='clockOnly':p['realHeightExpiryVerified']=False
            if mode=='wrongDirection':p['claimDirection']=0
            with self.assertRaises(AssertionError):r.validate_expiry_result(p)
    def test_copy_command_and_checkpoint_do_not_reset_or_reinitialize(self):
        for i in range(2):
            c=r.command(i);self.assertEqual(c[c.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))));self.assertEqual(c[c.index('--bind-address')+1],'127.0.0.1')
            for flag in ['--reset','--mint','--bpf-program','--upgradeable-program','--clone','--no-os-network-limits-test']:self.assertNotIn(flag,c)
        self.assertTrue(r.ready('a','ok',100,'a',100))
        for a in [('a','ok',99,'a',100),('wrong','ok',100,'a',100),('a','ok',True,'a',1),('a','ok',100,'a',0)]:self.assertFalse(r.ready(*a))
    def test_reserved_attempt_cannot_copy_or_start(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'attempt.json').write_text('{"state":"failed"}')
            with patch.object(r,'ROOT',root),patch.object(r,'validate_host'),patch.object(r,'copy_cold_ledger') as cp,patch.object(r.subprocess,'Popen') as start:
                with self.assertRaises(FileExistsError):r.main()
                cp.assert_not_called();start.assert_not_called()
            self.assertEqual((root/'attempt.json').read_text(),'{"state":"failed"}')
if __name__=='__main__':unittest.main()
