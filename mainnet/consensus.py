#!/usr/bin/env python3
"""Explicit fresh private three-validator rehearsal; never a mainnet launcher."""
from pathlib import Path
import argparse,hashlib,http.client,importlib.util,io,json,os,re,signal,socket,stat,subprocess,time,urllib.error,urllib.request
_archive_spec=importlib.util.spec_from_file_location('genesis_archive',Path(__file__).with_name('genesis_archive.py'));genesis_archive=importlib.util.module_from_spec(_archive_spec);_archive_spec.loader.exec_module(genesis_archive)
_spec=importlib.util.spec_from_file_location('host_preflight',Path(__file__).with_name('host-preflight.py'));host=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(host)
_process_spec=importlib.util.spec_from_file_location('offline_process',Path(__file__).with_name('offline_process.py'));offline_process=importlib.util.module_from_spec(_process_spec);_process_spec.loader.exec_module(offline_process)
BASE=Path('/data/mainnet-consensus-v2')
FORBIDDEN={'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'}
SOURCE='f516a8927c76c07f0ebc54ca7a4ce8b2046eee86'
ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def digest(v):
 if not isinstance(v,str) or not re.fullmatch('[0-9a-f]{64}',v):raise ValueError('SHA256_PIN_REQUIRED')
 return v

def address(v):
 if not isinstance(v,str) or not 32<=len(v)<=44 or any(c not in ALPHABET for c in v):raise ValueError('CANONICAL_PUBLIC_KEY_REQUIRED')
 n=0
 for c in v:n=n*58+ALPHABET.index(c)
 b=(b'\0'*(len(v)-len(v.lstrip('1'))))+(n.to_bytes((n.bit_length()+7)//8,'big') if n else b'')
 if len(b)!=32:raise ValueError('CANONICAL_PUBLIC_KEY_REQUIRED')
 return v

def validate_manifest(m):
 fields={'schemaVersion','scope','runtimeSource','genesis','bankHash','shredVersion','genesisBinSHA256','genesisArchiveSHA256','inventorySHA256','totalNativeUnits','validators'}
 if not isinstance(m,dict) or set(m)!=fields or type(m['schemaVersion']) is not int or m['schemaVersion']!=1 or m['scope']!='fresh-private-consensus-rehearsal' or m['runtimeSource']!=SOURCE:raise ValueError('EXACT_PRIVATE_MANIFEST_REQUIRED')
 for k in ['genesis','bankHash']:address(m[k])
 if m['genesis'] in FORBIDDEN or m['genesis']==m['bankHash']:raise ValueError('PRIVATE_GENESIS_AND_BANK_REQUIRED')
 if type(m['shredVersion']) is not int or not 1<=m['shredVersion']<=65535:raise ValueError('REVIEWED_SHRED_VERSION_REQUIRED')
 for k in ['genesisBinSHA256','genesisArchiveSHA256','inventorySHA256']:digest(m[k])
 total=m['totalNativeUnits']
 if not isinstance(total,str) or not re.fullmatch('[1-9][0-9]{0,19}',total) or int(total)>(1<<64)-1:raise ValueError('EXACT_SYNTHETIC_SUPPLY_REQUIRED')
 if not isinstance(m['validators'],list) or len(m['validators'])!=3:raise ValueError('THREE_FRESH_VALIDATORS_REQUIRED')
 seen=set()
 for node in m['validators']:
  if not isinstance(node,dict) or set(node)!={'identity','vote','stake'}:raise ValueError('EXACT_VALIDATOR_KEYS_REQUIRED')
  for value in node.values():
   address(value)
   if value in seen or value=='11111111111111111111111111111111':raise ValueError('DISTINCT_NONZERO_VALIDATOR_KEYS_REQUIRED')
   seen.add(value)
 return json.loads(json.dumps(m))

def inventory_hash(accounts):return hashlib.sha256(json.dumps(accounts,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def validate_audit(m,a):
 validate_manifest(m)
 if a.get('genesis')!=m['genesis'] or a.get('clusterType')!='development' or a.get('totalLamports')!=m['totalNativeUnits']:raise ValueError('GENESIS_AUDIT_IDENTITY_OR_TOTAL_DIFFERS')
 accounts=a.get('accounts')
 if not isinstance(accounts,list) or len(accounts)!=a.get('accountCount') or not accounts or inventory_hash(accounts)!=m['inventorySHA256']:raise ValueError('COMPLETE_SELECTED_INVENTORY_REQUIRED')
 seen=set();total=0;by={}
 for row in accounts:
  k=address(row['address'])
  if k in seen or not isinstance(row['lamports'],str) or not re.fullmatch('(0|[1-9][0-9]{0,19})',row['lamports']) or int(row['lamports'])>(1<<64)-1:raise ValueError('DUPLICATE_OR_INEXACT_GENESIS_ACCOUNT')
  address(row['owner']);seen.add(k);total+=int(row['lamports']);by[k]=row
 if total!=int(m['totalNativeUnits']):raise ValueError('FULL_INVENTORY_SUM_DIFFERS')
 if a.get('inflation',{}).get('initial')!=0 or a.get('inflation',{}).get('terminal')!=0 or a.get('feeRateGovernor',{}).get('burnPercent')!=0 or a.get('rent',{}).get('burn_percent')!=0:raise ValueError('SYNTHETIC_INFLATION_OR_BURN_POLICY_DIFFERS')
 hashes=a.get('pohConfig',{}).get('hashes_per_tick')
 if type(hashes) is not int or hashes<=0:raise ValueError('NORMAL_POH_CHECK_REQUIRES_HASHING_GENESIS')
 for n in m['validators']:
  for field,owner in [('identity','11111111111111111111111111111111'),('vote','Vote111111111111111111111111111111111111111'),('stake','Stake11111111111111111111111111111111111111')]:
   row=by.get(n[field]);
   if not row or row['owner']!=owner or int(row['lamports'])<=0 or row['executable'] is not False:raise ValueError('BACKED_REHEARSAL_VALIDATOR_ACCOUNT_REQUIRED')
 return {'genesis':m['genesis'],'accountCount':len(accounts),'totalNativeUnits':str(total),'inventorySHA256':inventory_hash(accounts),'hashesPerTick':hashes,'actualFundedOriginalBackingVerified':False}

def ports(i):
 if type(i) is not int or i not in range(3):raise ValueError('FIXED_PRIVATE_NODE_REQUIRED')
 return {'rpc':31000+200*i,'gossip':31100+200*i,'dynamicStart':32000+200*i,'dynamicEnd':32050+200*i}

def all_ports():
 selected=[]
 for i in range(3):
  p=ports(i);selected += [p['rpc'],p['rpc']+1,p['gossip'],*range(p['dynamicStart'],p['dynamicEnd']+1)]
 if len(selected)!=len(set(selected)):raise ValueError('PRIVATE_PORT_COLLISION')
 return selected

def command(binary,root,bundle,m,i):
 m=validate_manifest(m);p=ports(i)
 args=[str(binary),'--ledger',str(root/('node-'+str(i))),'--identity',str(bundle/'keys'/('node-'+str(i)+'-identity.json')),'--vote-account',m['validators'][i]['vote'],'--expected-genesis-hash',m['genesis'],'--expected-bank-hash',m['bankHash'],'--expected-shred-version',str(m['shredVersion']),'--wait-for-supermajority','0','--bind-address','127.0.0.1','--gossip-host','127.0.0.1','--gossip-port',str(p['gossip']),'--dynamic-port-range',str(p['dynamicStart'])+'-'+str(p['dynamicEnd']),'--rpc-bind-address','127.0.0.1','--rpc-port',str(p['rpc']),'--private-rpc','--full-rpc-api','--rpc-threads','2','--rpc-blocking-threads','2','--allow-private-addr','--no-genesis-fetch','--no-snapshot-fetch','--limit-ledger-size','50000000','--accounts-db-cache-limit-mb','128','--unified-scheduler-handler-threads','2','--log',str(root/('node-'+str(i)+'-validator-private.log'))]
 for n in m['validators']:args += ['--known-validator',n['identity']]
 if i:args+=['--entrypoint','127.0.0.1:'+str(ports(0)['gossip'])]
 return args

def regular(p):
 if p.is_symlink() or not p.is_file():raise ValueError('REGULAR_PRIVATE_BUNDLE_FILE_REQUIRED')
 return p

def inspect_tool(binary,args,pin,size,timeout,stdout_limit):
 # Recheck the selected bytes immediately before each read-only invocation.
 try:actual=host.binary_fingerprint(binary,size)
 except (OSError,ValueError):raise ValueError('REVIEWED_INSPECTION_TOOL_REQUIRED') from None
 if actual!={'sha256':pin,'bytes':size,'executable':True}:raise ValueError('REVIEWED_INSPECTION_TOOL_REQUIRED')
 # Check-only admission must not create logs. Discard bounded private stderr.
 with io.BytesIO() as errors:
  return offline_process.run_tool([str(binary),*map(str,args)],errors,timeout=timeout,stdout_limit=stdout_limit,stderr_limit=65536)

def check_bundle(bundle,binaries):
 bundle=bundle.resolve(strict=True)
 if not bundle.is_relative_to(BASE/'bundles') or any(p.is_symlink() for p in [bundle,*bundle.parents] if p!=p.parent):raise ValueError('EXPLICIT_PRIVATE_BUNDLE_REQUIRED')
 m=validate_manifest(json.loads(regular(bundle/'manifest.json').read_text()))
 g=bundle/'genesis'
 if g.is_symlink() or not g.is_dir() or {p.name for p in g.iterdir()}!={'genesis.bin','genesis.tar.bz2'}:raise ValueError('FRESH_GENESIS_ONLY_NO_RUNTIME_LEDGER')
 for name,pin in [('genesis.bin',m['genesisBinSHA256']),('genesis.tar.bz2',m['genesisArchiveSHA256'])]:
  if host.sha(regular(g/name))!=pin:raise ValueError('SELECTED_GENESIS_BYTES_DIFFER')
 artifact=json.loads(Path(__file__).with_name('consensus-audit-artifact.json').read_text())
 auditor=binaries/'classic-genesis-audit-v2'
 raw=inspect_tool(auditor,[g],artifact['sha256'],artifact['bytes'],20,4*1024**2)
 a=json.loads(raw);summary=validate_audit(m,a)
 archive=genesis_archive.inspect_archive(g/'genesis.tar.bz2',m['genesisArchiveSHA256'],m['genesisBinSHA256'])
 summary['initialBlockstoreFiles']=archive['initialBlockstoreFiles'];summary['archiveGenesisMatches']=True
 # Key files are never logged or exported. Pinned keygen checks their public keys.
 keys=bundle/'keys'
 if keys.is_symlink() or not keys.is_dir():raise ValueError('PRIVATE_KEY_DIRECTORY_REQUIRED')
 for i,n in enumerate(m['validators']):
  file=regular(bundle/'keys'/('node-'+str(i)+'-identity.json'))
  if file.stat().st_uid!=os.getuid() or stat.S_IMODE(file.stat().st_mode)&0o077:raise ValueError('OWNER_ONLY_PRIVATE_REHEARSAL_KEY_REQUIRED')
  pin,size=host.PINS['solana-keygen']
  actual=inspect_tool(binaries/'solana-keygen',['pubkey',file],pin,size,10,128).decode().strip()
  if actual!=n['identity']:raise ValueError('REHEARSAL_IDENTITY_KEY_DIFFERS')
 return m,summary

RPC_NETWORK_SECONDS=3

def private_rpc_remaining(deadline):
 remaining=deadline-time.monotonic()
 if remaining<=0:raise TimeoutError('PRIVATE_RPC_NETWORK_DEADLINE')
 return remaining

class PrivateRpcDeadlineSocket(socket.socket):
 """Keep HTTP buffered/header/chunk reads on one monotonic I/O budget."""
 def recv_into(self,buffer,*args):
  self.settimeout(private_rpc_remaining(self.deadline))
  return super().recv_into(buffer,*args)
 def sendall(self,data,*args):
  self.settimeout(private_rpc_remaining(self.deadline))
  return super().sendall(data,*args)

class PrivateRpcConnection(http.client.HTTPConnection):
 def __init__(self,*args,deadline,**kwargs):
  self.deadline=deadline
  super().__init__(*args,**kwargs)
 def connect(self):
  self.timeout=private_rpc_remaining(self.deadline)
  super().connect()
  original=self.sock;descriptor=original.detach();self.sock=None
  try:self.sock=PrivateRpcDeadlineSocket(original.family,original.type,original.proto,fileno=descriptor)
  except BaseException:
   os.close(descriptor);raise
  self.sock.deadline=self.deadline
  self.sock.settimeout(private_rpc_remaining(self.deadline))

class PrivateRpcHttpHandler(urllib.request.HTTPHandler):
 def __init__(self,deadline):
  super().__init__();self.deadline=deadline
 def http_open(self,request):
  return self.do_open(PrivateRpcConnection,request,deadline=self.deadline)

class PrivateRpcNoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  fp.close()
  raise ValueError('PRIVATE_RPC_REDIRECT_FORBIDDEN')

def rpc(port,method,params=None):
 if type(port) is not int or port not in [ports(i)['rpc'] for i in range(3)]:raise ValueError('FIXED_PRIVATE_RPC_REQUIRED')
 if method not in ['getGenesisHash','getIdentity','getVersion','getSlot','getSupply','getInflationGovernor','getVoteAccounts','getBlock']:raise ValueError('READ_ONLY_PRIVATE_RPC_REQUIRED')
 req=urllib.request.Request('http://127.0.0.1:'+str(port),data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or []}).encode(),headers={'Content-Type':'application/json'})
 # Do not inherit a process-global opener, proxy, authentication or redirect.
 deadline=time.monotonic()+RPC_NETWORK_SECONDS
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),PrivateRpcNoRedirect(),PrivateRpcHttpHandler(deadline))
 try:
  with opener.open(req,timeout=private_rpc_remaining(deadline)) as r:
   if r.status!=200:raise ValueError('PRIVATE_RPC_HTTP_STATUS_INVALID')
   raw=r.read(2*1024**2+1)
   private_rpc_remaining(deadline)
 except TimeoutError:
  raise ValueError('PRIVATE_RPC_NETWORK_DEADLINE') from None
 except urllib.error.HTTPError as error:
  error.close()
  raise ValueError('PRIVATE_RPC_HTTP_STATUS_INVALID') from None
 except urllib.error.URLError as error:
  if isinstance(error.reason,TimeoutError):raise ValueError('PRIVATE_RPC_NETWORK_DEADLINE') from None
  raise
 if len(raw)>2*1024**2:raise ValueError('PRIVATE_RPC_EXCEEDS_BOUND')
 w=json.loads(raw)
 if not isinstance(w,dict) or w.get('jsonrpc')!='2.0' or type(w.get('id')) is not int or w.get('id')!=1 or 'error' in w or 'result' not in w:raise ValueError('PRIVATE_RPC_REJECTED')
 return w['result']

