#!/usr/bin/env python3
"""Prepare a fresh synthetic genesis bundle only after full host admission.

Default is read-only admission. Never starts validators or activates a network.
"""
from pathlib import Path
import argparse,datetime,hashlib,importlib.util,json,os,re,signal,stat,subprocess
_spec=importlib.util.spec_from_file_location('consensus',Path(__file__).with_name('consensus.py'));c=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(c)
_process_spec=importlib.util.spec_from_file_location('offline_process',Path(__file__).with_name('offline_process.py'));offline_process=importlib.util.module_from_spec(_process_spec);_process_spec.loader.exec_module(offline_process)
BASE=Path('/data/mainnet-consensus-v2')
TOTAL=1_000_000_000_000
CANONICAL_SERVICE='d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'

def check_binary(binary,digest,size,failure_code):
 try:actual=c.host.binary_fingerprint(binary,size)
 except (OSError,ValueError):raise ValueError(failure_code) from None
 if actual!={'sha256':digest,'bytes':size,'executable':True}:raise ValueError(failure_code)

def check_tools(directory):
 for manifest in ['consensus-audit-artifact.json','ledger-tool-artifact.json','allocation-decoder-artifact.json']:
  artifact=json.loads(Path(__file__).with_name(manifest).read_text());binary=directory/artifact['name']
  check_binary(binary,artifact['sha256'],artifact['bytes'],'REVIEWED_PREPARATION_ARTIFACT_REQUIRED')
 return True

def calibrated_hashes(audit):
 poh=audit.get('pohConfig')
 hashes=poh.get('hashes_per_tick') if type(poh) is dict else None
 if type(hashes) is not int or not 0<hashes<2**64:raise ValueError('CALIBRATED_HASH_COUNT_REQUIRED')
 return hashes

def audited_policy(audit):
 # These are the non-account policy objects emitted by the pinned v2 auditor.
 fields=('inflation','feeRateGovernor','rent','epochSchedule','pohConfig')
 if any(type(audit.get(field)) is not dict or not audit[field] for field in fields):raise ValueError('AUDITED_GENESIS_POLICY_REQUIRED')
 try:return json.dumps({field:audit[field] for field in fields},sort_keys=True,separators=(',',':'),allow_nan=False)
 except (TypeError,ValueError):raise ValueError('AUDITED_GENESIS_POLICY_REQUIRED') from None

def audited_allocations(audit,reserve,reserve_units):
 # The metadata auditor and byte decoder must independently agree.
 failure='AUDITED_GENESIS_ALLOCATIONS_REQUIRED'
 rows=audit.get('accounts');count=audit.get('accountCount');total=audit.get('totalLamports')
 if type(rows) is not list or type(count) is not int or not 0<count<=4096 or len(rows)!=count:raise ValueError(failure)
 def units(value):
  if type(value) is not str or not re.fullmatch('(0|[1-9][0-9]{0,19})',value) or int(value)>=2**64:raise ValueError(failure)
  return int(value)
 expected_total=units(total);seen=set();summed=0;normalized=[];found=False
 for row in rows:
  if type(row) is not dict or set(row)!={'address','owner','lamports','dataBytes','executable'}:raise ValueError(failure)
  try:c.address(row['address']);c.address(row['owner'])
  except ValueError:raise ValueError(failure) from None
  if row['address'] in seen or type(row['dataBytes']) is not int or not 0<=row['dataBytes']<=10*1024**2 or type(row['executable']) is not bool:raise ValueError(failure)
  seen.add(row['address']);amount=units(row['lamports']);summed+=amount;selected=row.copy()
  if row['address']==reserve:
   if amount!=reserve_units or row['owner']!='11111111111111111111111111111111' or row['dataBytes']!=0 or row['executable'] is not False:raise ValueError(failure)
   found=True;selected['lamports']='0'
  normalized.append(selected)
 if not found or summed!=expected_total:raise ValueError(failure)
 return json.dumps(sorted(normalized,key=lambda row:row['address']),sort_keys=True,separators=(',',':'))

