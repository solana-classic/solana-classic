import copy,importlib.util,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py')]:
 s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
for name,file in [('process_admission','process_admission.py'),('offline_process','offline_process.py')]:
 selected=Path(__file__).with_name(file);selected=selected if selected.exists() else Path(__file__).parents[2]/'mainnet'/file
 s=importlib.util.spec_from_file_location(name,selected);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
s=importlib.util.spec_from_file_location('metadata_cold_restore',Path(__file__).with_name('metadata_cold_restore.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class MetadataColdRestore(unittest.TestCase):
 def fixture(self):
  manifest={'scope':'fresh-private-metadata-journal','ports':[26899,27899],'genesi':['private-a','private-b']}
  attempt={'state':'passed','starts':[{}, {}, {}],'stops':[{'returnCode':-2},{'returnCode':0}],'crashes':[{'returnCode':-9}]}
  def record(id,scope):return {'id':id,'schemaVersion':3,'state':'FINALIZED','scope':scope,'attempts':1,'programmePinHandoffAttempted':True,'reviewedMintAdmission':{'retained':True}}
  claim=record('J5x5U82o7MdUPvZ7e7FBbBA7ounJ25mC4xAgW2G6QUzn','isolated-native-claim');redemption=record('EKLKCwvoLEdtNS28uuUDQuL9GUgC3FCRRaMtw3zz19bd','isolated-origin-redemption')
  report={'state':'passed','processes':{'allStopped':True},'sourceBinarySHA256':r.driver.BIN_SHA,'bridgeSBF_SHA256':r.driver.ELF_SHA,'originalLedgersUnchanged':True,'originalPrivateFilesUnchanged':True,'sourceBroadcasts':1,'claimBroadcasts':1,'settlementAccepted':True,'canonicalNetworkChanged':False,'productionReady':False,'operation':{'state':'FINALIZED','id':redemption['id']},'final':{'originOutstandingUnits':'0','nativeOutstandingUnits':'0','originEscrowUnits':'0','originUserUnits':'2000000','reserveNativeUnits':'52000000','protectedFloorNativeUnits':'1002240'}}
  return manifest,report,attempt,claim,redemption
 def test_completed_stopped_same_branch_metadata_pair_admitted(self):r.validate_source(*self.fixture())
 def test_pending_wrong_history_or_code_and_changed_economics_refuse(self):
  for mode in ['pending','running','public','duplicate','code','escrow','reserve','floor','priorChanged','badStop','badCrash','missingHandoff','sameRecord','path']:
   m,p,a,c,d=copy.deepcopy(self.fixture())
   if mode=='pending':d['state']='PENDING'
   if mode=='running':p['processes']['allStopped']=False
   if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
   if mode=='duplicate':m['genesi'][1]=m['genesi'][0]
   if mode=='code':p['sourceBinarySHA256']='0'*64
   if mode=='escrow':p['final']['originEscrowUnits']='1'
   if mode=='reserve':p['final']['reserveNativeUnits']='1'
   if mode=='floor':p['final']['protectedFloorNativeUnits']='0'
   if mode=='priorChanged':p['originalPrivateFilesUnchanged']=False
   if mode=='badStop':a['stops'][0]['returnCode']=-9
   if mode=='badCrash':a['crashes'][0]['returnCode']=0
   if mode=='missingHandoff':c['programmePinHandoffAttempted']=False
   if mode=='sameRecord':c['id']=d['id']
   if mode=='path':c['id']='../../private'
   with self.subTest(mode=mode),self.assertRaises(AssertionError):r.validate_source(m,p,a,c,d)
 def test_worker_mismatch_or_canonical_worker_refuses_before_filesystem_access(self):
  expected={'RAILWAY_PROJECT_ID':'private-project','RAILWAY_ENVIRONMENT_ID':'private-environment','RAILWAY_SERVICE_ID':'private-worker'}
  config={'scope':'private-metadata-cold-restore-v1','workerEnvironment':expected,'canonicalService':'canonical'}
  for field in expected:
   with patch.object(r,'Path') as paths,self.assertRaises(AssertionError):r.validate_config(config,{**expected,field:'other'})
   paths.assert_not_called()
  with patch.object(r,'Path') as paths,self.assertRaises(AssertionError):r.validate_config({**config,'canonicalService':'private-worker'},expected)
  paths.assert_not_called()
 def test_only_working_or_restored_copy_commands_no_reset_or_redeployment(self):
  root=Path('/private-fixture')
  for group in ['working','restored']:
   for i in range(2):
    command=r.command(root,group,i);self.assertEqual(command[command.index('--ledger')+1],str(root/group/('ledger-'+str(i))));self.assertEqual(command[command.index('--bind-address')+1],'127.0.0.1')
    for flag in ['--reset','--clone','--mint','--bpf-program','--upgradeable-program','--no-os-network-limits-test']:self.assertNotIn(flag,command)
  for group,i in [('source',0),('backup',0),('working',True),('restored',2)]:
   with self.assertRaises(AssertionError):r.command(root,group,i)
 def test_retained_failed_attempt_never_reads_source_or_starts(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'attempt.json').write_text('{"state":"failed"}')
   with patch.object(r,'validate_config',return_value=(root,root/'source')),patch.object(r,'no_active_validator') as census,patch.object(r,'copy_cold_ledger') as cp,patch.object(r.subprocess,'Popen') as start:
    with self.assertRaises(FileExistsError):r.main({})
    census.assert_not_called();cp.assert_not_called();start.assert_not_called()
   self.assertEqual((root/'attempt.json').read_text(),'{"state":"failed"}')
 def test_active_validator_refusal_retains_failed_attempt_without_copy_or_start(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   with patch.object(r,'validate_config',return_value=(root,root/'source')),patch.object(r,'no_active_validator',side_effect=ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')),patch.object(r,'copy_cold_ledger') as cp,patch.object(r.subprocess,'Popen') as start:
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):r.main({})
    cp.assert_not_called();start.assert_not_called()
   self.assertEqual(json.loads((root/'attempt.json').read_text())['state'],'failed')
if __name__=='__main__':unittest.main()