def selected_votes(m,current):
 expected={node['vote']:node['identity'] for node in m['validators']}
 if not isinstance(current,list) or len(current)>3 or any(not isinstance(row,dict) for row in current):raise ValueError('EXACT_THREE_ROOTED_VOTE_ACCOUNTS_REQUIRED')
 indexed={};not_ready=len(current)<3
 for row in current:
  vote=row.get('votePubkey')
  if vote not in expected or vote in indexed or row.get('nodePubkey')!=expected[vote]:raise ValueError('SELECTED_VOTE_ACCOUNT_IDENTITY_DIFFERS')
  for field in ['lastVote','rootSlot','activatedStake']:
   if type(row.get(field)) is not int or not 0<=row[field]<1<<64:raise ValueError('ACTIVE_ROOTED_VOTES_REQUIRED')
  if row['activatedStake']==0 or row['rootSlot']>row['lastVote']:raise ValueError('ACTIVE_ROOTED_VOTES_REQUIRED')
  if row['lastVote']==0 or row['rootSlot']==0:not_ready=True
  indexed[vote]={field:row[field] for field in ['votePubkey','nodePubkey','lastVote','rootSlot','activatedStake']}
 if not_ready:raise ValueError('CONSENSUS_NOT_READY')
 return [indexed[node['vote']] for node in m['validators']]

