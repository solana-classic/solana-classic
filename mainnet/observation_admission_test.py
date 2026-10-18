import importlib.util,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
import consensus_test as fixtures
import validator_restart_test as warm
s=importlib.util.spec_from_file_location('readiness_policy',Path(__file__).with_name('validator_restart.py'));policy=importlib.util.module_from_spec(s);s.loader.exec_module(policy)

class ObservationAdmission(unittest.TestCase):
 def test_only_named_readiness_and_failed_network_reads_may_retry(self):
  for error in [*(ValueError(code) for code in policy.RETRYABLE_READINESS),ConnectionRefusedError(),ConnectionResetError(),TimeoutError(),urllib.error.URLError(ConnectionRefusedError()),urllib.error.URLError(TimeoutError())]:
   with self.subTest(kind=type(error).__name__,code=str(error)):self.assertTrue(policy.retryable_observation(error))
  for error in [ValueError('RUNNING_GENESIS_DIFFERS'),ValueError('RUNNING_IDENTITY_OR_VERSION_DIFFERS'),ValueError('CONSENSUS_SUPPLY_OR_INFLATION_DIFFERS'),ValueError('REHEARSAL_ACTIVATED_STAKE_CHANGED'),ValueError('EARLIER_FINALIZED_BLOCK_CHANGED'),ValueError('PRIVATE_RPC_REJECTED'),ValueError('PRIVATE_RPC_REDIRECT_FORBIDDEN'),ValueError('PRIVATE_RPC_HTTP_STATUS_INVALID'),ValueError('UNKNOWN_FAILURE'),KeyError('PRIVATE'),TypeError('PRIVATE'),OSError('PRIVATE'),urllib.error.URLError('PRIVATE'),urllib.error.HTTPError('http://127.0.0.1',503,'unavailable',{},None)]:
   try:
    with self.subTest(kind=type(error).__name__,code=str(error)):self.assertFalse(policy.retryable_observation(error))
   finally:
    if isinstance(error,urllib.error.HTTPError):error.close()
 def test_integrity_or_malformed_observation_episode_cannot_be_hidden_by_a_later_good_result(self):
  for error in [ValueError('RUNNING_GENESIS_DIFFERS'),ValueError('RUNNING_IDENTITY_OR_VERSION_DIFFERS'),ValueError('CONSENSUS_SUPPLY_OR_INFLATION_DIFFERS'),ValueError('FINALIZED_BLOCK_DIFFERS'),KeyError('missing'),TypeError('invalid'),OSError('unknown')]:
   a,_,started,_=warm.Restart().context();a['observe'].side_effect=[error,{'recovered':'later'}]
   with self.subTest(error=type(error).__name__,code=str(error)),self.assertRaises(type(error)):warm.m.restart_node(**a)
   self.assertEqual(a['observe'].call_count,1);a['verify_progress'].assert_not_called();self.assertIs(a['processes'][1],started[0][1])
 def test_changed_stake_or_retained_history_review_stops_without_second_review(self):
  for code in ['REHEARSAL_ACTIVATED_STAKE_CHANGED','EARLIER_FINALIZED_BLOCK_CHANGED','CONTINUITY_NODE_IDENTITY_DIFFERS','EXACT_FINALIZED_OBSERVATION_REQUIRED','EVERY_NODE_VOTE_OBSERVATION_REQUIRED']:
   a,_,_,_=warm.Restart().context();good=a['verify_progress'].return_value;a['verify_progress'].side_effect=[ValueError(code),good]
   with self.subTest(code=code),self.assertRaisesRegex(ValueError,code):warm.m.restart_node(**a)
   self.assertEqual(a['observe'].call_count,1);self.assertEqual(a['verify_progress'].call_count,1)
 def test_runtime_readiness_is_separate_from_supply_identity_and_malformed_vote_policy(self):
  c=fixtures.m;manifest,_=fixtures.fixture()
  def rpc(port,method,params=None):
   i=next(i for i in range(3) if c.ports(i)['rpc']==port)
   return {'getGenesisHash':manifest['genesis'],'getIdentity':{'identity':manifest['validators'][i]['identity']},'getVersion':{'solana-core':'3.0.14'},'getSlot':50,'getSupply':{'value':{'total':900}},'getInflationGovernor':{'initial':0.0,'terminal':0.0},'getVoteAccounts':{'current':[{'votePubkey':n['vote'],'nodePubkey':n['identity'],'lastVote':49,'rootSlot':40,'activatedStake':100} for n in manifest['validators']]},'getBlock':{'blockhash':fixtures.key(700)}}[method]
  for mode in ['low-slot','unrooted','partial','supply','inflation','bad-slot','vote-identity','duplicate','malformed-vote','zero-stake','bad-block','low-slot-with-supply','low-slot-with-vote-identity','partial-with-vote-identity']:
   def changed(port,method,params=None):
    result=rpc(port,method,params)
    if mode in ['low-slot','low-slot-with-supply','low-slot-with-vote-identity'] and method=='getSlot':return 1
    if mode in ['supply','low-slot-with-supply'] and method=='getSupply':return {'value':{'total':901}}
    if mode=='inflation' and method=='getInflationGovernor':return {'initial':True,'terminal':0}
    if mode=='bad-slot' and method=='getSlot':return False
    if mode=='bad-block' and method=='getBlock':return None
    if method=='getVoteAccounts':
     if mode=='unrooted':result['current'][0]['rootSlot']=0
     if mode in ['partial','partial-with-vote-identity']:result['current'].pop()
     if mode in ['vote-identity','low-slot-with-vote-identity','partial-with-vote-identity']:result['current'][0]['nodePubkey']=fixtures.key(999)
     if mode=='duplicate':result['current'][1]=result['current'][0].copy()
     if mode=='malformed-vote':result['current'][0]['lastVote']=True
     if mode=='zero-stake':result['current'][0]['activatedStake']=0
    return result
   with self.subTest(mode=mode),patch.object(c,'rpc',side_effect=changed):
    try:c.runtime_observation(manifest)
    except (ValueError,KeyError,TypeError) as error:self.assertEqual(policy.retryable_observation(error),mode in ['low-slot','unrooted','partial'])
    else:self.fail('Invalid observation unexpectedly accepted')
 def test_full_launcher_aborts_startup_or_restart_integrity_episode_and_cleans_children(self):
  for fault,code,starts in [('startup-integrity','RUNNING_GENESIS_DIFFERS',3),('restart-integrity','EARLIER_FINALIZED_BLOCK_CHANGED',4)]:
   with self.subTest(fault=fault):
    result,commands=warm.LauncherRestart().execute(fault);self.assertEqual(result['state'],'failed');self.assertEqual(result['failureCode'],code);self.assertFalse(result['warmRestartVerified']);self.assertEqual(len(commands),starts);self.assertTrue(result['allStopped'])
 def test_full_launcher_still_allows_explicit_startup_readiness_then_complete_recovery(self):
  result,commands=warm.LauncherRestart().execute('startup-readiness');self.assertEqual(result['state'],'passed');self.assertTrue(result['warmRestartVerified']);self.assertEqual(len(commands),4);self.assertTrue(result['allStopped'])
if __name__=='__main__':unittest.main()
