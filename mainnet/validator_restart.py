"""Bounded warm restart of one explicitly selected owned rehearsal process.

Callbacks retain process ownership and selected artifacts. No keys, ledger
copies, reset, transaction signing or activation are implemented here.
"""
import time,urllib.error

RETRYABLE_READINESS={'CONSENSUS_NOT_READY','FINALITY_DID_NOT_ADVANCE','EVERY_VALIDATOR_VOTE_AND_ROOT_MUST_ADVANCE','PRIVATE_RPC_NETWORK_DEADLINE'}

def retryable_observation(error):
 # Never retry identity, supply, policy, history, malformed data or an unknown
 # failure into an eventual pass. A failed transport read is not an observation.
 if type(error) is ValueError:return str(error) in RETRYABLE_READINESS
 if isinstance(error,urllib.error.HTTPError):return False
 if isinstance(error,urllib.error.URLError):return isinstance(error.reason,(ConnectionError,TimeoutError))
 return isinstance(error,(ConnectionError,TimeoutError))

def restart_node(*,node,manifest,processes,baseline,stop_owned,start_owned,rpc,ports,observe,verify_progress,timeout=180,clock=time.monotonic,sleep=time.sleep):
 if type(node) is not int or node not in range(3) or type(timeout) is not int or not 1<=timeout<=180:raise ValueError('BOUNDED_OWNED_RESTART_REQUIRED')
 if not isinstance(processes,list) or len(processes)!=3 or len({id(p) for p in processes})!=3 or any(p.poll() is not None for p in processes):raise ValueError('THREE_LIVE_OWNED_PROCESSES_REQUIRED')
 selected=processes[node];others=[p for i,p in enumerate(processes) if i!=node]
 result={'scope':'One owned warm restart on the original private rehearsal ledger; not cold restore or physical-host loss','node':node,'state':'running','restartStarts':0,'originalProcessStopped':False,'canonicalNetworkChanged':False,'productionReady':False,'coldRestoreVerified':False,'quorumOutagePolicyVerified':False,'independentOperatorsVerified':False}
 stopped=stop_owned(selected)
 if selected.poll() is None or not isinstance(stopped,dict) or stopped.get('forced') is not False or type(stopped.get('returnCode')) is not int or stopped['returnCode'] not in [0,-2]:raise ValueError('RESTART_REQUIRES_CLEAN_OWNED_STOP')
 result['originalProcessStopped']=True;result['originalStop']=stopped
 if any(p.poll() is not None for p in others):raise ValueError('SURVIVING_VALIDATOR_EXITED')
 # A process exit alone is insufficient if an unexpected listener still owns
 # the selected RPC endpoint. Refuse a reply instead of starting over it.
 try:rpc(ports(node)['rpc'],'getIdentity')
 except OSError as error:
  if not isinstance(getattr(error,'reason',error),ConnectionRefusedError):raise ValueError('STOPPED_NODE_RPC_ABSENCE_UNVERIFIED') from None
 except ValueError:raise ValueError('STOPPED_NODE_RPC_ABSENCE_UNVERIFIED') from None
 else:raise ValueError('STOPPED_NODE_RPC_STILL_RESPONDS')
 for i,row in enumerate(manifest['validators']):
  if i==node:continue
  port=ports(i)['rpc']
  if rpc(port,'getGenesisHash')!=manifest['genesis'] or rpc(port,'getIdentity')!={'identity':row['identity']}:raise ValueError('SURVIVING_NODE_IDENTITY_DIFFERS')
 replacement=start_owned(node)
 # The callback must register the returned child before any later work can
 # fail, so the outer launcher's finally block always owns its cleanup.
 if replacement is selected or processes[node] is not replacement or replacement in others or replacement.poll() is not None:raise ValueError('RESTART_CHILD_OWNERSHIP_REQUIRED')
 result['restartStarts']=1;deadline=clock()+timeout
 while True:
  if clock()>=deadline:raise ValueError('BOUNDED_RESTART_PROGRESS_NOT_OBSERVED')
  if any(p.poll() is not None for p in processes):raise ValueError('RESTART_VALIDATOR_EXITED')
  try:
   recovered=observe(manifest)
   review=verify_progress(manifest,baseline,recovered)
  except (OSError,ValueError,KeyError,TypeError) as error:
   if not retryable_observation(error):raise
   if clock()>=deadline:raise ValueError('BOUNDED_RESTART_PROGRESS_NOT_OBSERVED') from None
   sleep(min(3,max(0,deadline-clock())));continue
  if clock()>=deadline:raise ValueError('BOUNDED_RESTART_PROGRESS_NOT_OBSERVED')
  if any(p.poll() is not None for p in processes):raise ValueError('RESTART_VALIDATOR_EXITED')
  required=['voteAndRootProgressionVerified','activatedStakeUnchanged','earlierFinalizedBlockPreserved']
  if not isinstance(review,dict) or any(review.get(key) is not True for key in required) or type(review.get('nodeVoteComparisons')) is not int or review['nodeVoteComparisons']!=9 or type(review.get('continuityReaders')) is not int or review['continuityReaders']!=3:raise ValueError('COMPLETE_RESTART_PROGRESS_REVIEW_REQUIRED')
  result.update({'state':'passed','observation':recovered,'progressReview':review,'sameLedgerRestartRequested':True,'allOwnedProcessesLiveAfterRestart':True});return result