def runtime_observation(m):
 m=validate_manifest(m);slots=[];observations=[];votes=sorted(node['vote'] for node in m['validators'])
 for i in range(3):
  p=ports(i)['rpc']
  if rpc(p,'getGenesisHash')!=m['genesis']:raise ValueError('RUNNING_GENESIS_DIFFERS')
  if rpc(p,'getIdentity').get('identity')!=m['validators'][i]['identity'] or rpc(p,'getVersion').get('solana-core')!='3.0.14':raise ValueError('RUNNING_IDENTITY_OR_VERSION_DIFFERS')
  s=rpc(p,'getSlot',[{'commitment':'finalized'}]);supply=rpc(p,'getSupply',[{'commitment':'finalized'}])['value']['total'];inflation=rpc(p,'getInflationGovernor')
  current=rpc(p,'getVoteAccounts',[{'commitment':'finalized'}])['current']
  if type(s) is not int or not 0<=s<1<<64:raise ValueError('CONSENSUS_SLOT_INVALID')
  if type(supply) is not int or supply!=int(m['totalNativeUnits']) or not isinstance(inflation,dict) or any(type(inflation.get(k)) not in [int,float] or inflation[k]!=0 for k in ['initial','terminal']):raise ValueError('CONSENSUS_SUPPLY_OR_INFLATION_DIFFERS')
  selected=selected_votes(m,current)
  if s<40:raise ValueError('CONSENSUS_NOT_READY')
  observations.append({'nodeIdentity':m['validators'][i]['identity'],'votes':selected});slots.append(s)
 shared=min(slots);hashes=[rpc(ports(i)['rpc'],'getBlock',[shared,{'commitment':'finalized','transactionDetails':'none','rewards':False}])['blockhash'] for i in range(3)]
 for h in hashes:address(h)
 if len(set(hashes))!=1:raise ValueError('FINALIZED_BLOCK_DIFFERS')
 return {'finalizedSlots':slots,'sharedFinalizedSlot':shared,'sharedFinalizedBlockhash':hashes[0],'voteAccounts':votes,'totalNativeUnits':m['totalNativeUnits'],'voteObservations':observations}