def genesis_snapshot(path):
 # Read one bounded regular-file snapshot without waiting on special files.
 failure='GENESIS_SNAPSHOT_REQUIRED'
 if path.resolve()!=path:raise ValueError(failure)
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_mode&0o022 or not 0<before.st_size<=16*1024**2:raise ValueError(failure)
  with os.fdopen(fd,'rb',closefd=False) as stream:data=stream.read(16*1024**2+1)
  after=os.fstat(fd);current=path.stat(follow_symlinks=False)
  identity=lambda v:(v.st_dev,v.st_ino,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
  if len(data)!=before.st_size or identity(before)!=identity(after) or identity(after)!=identity(current) or path.resolve()!=path:raise ValueError('GENESIS_SNAPSHOT_CHANGED')
  return data
 finally:os.close(fd)

def decoded_allocations(decoded,audit,reserve,reserve_units):
 failure='DECODED_GENESIS_ALLOCATIONS_REQUIRED'
 if type(decoded) is not dict:raise ValueError(failure)
 permissions=['keyCustodyVerified','lockupEnforcementVerified','reserveCustodyVerified','backingVerified','independentOperatorsVerified','consensusVerified','canSign','canBroadcast','mainnetActivated','productionReady']
 if type(decoded.get('schemaVersion')) is not int or decoded['schemaVersion']!=1 or decoded.get('scope')!='offline-selected-isolated-genesis-allocation-bytes-v1' or any(decoded.get(k) is not True for k in ['completeAccountFingerprintsComputed','genesisAccountBytesDecoded','authorityKeysDecoded']) or any(decoded.get(k) is not False for k in permissions):raise ValueError(failure)
 digest=lambda value:type(value) is str and re.fullmatch('[0-9a-f]{64}',value) is not None
 creation=decoded.get('creationTime')
 if type(creation) is not str or not re.fullmatch('(0|-?[1-9][0-9]{0,18})',creation) or not -(2**63)<=int(creation)<2**63 or not digest(decoded.get('nonAccountParametersSHA256')):raise ValueError(failure)
 rows=decoded.get('accounts')
 if type(rows) is not list or not 0<len(rows)<=4096:raise ValueError(failure)
 metadata=[];normalized=[]
 fields={'address','owner','lamports','dataBytes','executable'}
 for row in rows:
  if type(row) is not dict or set(row)!=fields|{'dataSHA256','rentEpoch','accountSHA256'} or not digest(row['dataSHA256']) or not digest(row['accountSHA256']):raise ValueError(failure)
  epoch=row['rentEpoch']
  if type(epoch) is not str or not re.fullmatch('(0|[1-9][0-9]{0,19})',epoch) or int(epoch)>=2**64:raise ValueError(failure)
  metadata.append({k:row[k] for k in fields});selected=row.copy()
  if row['address']==reserve:
   # The pinned decoder fingerprints serialized Account, including lamports.
   # Only this exact empty System account may change balance. All its other
   # serialized fields are fixed here and by audited_allocations below.
   if epoch!='0' or row['dataSHA256']!=hashlib.sha256(b'').hexdigest():raise ValueError(failure)
   selected['lamports']='0';selected.pop('accountSHA256')
  normalized.append(selected)
 projection={'accounts':metadata,'accountCount':decoded.get('accountCount'),'totalLamports':decoded.get('totalNativeUnits')}
 if decoded.get('genesis')!=audit.get('genesis') or decoded.get('totalNativeUnits')!=audit.get('totalLamports') or audited_allocations(projection,reserve,reserve_units)!=audited_allocations(audit,reserve,reserve_units):raise ValueError(failure)
 # Full fingerprints already bind authority data; retain and bind the decoded
 # summaries too, without treating authority knowledge as custody evidence.
 by_key={r['address']:r for r in rows};groups={}
 for field,owner in [('stakeAccounts','Stake11111111111111111111111111111111111111'),('voteAccounts','Vote111111111111111111111111111111111111111')]:
  group=decoded.get(field)
  if type(group) is not list or any(type(r) is not dict or set(r)!={'address','nativeUnits','dataSHA256','authorities'} or type(r['address']) is not str or type(r['authorities']) is not dict or not r['authorities'] for r in group):raise ValueError(failure)
  if len({r['address'] for r in group})!=len(group) or {r['address'] for r in group}!={r['address'] for r in rows if r['owner']==owner}:raise ValueError(failure)
  if any(r['nativeUnits']!=by_key[r['address']]['lamports'] or r['dataSHA256']!=by_key[r['address']]['dataSHA256'] for r in group):raise ValueError(failure)
  groups[field]=sorted(group,key=lambda r:r['address'])
 try:return json.dumps({'accounts':sorted(normalized,key=lambda r:r['address']),'parameters':decoded['nonAccountParametersSHA256'],**groups},sort_keys=True,separators=(',',':'),allow_nan=False)
 except (TypeError,ValueError):raise ValueError(failure) from None

def genesis_command(binary,ledger,nodes,reserve,primordial,hashes_per_tick=None):
 # Calibrate only the budget probe; the final compiler receives its exact count.
 selected='auto' if hashes_per_tick is None else str(calibrated_hashes({'pohConfig':{'hashes_per_tick':hashes_per_tick}}))
 args=[str(binary),'--ledger',str(ledger),'--cluster-type','development','--inflation','none','--hashes-per-tick',selected,'--slots-per-epoch','128','--bootstrap-validator-lamports','10000000000','--bootstrap-validator-stake-lamports','100000000000','--fee-burn-percentage','0','--rent-burn-percentage','0','--faucet-pubkey',c.address(reserve),'--faucet-lamports','0','--primordial-accounts-file',str(primordial)]
 for node in nodes:
  args+=['--bootstrap-validator',c.address(node['identity']),c.address(node['vote']),c.address(node['stake'])]
 return args

def replay_commands(binary,ledger):
 base=[str(binary),'--ledger',str(ledger),'--output','json-compact','--unified-scheduler-handler-threads','2']
 return [base+['verify','--halt-at-slot','0','--no-snapshot','--print-bank-hash'],base+['shred-version','--no-snapshot']]

def parse_bank(raw,genesis):
 try:bank=json.loads(raw)
 except (ValueError,TypeError):raise ValueError('EXACT_SLOT_ZERO_BANK_RESULT_REQUIRED')
 if not isinstance(bank,dict) or set(bank)!={'slot','hash'} or type(bank['slot']) is not int or bank['slot']!=0:raise ValueError('EXACT_SLOT_ZERO_BANK_RESULT_REQUIRED')
 value=c.address(bank['hash'])
 if value==genesis:raise ValueError('GENESIS_IS_NOT_A_BANK_HASH')
 return value

def parse_shred(raw):
 if not isinstance(raw,str) or not re.fullmatch('[1-9][0-9]{0,4}\\s*',raw) or int(raw)>65535:raise ValueError('EXACT_SHRED_VERSION_RESULT_REQUIRED')
 return int(raw)

def combine_replays(rows,genesis):
 if len(rows)!=2 or any(set(r)!={'bankHash','shredVersion'} for r in rows):raise ValueError('TWO_FRESH_SLOT_ZERO_REPLAYS_REQUIRED')
 for row in rows:
  c.address(row['bankHash']);parse_shred(str(row['shredVersion']))
  if row['bankHash']==genesis:raise ValueError('GENESIS_IS_NOT_A_BANK_HASH')
 if rows[0]!=rows[1]:raise ValueError('FRESH_SLOT_ZERO_REPLAYS_DISAGREE')
 return rows[0].copy()

def budget_probe(audit):
 if audit.get('clusterType')!='development' or audit.get('genesis') in c.FORBIDDEN:raise ValueError('PRIVATE_DEVELOPMENT_GENESIS_REQUIRED')
 total=audit.get('totalLamports')
 if not isinstance(total,str) or not re.fullmatch('[1-9][0-9]*',total):raise ValueError('EXACT_GENESIS_BUDGET_REQUIRED')
 fixed=int(total)-1
 if not 0<fixed<TOTAL:raise ValueError('SYNTHETIC_BUDGET_EXCEEDED')
 return fixed

def no_active_validator():
 return c.process_admission.no_active_validator()

def run(binary_directory,bundle_id,execute=False):
 if os.environ.get('RAILWAY_SERVICE_ID')==CANONICAL_SERVICE:raise ValueError('CANONICAL_SERVICE_FORBIDDEN')
 preflight=c.host.assess(c.host.probe(binary_directory,BASE.parent))
 if not preflight['canPrepareFreshPrivateRehearsal']:return {'state':'blocked','host':preflight,'createdKeys':False,'createdLedger':False,'validatorsStarted':0,'productionReady':False}
 check_tools(binary_directory)
 if not re.fullmatch('[a-z0-9][a-z0-9-]{7,63}',bundle_id):raise ValueError('NEW_PRIVATE_BUNDLE_ID_REQUIRED')
 if not execute:return {'state':'preparation-host-admitted','host':preflight,'reviewedToolsMatch':True,'createdKeys':False,'createdLedger':False,'validatorsStarted':0,'productionReady':False}
 no_active_validator()
 for directory in [BASE,BASE/'preparations',BASE/'bundles']:
  if directory.is_symlink() or any(p.is_symlink() for p in directory.parents):raise ValueError('PRIVATE_PREPARATION_ROOT_REQUIRED')
  if directory.exists() and (not directory.is_dir() or directory.stat().st_uid!=os.getuid() or stat.S_IMODE(directory.stat().st_mode)&0o077):raise ValueError('OWNER_ONLY_PREPARATION_ROOT_REQUIRED')
 root=BASE/'preparations'/bundle_id;bundle=BASE/'bundles'/bundle_id
 if root.exists() or root.is_symlink() or bundle.exists() or bundle.is_symlink():raise ValueError('RETAINED_PREPARATION_MUST_NOT_BE_REUSED')
 os.umask(0o077)
 for directory in [BASE,BASE/'preparations',BASE/'bundles']:directory.mkdir(mode=0o700,exist_ok=True)
 root.mkdir(mode=0o700);bundle.mkdir(mode=0o700);keys=bundle/'keys';keys.mkdir(mode=0o700)
 proof={'schemaVersion':1,'state':'preparing','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Fresh private synthetic genesis and two slot-zero ledger replays; no running network','validatorsStarted':0,'canonicalNetworkChanged':False,'mainnetActivated':False,'actualFundedBackingVerified':False,'independentOperatorsVerified':False,'productionReady':False,'hostChecksWeakened':False,'createdKeys':False,'createdLedger':False}
 def save():(root/'public-result.json').write_text(json.dumps(proof,indent=2)+'\n')
 save();sequence=0
 def tool(args,timeout=180,input_bytes=None):
  nonlocal sequence
  # Only the selected offline tools; verify bytes again before every invocation.
  selected={binary_directory/n for n in ['solana-keygen','solana-genesis','classic-genesis-audit-v2','agave-ledger-tool','classic-genesis-allocation-bytes']}
  if Path(args[0]) not in selected:raise ValueError('OFFLINE_PREPARATION_TOOL_REQUIRED')
  check_tools(binary_directory)
  for name,(digest,size) in c.host.PINS.items():
   binary=binary_directory/name
   check_binary(binary,digest,size,'REVIEWED_RUNTIME_ARTIFACT_CHANGED')
  sequence+=1
  with (root/('tool-'+str(sequence)+'-private.log')).open('xb') as log:
   return offline_process.run_tool(args,log,timeout=timeout,input_bytes=input_bytes,stdout_limit=(8 if Path(args[0]).name=='classic-genesis-allocation-bytes' else 4)*1024**2).decode()
 previous_term=signal.getsignal(signal.SIGTERM)
 def stop_requested(signum,frame):raise KeyboardInterrupt()
 signal.signal(signal.SIGTERM,stop_requested)
 try:
  nodes=[]
  for i in range(3):
   node={}
   for kind in ['identity','vote','stake']:
    file=keys/('node-'+str(i)+'-'+kind+'.json')
    tool([str(binary_directory/'solana-keygen'),'new','--no-bip39-passphrase','--silent','--outfile',str(file)])
    if file.is_symlink() or file.stat().st_uid!=os.getuid() or stat.S_IMODE(file.stat().st_mode)&0o077:raise ValueError('OWNER_ONLY_GENERATED_KEY_REQUIRED')
    node[kind]=c.address(tool([str(binary_directory/'solana-keygen'),'pubkey',str(file)]).strip())
   nodes.append(node)
  reserve_key=keys/'synthetic-reserve.json';tool([str(binary_directory/'solana-keygen'),'new','--no-bip39-passphrase','--silent','--outfile',str(reserve_key)])
  if reserve_key.is_symlink() or reserve_key.stat().st_uid!=os.getuid() or stat.S_IMODE(reserve_key.stat().st_mode)&0o077:raise ValueError('OWNER_ONLY_GENERATED_KEY_REQUIRED')
  reserve=c.address(tool([str(binary_directory/'solana-keygen'),'pubkey',str(reserve_key)]).strip())
  if reserve=='11111111111111111111111111111111' or reserve in {v for n in nodes for v in n.values()}:raise ValueError('DISTINCT_SYNTHETIC_RESERVE_REQUIRED')
  primordial=root/'primordial-private.json'
  def genesis(name,reserve_units,hashes_per_tick=None):
   primordial.write_text(json.dumps({reserve:{'balance':reserve_units,'owner':'11111111111111111111111111111111','data':'~','executable':False}}))
   ledger=root/name
   if ledger.exists():raise ValueError('FRESH_GENESIS_DIRECTORY_REQUIRED')
   proof['createdLedger']=True;save();tool(genesis_command(binary_directory/'solana-genesis',ledger,nodes,reserve,primordial,hashes_per_tick))
   audit=json.loads(tool([str(binary_directory/'classic-genesis-audit-v2'),str(ledger)]));return ledger,audit
  probe_ledger,probe=genesis('budget-probe',1);fixed=budget_probe(probe);hashes=calibrated_hashes(probe)
  probe_policy=audited_policy(probe);probe_allocations=audited_allocations(probe,reserve,1)
  def decode(ledger,audit,reserve_units):
   source=ledger/'genesis.bin';snapshot=genesis_snapshot(source);digest=hashlib.sha256(snapshot).hexdigest()
   output=tool([str(binary_directory/'classic-genesis-allocation-bytes'),'--isolated-genesis-stdin',c.address(audit['genesis']),digest],timeout=30,input_bytes=snapshot)
   with (root/(ledger.name+'-allocation-private.json')).open('x') as out:out.write(output)
   if genesis_snapshot(source)!=snapshot:raise ValueError('GENESIS_CHANGED_DURING_DECODE')
   decoded=json.loads(output);projection=decoded_allocations(decoded,audit,reserve,reserve_units)
   return projection,digest,decoded['creationTime']
  probe_bytes,probe_sha,probe_creation=decode(probe_ledger,probe,1)
  proof['calibratedHashesPerTick']=hashes;save()
  ledger,audit=genesis('fresh-genesis',TOTAL-fixed,hashes)
  if calibrated_hashes(audit)!=hashes or audit['pohConfig']!=probe['pohConfig']:raise ValueError('FINAL_GENESIS_POH_DIFFERS')
  if audited_policy(audit)!=probe_policy:raise ValueError('FINAL_GENESIS_POLICY_DIFFERS')
  proof['finalPohMatchesBudgetProbe']=True;proof['auditedPolicyMatchesBudgetProbe']=True;save()
  if audit.get('totalLamports')!=str(TOTAL):raise ValueError('FINAL_GENESIS_SUPPLY_DIFFERS')
  rows=[a for a in audit['accounts'] if a['address']==reserve]
  if len(rows)!=1 or rows[0]['owner']!='11111111111111111111111111111111' or rows[0]['lamports']!=str(TOTAL-fixed) or type(rows[0].get('dataBytes')) is not int or rows[0]['dataBytes']!=0 or rows[0].get('executable') is not False:raise ValueError('EXACT_SYNTHETIC_RESERVE_REQUIRED')
  if audited_allocations(audit,reserve,TOTAL-fixed)!=probe_allocations:raise ValueError('FINAL_GENESIS_ALLOCATIONS_DIFFER')
  final_bytes,final_sha,final_creation=decode(ledger,audit,TOTAL-fixed)
  if final_bytes!=probe_bytes:raise ValueError('FINAL_GENESIS_ALLOCATION_BYTES_DIFFER')
  if hashlib.sha256(genesis_snapshot(probe_ledger/'genesis.bin')).hexdigest()!=probe_sha:raise ValueError('BUDGET_PROBE_CHANGED')
  proof.update({'auditedAllocationsMatchBudgetProbe':True,'decodedAllocationsMatchBudgetProbe':True,'nonAccountParametersMatchBudgetProbe':True,'budgetProbeCreationTime':probe_creation,'finalCreationTime':final_creation});save()
  g=bundle/'genesis';g.mkdir(mode=0o700)
  for name in ['genesis.bin','genesis.tar.bz2']:
   source=c.regular(ledger/name)
   with (g/name).open('xb') as target:target.write(source.read_bytes())
  binary_sha=c.host.sha(g/'genesis.bin')
  if binary_sha!=final_sha:raise ValueError('DECODED_GENESIS_CHANGED_BEFORE_REPLAY')
  archive_sha=c.host.sha(g/'genesis.tar.bz2');replays=[]
  for i in range(2):
   replay=root/('slot-zero-replay-'+str(i));c.genesis_archive.materialize(g/'genesis.tar.bz2',replay,archive_sha,binary_sha)
   commands=replay_commands(binary_directory/'agave-ledger-tool',replay)
   bank=parse_bank(tool(commands[0]),audit['genesis']);shred=parse_shred(tool(commands[1]))
   if c.host.sha(g/'genesis.bin')!=binary_sha or c.host.sha(replay/'genesis.bin')!=binary_sha or c.host.sha(g/'genesis.tar.bz2')!=archive_sha:raise ValueError('GENESIS_CHANGED_DURING_REPLAY')
   replays.append({'bankHash':bank,'shredVersion':shred});proof['completedSlotZeroReplays']=len(replays);save()
  pins=combine_replays(replays,audit['genesis'])
  manifest={'schemaVersion':1,'scope':'fresh-private-consensus-rehearsal','runtimeSource':c.SOURCE,'genesis':audit['genesis'],**pins,'genesisBinSHA256':binary_sha,'genesisArchiveSHA256':archive_sha,'inventorySHA256':c.inventory_hash(audit['accounts']),'totalNativeUnits':str(TOTAL),'validators':nodes}
  c.validate_audit(manifest,audit)
  with (bundle/'manifest.json').open('x') as out:out.write(json.dumps(manifest,indent=2)+'\n')
  selected,summary=c.check_bundle(bundle,binary_directory)
  if selected!=manifest:raise ValueError('FINAL_BUNDLE_DIFFERS')
  proof.update({'state':'prepared','genesis':manifest['genesis'],'bankHash':pins['bankHash'],'shredVersion':pins['shredVersion'],'audit':summary,'sameSlotZeroHashesOnFreshCopies':True,'syntheticReserveNativeUnits':str(TOTAL-fixed),'fixedGenesisNativeUnits':str(fixed),'manifestSHA256':c.host.sha(bundle/'manifest.json')})
 except BaseException as error:
  proof['state']='failed';proof['failureType']=type(error).__name__;message=str(error)
  proof['failureCode']=message if type(error) is ValueError and re.fullmatch('[A-Z_]+',message) else 'PRIVATE_PREPARATION_FAILED'
 finally:
  signal.signal(signal.SIGTERM,previous_term)
  proof['generatedKeyFiles']=sum(p.is_file() and not p.is_symlink() for p in keys.glob('*.json'));proof['createdKeys']=proof['generatedKeyFiles']>0
  proof['createdLedger']=any((root/name).is_dir() for name in ['budget-probe','fresh-genesis','slot-zero-replay-0','slot-zero-replay-1'])
  save()
 return proof

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--binary-directory',type=Path,required=True);p.add_argument('--bundle-id',required=True);p.add_argument('--prepare',action='store_true');p.add_argument('--ack');args=p.parse_args()
 if args.prepare and args.ack!='fresh-private-synthetic-genesis':p.error('Explicit fresh-private-synthetic-genesis acknowledgment required')
 try:result=run(args.binary_directory,args.bundle_id,args.prepare)
 except Exception as error:
  message=str(error);result={'state':'blocked','failureType':type(error).__name__,'failureCode':message if type(error) is ValueError and re.fullmatch('[A-Z_]+',message) else 'PRIVATE_PREPARATION_ADMISSION_FAILED','validatorsStarted':0,'productionReady':False}
 print(json.dumps(result,indent=2));return 0 if result['state'] in ['preparation-host-admitted','prepared'] else 78
if __name__=='__main__':raise SystemExit(main())
