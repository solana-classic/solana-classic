import copy,importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py')]:
 s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
for name,file in [('process_admission','process_admission.py'),('offline_process','offline_process.py')]:
 p=Path(__file__).with_name(file);p=p if p.exists() else Path(__file__).parents[2]/'mainnet'/file
 s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
s=importlib.util.spec_from_file_location('event_collection',Path(__file__).with_name('event_collection.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class EventCollection(unittest.TestCase):
 def fixture(self):
  genesi=['A'*44,'B'*44]
  manifest={'scope':'fresh-private-metadata-journal','genesi':genesi}
  attempt={'state':'passed','starts':[{},{}],'stops':[{'returnCode':0},{'returnCode':-2}],'crashes':[]}
  def record(id,scope,state):return {'id':id,'schemaVersion':3,'scope':scope,'state':state,'attempts':1,'programmePinHandoffAttempted':True,'reviewedMintAdmission':{'reviewed':True},'lastValidBlockHeight':100}
  claim=record('C'*44,'isolated-native-claim','FINALIZED');claim['programmePinPolicy']={'source':{'genesis':genesi[0]},'destination':{'genesis':genesi[1]}}
  redemption=record('D'*44,'isolated-origin-redemption','EXPIRED_UNRESOLVED')
  report={'state':'passed','processes':{'allStopped':True},'sourceBinarySHA256':r.driver.BIN_SHA,'bridgeSBF_SHA256':r.driver.ELF_SHA,'originalLedgersUnchanged':True,'originalPrivateFilesUnchanged':True,'sourceBroadcasts':1,'handoffs':1,'claimBroadcasts':0,'realHeightExpiryVerified':True,'handoffAdmissionsRetained':True,'signedBytesAndOriginalExpiryRetained':True,'settlementAccepted':False,'canonicalNetworkChanged':False,'productionReady':False,'operation':{'state':'EXPIRED_UNRESOLVED','id':redemption['id']},'expiry':{'lastFinalizedHeight':101},'final':{'originOutstandingUnits':'10000','nativeOutstandingUnits':'0','originEscrowUnits':'10000','originUserUnits':'1990000','reserveNativeUnits':'52000000','protectedFloorNativeUnits':'1002240'}}
  return manifest,report,attempt,claim,redemption
 def test_one_stopped_same_branch_with_unresolved_redemption_is_admitted(self):r.validate_source(*self.fixture())
 def test_changed_state_economics_code_or_history_refuses(self):
  for mode in ['active','failed','public','duplicateGenesis','differentPinGenesis','code','elf','broadcast','settled','changedOriginal','badStop','crash','sameRecord','path','wrongScope','state','handoff','notExpired','escrow','native','reserve','floor']:
   m,p,a,c,d=copy.deepcopy(self.fixture())
   if mode=='active':p['processes']['allStopped']=False
   if mode=='failed':a['state']='failed'
   if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
   if mode=='duplicateGenesis':m['genesi'][1]=m['genesi'][0]
   if mode=='differentPinGenesis':c['programmePinPolicy']['source']['genesis']='E'*44
   if mode=='code':p['sourceBinarySHA256']='0'*64
   if mode=='elf':p['bridgeSBF_SHA256']='0'*64
   if mode=='broadcast':p['claimBroadcasts']=1
   if mode=='settled':p['settlementAccepted']=True
   if mode=='changedOriginal':p['originalPrivateFilesUnchanged']=False
   if mode=='badStop':a['stops'][0]['returnCode']=-9
   if mode=='crash':a['crashes']=[{}]
   if mode=='sameRecord':c['id']=d['id']
   if mode=='path':d['id']='../../record'
   if mode=='wrongScope':d['scope']='isolated-native-claim'
   if mode=='state':d['state']='FINALIZED'
   if mode=='handoff':c['programmePinHandoffAttempted']=False
   if mode=='notExpired':p['expiry']['lastFinalizedHeight']=100
   if mode=='escrow':p['final']['originEscrowUnits']='0'
   if mode=='native':p['final']['nativeOutstandingUnits']='10000'
   if mode=='reserve':p['final']['reserveNativeUnits']='0'
   if mode=='floor':p['final']['protectedFloorNativeUnits']='0'
   with self.subTest(mode=mode),self.assertRaises(AssertionError):r.validate_source(m,p,a,c,d)
 def test_other_environment_or_canonical_service_refuses_before_paths(self):
  e={'RAILWAY_PROJECT_ID':'project','RAILWAY_ENVIRONMENT_ID':'environment','RAILWAY_SERVICE_ID':'worker'}
  config={'scope':'private-event-account-collection-v1','workerEnvironment':e,'canonicalService':'canonical'}
  for key in e:
   with patch.object(r,'Path') as paths,self.assertRaises(AssertionError):r.validate_config(config,{**e,key:'other'})
   paths.assert_not_called()
  with patch.object(r,'Path') as paths,self.assertRaises(AssertionError):r.validate_config({**config,'canonicalService':'worker'},e)
  paths.assert_not_called()
 def test_copy_commands_cannot_reset_clone_fund_deploy_or_bypass_checks(self):
  config={'rpcPorts':[31899,32899],'gossipPorts':[34000,34100]}
  for i in range(2):
   cmd=r.command(Path('/private-fixture'),config,i);self.assertEqual(cmd[cmd.index('--ledger')+1],'/private-fixture/ledger-'+str(i));self.assertEqual(cmd[cmd.index('--bind-address')+1],'127.0.0.1')
   for flag in ['--reset','--clone','--mint','--bpf-program','--upgradeable-program','--no-os-network-limits-test']:self.assertNotIn(flag,cmd)
  for i in [True,-1,2]:
   with self.assertRaises(AssertionError):r.command(Path('/private-fixture'),config,i)
 def test_existing_attempt_is_never_overwritten_or_launched(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'attempt.json').write_text('{"state":"failed"}')
   with patch.object(r,'validate_config',return_value=(root,root/'source')),patch.object(r,'no_active_validator') as census,patch.object(r,'copy_cold_ledger') as cp,patch.object(r.subprocess,'Popen') as start:
    with self.assertRaises(FileExistsError):r.main({})
    census.assert_not_called();cp.assert_not_called();start.assert_not_called()
   self.assertEqual((root/'attempt.json').read_text(),'{"state":"failed"}')
 def test_active_validator_refusal_retains_failure_without_copy_or_start(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   with patch.object(r,'validate_config',return_value=(root,root/'source')),patch.object(r,'no_active_validator',side_effect=ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')),patch.object(r,'copy_cold_ledger') as cp,patch.object(r.subprocess,'Popen') as start:
    with self.assertRaisesRegex(ValueError,'OTHER_VALIDATOR'):r.main({})
    cp.assert_not_called();start.assert_not_called()
   self.assertEqual(json.loads((root/'attempt.json').read_text())['state'],'failed')
 def lifecycle(self,mode):
  from contextlib import ExitStack
  from types import SimpleNamespace
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp);root=base/'attempt';source=base/'source';root.mkdir(mode=0o700);source.mkdir(mode=0o700)
   m,p,a,c,d=self.fixture();p['uploadedSourceHashes']={}
   for name,value in [('private-input.json',m),('private-result.json',p),('attempt.json',a),('baseline-claim-private.json',c),('selected-review-private.json',{}),('baseline-result-private.json',{})]:(source/name).write_text(json.dumps(value))
   (source/'journal').mkdir();(source/'journal'/(d['id']+'.json')).write_text(json.dumps(d))
   (root/'public-source-hashes.json').write_text(json.dumps({'public-source.mjs':r.driver.BIN_SHA}))
   original={str(v.relative_to(source)):v.read_bytes() for v in source.rglob('*') if v.is_file()}
   config={'rpcPorts':[31899,32899],'gossipPorts':[34000,34100]};children=[]
   def popen(*args,**kwargs):
    child=SimpleNamespace(pid=45000+len(children),returncode=None,poll=lambda:None);children.append(child);return child
   def stop(child):child.returncode=-2;return -2
   def phase(args,*unused,**kwargs):
    if args[-1]=='preflight':(root/'preflight-private.json').write_text(json.dumps({'genesi':m['genesi'],'minimums':[100,100]}))
    else:
     if mode=='collectionFailure':raise RuntimeError('COLLECTION_REFUSED')
     (root/'private-result.json').write_text(json.dumps({'state':'passed','checks':[],'broadcasts':0,'simulations':0,'handoffs':0,'signaturesCreated':0}))
   def rpc(port,method,params=None):
    if method=='getGenesisHash':return ('E'*44 if mode=='wrongGenesis' and port==32899 else m['genesi'][config['rpcPorts'].index(port)])
    if method=='getSlot':return 101
    if method=='getHealth':return 'ok'
    raise AssertionError('Unexpected RPC')
   with ExitStack() as stack:
    for target,kw in [('validate_config',{'return_value':(root,source)}),('no_active_validator',{}),('sha',{'return_value':r.driver.BIN_SHA}),('inventory',{'return_value':('cold-inventory',[])}),('copy_cold_ledger',{'side_effect':lambda src,dst:dst.mkdir()}),('inspect_copy_process',{}),('run_tool',{'side_effect':phase})]:stack.enter_context(patch.object(r,target,**kw))
    starts=stack.enter_context(patch.object(r.subprocess,'Popen',side_effect=popen));stops=stack.enter_context(patch.object(r.driver,'stop',side_effect=stop));stack.enter_context(patch.object(r.driver,'rpc',side_effect=rpc));stack.enter_context(patch.object(r.socket,'socket'));stack.enter_context(patch.object(r.shutil,'disk_usage',return_value=SimpleNamespace(free=8*1024**3)))
    if mode=='success':r.main(config)
    else:
     with self.assertRaises((AssertionError,RuntimeError)):r.main(config)
    self.assertEqual(starts.call_count,2);self.assertEqual(stops.call_count,2);self.assertTrue(all(p.returncode==-2 for p in children))
   self.assertFalse((root/'private-input.json').exists());self.assertEqual((root/'historical-baseline-private.json').read_bytes(),(source/'baseline-result-private.json').read_bytes())
   final=json.loads((root/'attempt.json').read_text());self.assertEqual(final['state'],'passed' if mode=='success' else 'failed');self.assertEqual(len(final['stops']),2)
   self.assertEqual({str(v.relative_to(source)):v.read_bytes() for v in source.rglob('*') if v.is_file()},original)
 def test_wrong_second_genesis_stops_both_owned_copies_and_retains_failure(self):self.lifecycle('wrongGenesis')
 def test_collection_failure_stops_both_owned_copies_and_retains_failure(self):self.lifecycle('collectionFailure')
 def test_successful_mocked_lifecycle_stops_copies_and_preserves_originals(self):self.lifecycle('success')
if __name__=='__main__':unittest.main()