def verify_progress(m,first,last):
 """Read-only continuity and all-node voting review, not fork recovery proof."""
 m=validate_manifest(m);views=[]
 for snapshot in [first,last]:
  slots=snapshot.get('finalizedSlots')
  if not isinstance(slots,list) or len(slots)!=3 or any(type(slot) is not int or slot<40 for slot in slots) or type(snapshot.get('sharedFinalizedSlot')) is not int or snapshot['sharedFinalizedSlot']!=min(slots):raise ValueError('EXACT_FINALIZED_OBSERVATION_REQUIRED')
  address(snapshot['sharedFinalizedBlockhash'])
  if snapshot.get('totalNativeUnits')!=m['totalNativeUnits'] or snapshot.get('voteAccounts')!=sorted(node['vote'] for node in m['validators']):raise ValueError('OBSERVED_REHEARSAL_POLICY_DIFFERS')
  rows=snapshot.get('voteObservations')
  if not isinstance(rows,list) or len(rows)!=3:raise ValueError('EVERY_NODE_VOTE_OBSERVATION_REQUIRED')
  selected=[]
  for node,row in zip(m['validators'],rows):
   if not isinstance(row,dict) or row.get('nodeIdentity')!=node['identity']:raise ValueError('EVERY_NODE_VOTE_OBSERVATION_REQUIRED')
   selected.append(selected_votes(m,row.get('votes')))
  views.append(selected)
 if any(b<=a for a,b in zip(first['finalizedSlots'],last['finalizedSlots'])):raise ValueError('FINALITY_DID_NOT_ADVANCE')
 for before,after in zip(views[0],views[1]):
  for a,b in zip(before,after):
   if b['lastVote']<=a['lastVote'] or b['rootSlot']<=a['rootSlot']:raise ValueError('EVERY_VALIDATOR_VOTE_AND_ROOT_MUST_ADVANCE')
   if b['activatedStake']!=a['activatedStake']:raise ValueError('REHEARSAL_ACTIVATED_STAKE_CHANGED')
 # A later shared block is insufficient if an earlier finalized checkpoint was
 # replaced or lost. Re-read that exact block on every selected node, bounded
 # by the same genesis/identity. Missing/pruned history also refuses admission.
 for i,node in enumerate(m['validators']):
  port=ports(i)['rpc']
  for phase in ['before','after']:
   if rpc(port,'getGenesisHash')!=m['genesis'] or rpc(port,'getIdentity').get('identity')!=node['identity']:raise ValueError('CONTINUITY_NODE_IDENTITY_DIFFERS')
   if phase=='before':
    block=rpc(port,'getBlock',[first['sharedFinalizedSlot'],{'commitment':'finalized','transactionDetails':'none','rewards':False}])
    if not isinstance(block,dict) or block.get('blockhash')!=first['sharedFinalizedBlockhash']:raise ValueError('EARLIER_FINALIZED_BLOCK_CHANGED')
 return {'voteAndRootProgressionVerified':True,'nodeVoteComparisons':9,'activatedStakeUnchanged':True,'earlierFinalizedBlockPreserved':True,'earlierFinalizedSlot':first['sharedFinalizedSlot'],'earlierFinalizedBlockhash':first['sharedFinalizedBlockhash'],'continuityReaders':3,'independentOperatorsVerified':False,'actualForkRecoveryVerified':False,'productionReady':False}

