import importlib.util,unittest,urllib.error
from pathlib import Path
from unittest.mock import Mock
s=importlib.util.spec_from_file_location('validator_restart',Path(__file__).with_name('validator_restart.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Child:
 def __init__(self):self.returncode=None
 def poll(self):return self.returncode
class Restart(unittest.TestCase):
 def context(self):
  manifest={'genesis':'fresh','validators':[{'identity':'node-'+str(i)} for i in range(3)]};children=[Child() for _ in range(3)];stopped=[];started=[];now=[0]
  def stop(p):stopped.append(p);p.returncode=-2;return {'returnCode':-2,'forced':False}
  def start(i):p=Child();children[i]=p;started.append((i,p));return p
  def rpc(port,method):
   if port==1:raise urllib.error.URLError(ConnectionRefusedError())
   return 'fresh' if method=='getGenesisHash' else {'identity':'node-'+str(port)}
  review={'voteAndRootProgressionVerified':True,'activatedStakeUnchanged':True,'earlierFinalizedBlockPreserved':True,'nodeVoteComparisons':9,'continuityReaders':3}
  args={'node':1,'manifest':manifest,'processes':children,'baseline':{'retained':'first'},'stop_owned':Mock(side_effect=stop),'start_owned':Mock(side_effect=start),'rpc':Mock(side_effect=rpc),'ports':lambda i:{'rpc':i},'observe':Mock(return_value={'recovered':'later'}),'verify_progress':Mock(return_value=review),'timeout':6,'clock':lambda:now[0],'sleep':lambda seconds:now.__setitem__(0,now[0]+seconds)}
  return args,stopped,started,now
 def test_positive_warm_restart_requires_new_owned_child_and_full_progress_review(self):
  a,stopped,started,_=self.context();original=a['processes'][1];r=m.restart_node(**a)
  self.assertEqual(stopped,[original]);self.assertEqual(len(started),1);self.assertIs(a['processes'][1],started[0][1]);a['verify_progress'].assert_called_once_with(a['manifest'],a['baseline'],{'recovered':'later'})
  self.assertEqual(r['state'],'passed');self.assertTrue(r['originalProcessStopped']);self.assertTrue(r['sameLedgerRestartRequested']);self.assertTrue(r['allOwnedProcessesLiveAfterRestart']);self.assertFalse(r['productionReady']);self.assertFalse(r['coldRestoreVerified']);self.assertFalse(r['quorumOutagePolicyVerified'])
 def test_wrong_node_boolean_or_unbounded_timeout_never_stops_a_process(self):
  for change in [{'node':True},{'node':-1},{'node':3},{'timeout':181},{'timeout':True},{'timeout':0}]:
   a,_,_,_=self.context();a.update(change)
   with self.subTest(change=change),self.assertRaisesRegex(ValueError,'BOUNDED_OWNED'):m.restart_node(**a)
   a['stop_owned'].assert_not_called();a['start_owned'].assert_not_called()
 def test_missing_duplicate_or_dead_initial_processes_refuse_before_stop(self):
  for mode in ['count','duplicate','dead']:
   a,_,_,_=self.context()
   if mode=='count':a['processes'].pop()
   if mode=='duplicate':a['processes'][1]=a['processes'][0]
   if mode=='dead':a['processes'][2].returncode=0
   with self.subTest(mode=mode),self.assertRaisesRegex(ValueError,'THREE_LIVE'):m.restart_node(**a)
   a['stop_owned'].assert_not_called()
 def test_forced_failed_or_unconfirmed_stop_cannot_start_a_replacement(self):
  for result in [{'forced':True,'returnCode':-9},{'forced':False,'returnCode':1},{'forced':False,'returnCode':False},None]:
   a,_,_,_=self.context();
   def stop(child):
    child.returncode=result['returnCode'] if isinstance(result,dict) else None
    return result
   a['stop_owned']=Mock(side_effect=stop)
   with self.subTest(result=result),self.assertRaisesRegex(ValueError,'CLEAN_OWNED_STOP'):m.restart_node(**a)
   a['start_owned'].assert_not_called()
 def test_responding_or_unproven_stopped_endpoint_refuses_before_restart(self):
  for response in [None,{'identity':'old'},ValueError('PRIVATE BAD REPLY'),TimeoutError(),ConnectionResetError(),urllib.error.URLError(TimeoutError())]:
   a,_,_,_=self.context();a['rpc']=Mock(side_effect=response) if isinstance(response,Exception) else Mock(return_value=response)
   with self.subTest(kind=type(response).__name__),self.assertRaisesRegex(ValueError,'STOPPED_NODE_RPC_'):m.restart_node(**a)
   a['start_owned'].assert_not_called()
 def test_wrong_surviving_genesis_or_identity_refuses_before_restart(self):
  for method in ['getGenesisHash','getIdentity']:
   a,_,_,_=self.context();original=a['rpc'].side_effect
   a['rpc'].side_effect=lambda port,selected:('other' if selected=='getGenesisHash' else {'identity':'other'}) if port!=1 and selected==method else original(port,selected)
   with self.subTest(method=method),self.assertRaisesRegex(ValueError,'SURVIVING_NODE_IDENTITY'):m.restart_node(**a)
   a['start_owned'].assert_not_called()
 def test_replacement_must_be_registered_and_distinct_before_observation(self):
  for mode in ['unregistered','original','other','dead']:
   a,_,_,_=self.context();old=a['processes'][1]
   def start(i):
    child=old if mode=='original' else a['processes'][0] if mode=='other' else Child()
    if mode=='dead':child.returncode=1
    if mode!='unregistered':a['processes'][i]=child
    return child
   a['start_owned']=Mock(side_effect=start)
   with self.subTest(mode=mode),self.assertRaisesRegex(ValueError,'CHILD_OWNERSHIP'):m.restart_node(**a)
   a['observe'].assert_not_called()
 def test_stalled_progress_times_out_with_replacement_still_owned_for_outer_cleanup(self):
  a,_,started,now=self.context();a['verify_progress'].side_effect=ValueError('EVERY_VALIDATOR_VOTE_AND_ROOT_MUST_ADVANCE')
  with self.assertRaisesRegex(ValueError,'BOUNDED_RESTART'):m.restart_node(**a)
  self.assertEqual(len(started),1);self.assertIs(a['processes'][1],started[0][1]);self.assertGreaterEqual(now[0],6)
 def test_transient_observation_failures_can_recover_within_budget(self):
  a,_,_,now=self.context();a['observe'].side_effect=[ConnectionRefusedError(),{'recovered':'later'}];r=m.restart_node(**a);self.assertEqual(r['state'],'passed');self.assertEqual(now[0],3)
 def test_surviving_child_exit_blocks_restart_or_later_acceptance(self):
  for phase in ['stop','observe']:
   a,_,_,_=self.context()
   if phase=='stop':
    stop=a['stop_owned'].side_effect
    def bad_stop(child):result=stop(child);a['processes'][0].returncode=1;return result
    a['stop_owned'].side_effect=bad_stop
   else:
    def observe(manifest):a['processes'][0].returncode=1;return {'later':True}
    a['observe'].side_effect=observe
   with self.subTest(phase=phase),self.assertRaisesRegex(ValueError,'VALIDATOR_EXITED'):m.restart_node(**a)
 def test_partial_or_ambiguous_progress_review_cannot_pass(self):
  for change in [{'voteAndRootProgressionVerified':False},{'activatedStakeUnchanged':False},{'earlierFinalizedBlockPreserved':False},{'nodeVoteComparisons':8},{'nodeVoteComparisons':9.0},{'continuityReaders':3.0}]:
   a,_,_,_=self.context();a['verify_progress'].return_value={**a['verify_progress'].return_value,**change}
   with self.subTest(change=change),self.assertRaisesRegex(ValueError,'COMPLETE_RESTART'):m.restart_node(**a)
 def test_callback_cancellation_propagates_without_releasing_outer_process_ownership(self):
  a,_,started,_=self.context();a['observe'].side_effect=KeyboardInterrupt()
  with self.assertRaises(KeyboardInterrupt):m.restart_node(**a)
  self.assertIs(a['processes'][1],started[0][1])


class LauncherRestart(unittest.TestCase):
 def execute(self,fault=None):
  import consensus_test as fixtures
  import tempfile,hashlib,json
  from unittest.mock import patch
  c=fixtures.m;manifest,_=fixtures.fixture();manifest['genesisBinSHA256']=hashlib.sha256(b'g').hexdigest();make_observation=fixtures.ConsensusProgress().observation
  observations=[make_observation(manifest,offset) for offset in [0,30,60]];spawned=[];commands=[]
  with tempfile.TemporaryDirectory() as temp:
   base=Path(temp).resolve();binaries=base/'tools';binaries.mkdir();binary=binaries/'agave-validator';binary.write_bytes(b'x');bundle=base/'bundle';(bundle/'genesis').mkdir(parents=True);(bundle/'genesis'/'genesis.tar.bz2').write_bytes(b'fixture')
   def spawn(command,**kwargs):
    child=Mock(pid=123456+len(spawned),returncode=None);child.poll.side_effect=lambda:child.returncode
    def wait(timeout):
     child.returncode=-2
     if child is spawned[0] and len(spawned)==3:
      if fault=='binary':binary.write_bytes(b'changed')
      if fault=='ledger':(base/'runs/restart-fixture-001/node-0/genesis.bin').write_bytes(b'changed')
     return -2
    child.wait.side_effect=wait;spawned.append(child);commands.append(command);return child
   def materialize(source,ledger,*pins):ledger.mkdir(mode=0o700);(ledger/'genesis.bin').write_bytes(b'g');return {'archiveGenesisMatches':True}
   def rpc(port,method,params=None):
    i=next(i for i in range(3) if c.ports(i)['rpc']==port)
    if i==0 and len(spawned)==3 and spawned[0].returncode is not None:raise urllib.error.URLError(ConnectionRefusedError())
    if method=='getGenesisHash':return manifest['genesis']
    if method=='getIdentity':return {'identity':manifest['validators'][i]['identity']}
    if method=='getBlock':return {'blockhash':next(o['sharedFinalizedBlockhash'] for o in observations if o['sharedFinalizedSlot']==params[0])}
    raise AssertionError('Unexpected fixture request')
   def check(bundle,directory):return ({**manifest,'totalNativeUnits':'901'} if fault=='bundle' and len(spawned)==3 else manifest, {})
   pins={'agave-validator':(hashlib.sha256(b'x').hexdigest(),1)}
   with patch.object(c,'BASE',base),patch.object(c.host,'probe',return_value={}),patch.object(c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(c,'check_bundle',side_effect=check),patch.object(c.process_admission,'no_active_validator'),patch.object(c.genesis_archive,'materialize',side_effect=materialize) as materialized,patch.object(c.host,'PINS',pins),patch.object(c.socket,'socket'),patch.object(c.subprocess,'Popen',side_effect=spawn),patch.object(c,'runtime_observation',side_effect=([ValueError('RUNNING_GENESIS_DIFFERS'),*observations] if fault=='startup-integrity' else [ValueError('CONSENSUS_NOT_READY'),*observations] if fault=='startup-readiness' else [*observations[:2],ValueError('EARLIER_FINALIZED_BLOCK_CHANGED'),observations[2]] if fault=='restart-integrity' else observations)),patch.object(c,'rpc',side_effect=rpc),patch.object(c.time,'sleep'),patch.object(c.os,'killpg'):
    result=c.run(bundle,binaries,'restart-fixture-001',True,restart_node=0)
   self.assertTrue(all(p.returncode is not None for p in spawned));self.assertTrue(result['allStopped']);self.assertEqual(materialized.call_count,3)
   self.assertTrue((base/'runs/restart-fixture-001/public-result.json').is_file())
   return result,commands
 def test_optional_restart_reuses_original_ledger_and_normal_command_then_cleans_all_children(self):
  r,commands=self.execute();self.assertEqual(r['state'],'passed');self.assertTrue(r['warmRestartVerified']);self.assertEqual(r['validatorsStarted'],4);self.assertEqual(commands[0],commands[3]);self.assertEqual(r['warmRestartReview']['progressReview']['nodeVoteComparisons'],9);self.assertFalse(r['productionReady'])
  for command in commands:
   for flag in ['--reset','--skip-verification','--no-poh-speed-test','--ignore-ulimit-nofile-error']:self.assertNotIn(flag,command)
 def test_changed_bundle_binary_or_original_ledger_refuses_replacement_and_cleans_survivors(self):
  for fault,code in [('bundle','RESTART_BUNDLE_CHANGED'),('binary','VALIDATOR_BINARY_CHANGED_BEFORE_RESTART'),('ledger','ORIGINAL_RESTART_LEDGER_REQUIRED')]:
   with self.subTest(fault=fault):
    r,commands=self.execute(fault);self.assertEqual(r['state'],'failed');self.assertEqual(r['failureCode'],code);self.assertFalse(r['warmRestartVerified']);self.assertEqual(len(commands),3)
 def test_read_only_packet_check_never_executes_requested_restart(self):
  import consensus_test as fixtures
  import tempfile
  from unittest.mock import patch
  c=fixtures.m;manifest,_=fixtures.fixture()
  with tempfile.TemporaryDirectory() as temp:
   base=Path(temp).resolve()
   with patch.object(c,'BASE',base),patch.object(c.host,'probe',return_value={}),patch.object(c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(c,'check_bundle',return_value=(manifest,{})),patch.object(c.validator_restart,'restart_node') as restart,patch.object(c.subprocess,'Popen') as process:
    result=c.run(base,base,'readonly-restart-001',restart_node=0)
   self.assertEqual(result['state'],'packet-checked');self.assertTrue(result['warmRestartRequested']);self.assertFalse(result['warmRestartVerified']);restart.assert_not_called();process.assert_not_called();self.assertFalse((base/'runs').exists())
 def test_invalid_restart_selection_refuses_before_bundle_or_process_access(self):
  import consensus_test as fixtures
  from unittest.mock import patch
  c=fixtures.m
  for node in [True,-1,3,'0']:
   with self.subTest(node=node),patch.object(c.host,'probe',return_value={}),patch.object(c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(c,'check_bundle') as check,patch.object(c.subprocess,'Popen') as process:
    with self.assertRaisesRegex(ValueError,'EXPLICIT_RESTART'):c.run(Path('/not-read'),Path('/not-read'),'invalid-restart-001',True,restart_node=node)
    check.assert_not_called();process.assert_not_called()
if __name__=='__main__':unittest.main()