def stop_owned_process(p):
 forced=False
 if p.poll() is None:
  try:os.killpg(p.pid,signal.SIGINT)
  except ProcessLookupError:pass
  try:p.wait(timeout=45)
  except subprocess.TimeoutExpired:
   forced=True
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   p.wait(timeout=10)
 return {'returnCode':p.returncode,'forced':forced}

_process_admission_spec=importlib.util.spec_from_file_location('process_admission',Path(__file__).with_name('process_admission.py'));process_admission=importlib.util.module_from_spec(_process_admission_spec);_process_admission_spec.loader.exec_module(process_admission)

_restart_spec=importlib.util.spec_from_file_location('validator_restart',Path(__file__).with_name('validator_restart.py'));validator_restart=importlib.util.module_from_spec(_restart_spec);_restart_spec.loader.exec_module(validator_restart)

def run(bundle,binaries,run_id,execute=False,restart_node=None):
 preflight=host.assess(host.probe(binaries,BASE.parent))
 if not preflight['canPrepareFreshPrivateRehearsal']:return {'state':'blocked','host':preflight,'validatorsStarted':0,'createdLedger':False,'productionReady':False}
 if not re.fullmatch('[a-z0-9][a-z0-9-]{7,63}',run_id):raise ValueError('NEW_PRIVATE_ATTEMPT_ID_REQUIRED')
 if restart_node is not None and (type(restart_node) is not int or restart_node not in range(3)):raise ValueError('EXPLICIT_RESTART_NODE_REQUIRED')
 root=BASE/'runs'/run_id
 if BASE.is_symlink() or root.parent.is_symlink() or root.resolve().parent!=root.parent.resolve():raise ValueError('PRIVATE_RUN_PATH_DIFFERS')
 if root.exists() or root.is_symlink():raise ValueError('RETAINED_ATTEMPT_MUST_NOT_BE_REUSED')
 m,audit=check_bundle(bundle,binaries)
 if not execute:return {'state':'packet-checked','host':preflight,'audit':audit,'validatorsStarted':0,'createdLedger':False,'bankHashLocallyVerified':False,'bankHashEnforcedByRuntime':True,'warmRestartRequested':restart_node is not None,'warmRestartVerified':False,'productionReady':False}
 # No canonical container, existing ledgers, public ingress or external RPC.
 if os.environ.get('RAILWAY_SERVICE_ID')=='d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6':raise ValueError('CANONICAL_SERVICE_FORBIDDEN')
 process_admission.no_active_validator()
 for port in all_ports():
  for kind in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
   with socket.socket(socket.AF_INET,kind) as sock:sock.bind(('127.0.0.1',port))
 os.umask(0o077);root.parent.mkdir(mode=0o700,exist_ok=True);root.mkdir(mode=0o700)
 proof={'schemaVersion':1,'state':'running','scope':'Fresh private three full validators on one host; synthetic supply, no independent operators or production acceptance','genesis':m['genesis'],'audit':audit,'validatorsStarted':0,'stops':[],'createdKeys':False,'canonicalNetworkChanged':False,'productionReady':False,'hostAndPohChecksSkipped':False,'actualFundedOriginalBackingVerified':False,'warmRestartRequested':restart_node is not None,'warmRestartVerified':False}
 def save():(root/'public-result.json').write_text(json.dumps(proof,indent=2))
 processes=[];handles=[];save()
 previous_term=signal.getsignal(signal.SIGTERM)
 def stop_requested(signum,frame):raise KeyboardInterrupt()
 signal.signal(signal.SIGTERM,stop_requested)
 try:
  for i in range(3):
   ledger=root/('node-'+str(i))
   materialized=genesis_archive.materialize(regular(bundle/'genesis'/'genesis.tar.bz2'),ledger,m['genesisArchiveSHA256'],m['genesisBinSHA256'])
   proof.setdefault('initialLedgers',[]).append({'node':i,**materialized});save()
   log=(root/('node-'+str(i)+'-private.log')).open('xb');handles.append(log)
   pin,size=host.PINS['agave-validator']
   if host.sha(binaries/'agave-validator')!=pin or (binaries/'agave-validator').stat().st_size!=size:raise ValueError('VALIDATOR_BINARY_CHANGED_BEFORE_START')
   processes.append(subprocess.Popen(command(binaries/'agave-validator',root,bundle,m,i),stdout=log,stderr=subprocess.STDOUT,start_new_session=True));proof['validatorsStarted']+=1;save()
  until=time.monotonic()+360
  while time.monotonic()<until:
   if any(p.poll() is not None for p in processes):raise ValueError('PRIVATE_VALIDATOR_EXITED')
   try:first=runtime_observation(m);break
   except (OSError,ValueError,KeyError,TypeError) as error:
    if not validator_restart.retryable_observation(error):raise
    time.sleep(3)
  else:raise ValueError('BOUNDED_CONSENSUS_NOT_OBSERVED')
  proof['firstObservation']=first;save();time.sleep(20)
  if any(p.poll() is not None for p in processes):raise ValueError('PRIVATE_VALIDATOR_EXITED')
  last=runtime_observation(m);proof['lastObservation']=last;save()
  proof['progressReview']=verify_progress(m,first,last)
  if any(p.poll() is not None for p in processes):raise ValueError('PRIVATE_VALIDATOR_EXITED')
  if restart_node is not None:
   proof['restartRequestedNode']=restart_node;save()
   def start_again(i):
    # Re-admit the exact bundle and runtime before starting on the SAME ledger.
    selected,_=check_bundle(bundle,binaries)
    if selected!=m:raise ValueError('RESTART_BUNDLE_CHANGED')
    pin,size=host.PINS['agave-validator'];binary=binaries/'agave-validator'
    if host.sha(regular(binary))!=pin or binary.stat().st_size!=size:raise ValueError('VALIDATOR_BINARY_CHANGED_BEFORE_RESTART')
    ledger=root/('node-'+str(i))
    if ledger.is_symlink() or not ledger.is_dir() or host.sha(regular(ledger/'genesis.bin'))!=m['genesisBinSHA256']:raise ValueError('ORIGINAL_RESTART_LEDGER_REQUIRED')
    log=(root/('node-'+str(i)+'-restart-private.log')).open('xb');handles.append(log)
    child=subprocess.Popen(command(binary,root,bundle,m,i),stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    processes[i]=child;proof['validatorsStarted']+=1;save();return child
   proof['warmRestartReview']=validator_restart.restart_node(node=restart_node,manifest=m,processes=processes,baseline=last,stop_owned=stop_owned_process,start_owned=start_again,rpc=rpc,ports=ports,observe=runtime_observation,verify_progress=verify_progress)
   proof['warmRestartVerified']=True;save()
  proof['state']='passed'
 except BaseException as e:
  proof['state']='failed';proof['failureType']=type(e).__name__;proof['failureCode']=str(e) if type(e) is ValueError and re.fullmatch('[A-Z_]+',str(e)) else 'PRIVATE_REHEARSAL_FAILED'
 finally:
  signal.signal(signal.SIGTERM,previous_term)
  for i,p in enumerate(processes):
   try:
    stopped=stop_owned_process(p);proof['stops'].append({'node':i,**stopped})
    if stopped['forced'] or stopped['returnCode'] not in [0,-signal.SIGINT]:proof['state']='failed'
   except Exception:
    proof['state']='failed';proof['stops'].append({'node':i,'cleanupFailed':True})
  for h in handles:h.close()
  proof['allStopped']=all(p.poll() is not None for p in processes);save()
 return proof

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--binary-directory',type=Path,required=True);p.add_argument('--run-id',required=True);p.add_argument('--run',action='store_true');p.add_argument('--restart-node',type=int,choices=range(3));p.add_argument('--ack');a=p.parse_args()
 if a.run and a.ack!='fresh-private-three-validators':p.error('Explicit fresh-private-three-validators acknowledgment required')
 try:r=run(a.bundle,a.binary_directory,a.run_id,a.run,a.restart_node)
 except Exception as e:r={'state':'blocked','failureType':type(e).__name__,'failureCode':str(e) if type(e) is ValueError and re.fullmatch('[A-Z_]+',str(e)) else 'PRIVATE_PACKET_CHECK_FAILED','validatorsStarted':0,'productionReady':False}
 print(json.dumps(r,indent=2));return 0 if r['state'] in ['passed','packet-checked'] else 78
if __name__=='__main__':raise SystemExit(main())
