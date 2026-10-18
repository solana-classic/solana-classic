import importlib.util,json,tempfile,unittest,hashlib,os
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('preparation',Path(__file__).with_name('prepare-consensus.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

def key(n):
 raw=n.to_bytes(32,'big');out='';value=n
 while value:out=m.c.ALPHABET[value%58]+out;value//=58
 return '1'*(len(raw)-len(raw.lstrip(b'\0')))+out

class Preparation(unittest.TestCase):
 def test_current_host_refuses_before_tools_keys_processes_or_writes(self):
  with patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':False}),patch.object(m,'check_tools') as tools,patch.object(m.offline_process,'run_tool') as process,patch.object(m,'no_active_validator') as active:
   result=m.run(Path('/not-opened'),'fresh-bundle-001',True)
  self.assertEqual(result['state'],'blocked');self.assertFalse(result['createdKeys']);self.assertFalse(result['createdLedger']);tools.assert_not_called();process.assert_not_called();active.assert_not_called()
 def test_canonical_service_is_rejected_even_before_host_probe(self):
  with patch.dict(m.os.environ,{'RAILWAY_SERVICE_ID':m.CANONICAL_SERVICE}),patch.object(m.c.host,'probe') as probe:
   with self.assertRaisesRegex(ValueError,'CANONICAL_SERVICE'):m.run(Path('/not-opened'),'fresh-bundle-001',True)
   probe.assert_not_called()
 def test_read_only_default_cannot_generate_keys_or_ledgers_on_admitted_host(self):
  with patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_tools',return_value=True),patch.object(m.offline_process,'run_tool') as process,patch.object(m,'no_active_validator') as active:
   result=m.run(Path('/tools'),'fresh-bundle-001')
  self.assertEqual(result['state'],'preparation-host-admitted');self.assertFalse(result['createdKeys']);self.assertFalse(result['createdLedger']);self.assertEqual(result['validatorsStarted'],0);process.assert_not_called();active.assert_not_called()
 def test_invalid_or_path_shaped_bundle_ids_refuse(self):
  for bundle in ['../old','/private/path','short','valid-but-UPPER','a'*65]:
   with self.subTest(bundle=bundle),patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_tools',return_value=True),self.assertRaisesRegex(ValueError,'NEW_PRIVATE'):m.run(Path('/tools'),bundle)
 def test_replay_commands_have_no_verification_or_host_check_bypass(self):
  commands=m.replay_commands(Path('/tools/agave-ledger-tool'),Path('/fresh/replay'))
  self.assertEqual(len(commands),2)
  for command in commands:
   self.assertIn('--no-snapshot',command)
   for bad in ['--skip-verification','--skip-poh-verify','--ignore-ulimit-nofile-error','--force-update-to-open','--hard-fork','--warp-slot']:self.assertNotIn(bad,command)
  self.assertIn('verify',commands[0]);self.assertIn('--print-bank-hash',commands[0]);self.assertEqual(commands[0][commands[0].index('--halt-at-slot')+1],'0');self.assertIn('shred-version',commands[1]);self.assertNotIn('--halt-at-slot',commands[1])
 def test_genesis_command_is_private_hashing_zero_inflation_and_fixed_synthetic_policy(self):
  nodes=[{'identity':key(100+i*3),'vote':key(101+i*3),'stake':key(102+i*3)} for i in range(3)]
  command=m.genesis_command(Path('/tools/solana-genesis'),Path('/fresh/genesis'),nodes,key(500),Path('/fresh/input.json'))
  for flag,value in [('--cluster-type','development'),('--inflation','none'),('--hashes-per-tick','auto'),('--faucet-lamports','0'),('--fee-burn-percentage','0'),('--rent-burn-percentage','0')]:self.assertEqual(command[command.index(flag)+1],value)
  self.assertEqual(command.count('--bootstrap-validator'),3);self.assertNotIn('sleep',command);self.assertNotIn('--reset',command)
 def test_calibrated_hash_count_requires_positive_u64_integer(self):
  for value in [1,12500,2**64-1]:self.assertEqual(m.calibrated_hashes({'pohConfig':{'hashes_per_tick':value}}),value)
  for value in [None,True,False,0,-1,1.0,'12500',2**64]:
   with self.subTest(value=value),self.assertRaisesRegex(ValueError,'CALIBRATED_HASH_COUNT_REQUIRED'):m.calibrated_hashes({'pohConfig':{'hashes_per_tick':value}})
  for audit in [{},{'pohConfig':None},{'pohConfig':[]}]:
   with self.subTest(audit=audit),self.assertRaisesRegex(ValueError,'CALIBRATED_HASH_COUNT_REQUIRED'):m.calibrated_hashes(audit)
 def test_final_genesis_command_uses_selected_numeric_hash_count(self):
  args=(Path('/tools/solana-genesis'),Path('/fresh'),[],key(500),Path('/primordial'))
  command=m.genesis_command(*args,hashes_per_tick=12500)
  self.assertEqual(command[command.index('--hashes-per-tick')+1],'12500');self.assertNotIn('auto',command);self.assertNotIn('sleep',command)
  for value in [True,0,-1,'auto','sleep',2**64]:
   with self.subTest(value=value),self.assertRaises(ValueError):m.genesis_command(*args,hashes_per_tick=value)
 def test_slot_zero_result_is_exact_and_genesis_is_never_substituted_for_bank(self):
  self.assertEqual(m.parse_bank(json.dumps({'slot':0,'hash':key(501)}),key(500)),key(501))
  for bank in [{'slot':True,'hash':key(501)},{'slot':1,'hash':key(501)},{'slot':0,'hash':key(500)},{'slot':0,'hash':'bad'},{'slot':0,'hash':key(501),'extra':True}]:
   with self.subTest(bank=bank),self.assertRaises(ValueError):m.parse_bank(json.dumps(bank),key(500))
  with self.assertRaises(ValueError):m.parse_bank('not-json',key(500))
 def test_shred_version_is_nonzero_integer_and_bounded(self):
  for value in ['1','123\n','65535']:self.assertEqual(m.parse_shred(value),int(value))
  for value in ['0','65536','1.0','0123','-1','123 extra',True,1]:
   with self.subTest(value=value),self.assertRaises(ValueError):m.parse_shred(value)
 def test_two_fresh_replays_must_agree_on_both_bank_and_shred(self):
  row={'bankHash':key(501),'shredVersion':123};self.assertEqual(m.combine_replays([row,row.copy()],key(500)),row)
  for rows in [[row],[row,{**row,'bankHash':key(502)}],[row,{**row,'shredVersion':124}],[{**row,'bankHash':key(500)}]*2,[{**row,'extra':1}]*2]:
   with self.subTest(rows=rows),self.assertRaises(ValueError):m.combine_replays(rows,key(500))
 def test_budget_probe_deducts_only_one_synthetic_reserve_unit(self):
  audit={'clusterType':'development','genesis':key(500),'totalLamports':'1001'};self.assertEqual(m.budget_probe(audit),1000)
  for changed in [{'clusterType':'mainnet-beta'},{'genesis':next(iter(m.c.FORBIDDEN))},{'totalLamports':1001},{'totalLamports':'01001'},{'totalLamports':'1'},{'totalLamports':str(m.TOTAL+1)}]:
   with self.subTest(changed=changed),self.assertRaises(ValueError):m.budget_probe({**audit,**changed})
 def test_retained_preparation_refuses_without_process_calls(self):
  with tempfile.TemporaryDirectory() as temp:
   base=Path(temp).resolve()/'private';(base/'preparations'/'retained-001').mkdir(mode=0o700,parents=True);base.chmod(0o700);(base/'preparations').chmod(0o700)
   with patch.object(m,'BASE',base),patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_tools',return_value=True),patch.object(m,'no_active_validator'),patch.object(m.offline_process,'run_tool') as process:
    with self.assertRaisesRegex(ValueError,'RETAINED'):m.run(base,'retained-001',True)
    process.assert_not_called()
 def test_preparation_failure_keeps_private_attempt_and_redacts_raw_error(self):
  with tempfile.TemporaryDirectory() as temp:
   base=Path(temp).resolve()/'private';binaries=Path(temp).resolve()/'tools';binaries.mkdir();pins={}
   for name in m.c.host.PINS:
    (binaries/name).write_bytes(b'x');(binaries/name).chmod(0o700);pins[name]=(hashlib.sha256(b'x').hexdigest(),1)
   with patch.object(m,'BASE',base),patch.object(m.c.host,'PINS',pins),patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_tools',return_value=True),patch.object(m,'no_active_validator'),patch.object(m.offline_process,'run_tool',side_effect=OSError('PRIVATE ERROR MUST STAY OUT')):
    before=os.umask(0o077)
    try:result=m.run(binaries,'failure-001',True)
    finally:os.umask(before)
    self.assertEqual(result['state'],'failed');self.assertFalse(result['createdKeys']);self.assertFalse(result['createdLedger']);self.assertEqual(result['generatedKeyFiles'],0);self.assertNotIn('PRIVATE ERROR',json.dumps(result));self.assertEqual(result['validatorsStarted'],0);self.assertTrue((base/'preparations/failure-001/public-result.json').is_file());self.assertTrue((base/'bundles/failure-001/keys').is_dir())
    with self.assertRaisesRegex(ValueError,'RETAINED'):m.run(binaries,'failure-001',True)
 def test_synthetic_driver_exercises_budget_two_fresh_replays_and_final_manifest_without_network(self):
  self.synthetic_driver()
 def test_changed_final_poh_refuses_before_bundle_copy_or_replays(self):
  for changed in [{'hashes_per_tick':12501},{'hashes_per_tick':True},{'hashes_per_tick':12500,'target_tick_count':1}]:
   with self.subTest(changed=changed):self.synthetic_driver(changed)
 def test_nonempty_or_executable_reserve_refuses_before_bundle_copy_or_replays(self):
  for changed in [{'dataBytes':1},{'dataBytes':-1},{'dataBytes':False},{'dataBytes':0.0},{'dataBytes':'0'},{'dataBytes':None},{'executable':True},{'executable':0},{'executable':None}]:
   with self.subTest(changed=changed):self.synthetic_driver(changed_reserve=changed)
 def test_changed_or_missing_final_policy_refuses_before_bundle_copy_or_replays(self):
  for field in ['inflation','feeRateGovernor','rent','epochSchedule']:
   for value in [{'unreviewed':1},None]:
    with self.subTest(field=field,value=value):self.synthetic_driver(changed_policy=(field,value))
  for field,value in [('inflation',{'initial':False,'terminal':0}),('feeRateGovernor',{'burnPercent':False}),('rent',{'burn_percent':False})]:
   with self.subTest(field=field,value=value):self.synthetic_driver(changed_policy=(field,value))
 def test_policy_drift_with_unchanged_burns_and_inflation_refuses(self):
  for field,value in [('inflation',{'initial':0,'terminal':0,'foundation':0.1}),('feeRateGovernor',{'burnPercent':0,'targetLamportsPerSignature':9999}),('rent',{'burn_percent':0,'lamports_per_byte_year':9999}),('epochSchedule',{'slotsPerEpoch':256,'warmup':True})]:
   with self.subTest(field=field):self.synthetic_driver(changed_policy=(field,value))
 def test_policy_projection_requires_all_auditor_objects_and_strict_json_types(self):
  policy={field:{'value':0} for field in ['inflation','feeRateGovernor','rent','epochSchedule','pohConfig']}
  baseline=m.audited_policy(policy)
  self.assertEqual(baseline,m.audited_policy(dict(reversed(list(policy.items())))))
  for field in policy:
   for value in [None,{},[],False,{'value':float('nan')}, {'value':float('inf')}]:
    with self.subTest(field=field,value=value),self.assertRaisesRegex(ValueError,'AUDITED_GENESIS_POLICY_REQUIRED'):m.audited_policy({**policy,field:value})
  self.assertNotEqual(baseline,m.audited_policy({**policy,'rent':{'value':False}}))
 def test_final_account_drift_refuses_before_bundle_or_replay(self):
  def redistribute(a):
   a['accounts'][0]['lamports']='110';a['accounts'][3]['lamports']='112'
  for mutate in [redistribute,lambda a:a['accounts'][0].update(dataBytes=1),lambda a:a['accounts'][0].update(executable=True),lambda a:a['accounts'][0].update(owner=key(800)),lambda a:a['accounts'][0].update(address=key(801)),lambda a:a.update(accountCount=True),lambda a:a['accounts'][0].update(dataBytes=False),lambda a:a['accounts'][0].update(extra='unreviewed')]:
   with self.subTest(mutate=mutate):self.synthetic_driver(changed_accounts=mutate)
 def test_allocation_projection_is_order_independent_and_preserves_input(self):
  import copy
  rows=[{'address':key(1),'owner':key(2),'lamports':'9','dataBytes':12,'executable':True},{'address':key(3),'owner':'11111111111111111111111111111111','lamports':'1','dataBytes':0,'executable':False}]
  probe={'accountCount':2,'totalLamports':'10','accounts':rows};saved=copy.deepcopy(probe)
  final=copy.deepcopy(probe);final['accounts'].reverse();final['accounts'][0]['lamports']='91';final['totalLamports']='100'
  self.assertEqual(m.audited_allocations(probe,key(3),1),m.audited_allocations(final,key(3),91));self.assertEqual(probe,saved)
 def test_malformed_probe_inventory_and_wrong_reserve_refuse(self):
  import copy
  base={'accountCount':2,'totalLamports':'10','accounts':[{'address':key(1),'owner':key(2),'lamports':'9','dataBytes':12,'executable':False},{'address':key(3),'owner':'11111111111111111111111111111111','lamports':'1','dataBytes':0,'executable':False}]}
  mutations=[lambda a:a.update(totalLamports='11'),lambda a:a.update(totalLamports=str(2**64)),lambda a:a.update(accountCount=True),lambda a:a.update(accounts=[]),lambda a:a['accounts'][0].update(address=key(3)),lambda a:a['accounts'][0].update(lamports='09'),lambda a:a['accounts'][0].update(lamports=True),lambda a:a['accounts'][0].update(dataBytes=-1),lambda a:a['accounts'][0].update(dataBytes=10485761),lambda a:a['accounts'][0].update(executable=0),lambda a:a['accounts'][1].update(lamports='2'),lambda a:a['accounts'][1].update(dataBytes=1),lambda a:a['accounts'][1].update(owner=key(4)),lambda a:a['accounts'][1].update(address=key(4))]
  for mutate in mutations:
   audit=copy.deepcopy(base);mutate(audit)
   with self.subTest(mutate=mutate),self.assertRaisesRegex(ValueError,'AUDITED_GENESIS_ALLOCATIONS_REQUIRED'):m.audited_allocations(audit,key(3),1)
 def test_final_complete_fingerprint_and_parameter_drift_refuse_before_copy_or_replay(self):
  # Row 1 is a nonreserve account; row 0 is the selected reserve.
  mutations=[lambda d:d['accounts'][1].update(accountSHA256='b'*64),lambda d:d['accounts'][1].update(dataSHA256='b'*64),lambda d:d['accounts'][1].update(rentEpoch='1'),lambda d:d.update(nonAccountParametersSHA256='b'*64),lambda d:d['stakeAccounts'][0]['authorities'].update(synthetic=False),lambda d:d['voteAccounts'][0]['authorities'].update(synthetic=False)]
  for mutate in mutations:
   with self.subTest(mutate=mutate):self.synthetic_driver(changed_decoded=mutate)
 def test_decoder_schema_metadata_authority_and_permission_controls_refuse(self):
  mutations=[lambda d:d.update(schemaVersion=True),lambda d:d.update(scope='wrong'),lambda d:d.update(creationTime='01'),lambda d:d.update(creationTime=str(2**63)),lambda d:d.update(accountCount=True),lambda d:d.update(genesis=key(900)),lambda d:d.update(totalNativeUnits='1'),lambda d:d.update(completeAccountFingerprintsComputed=False),lambda d:d.update(canBroadcast=True),lambda d:d.update(accounts=[]),lambda d:d['accounts'][0].update(extra=True),lambda d:d['accounts'][1].update(rentEpoch='00'),lambda d:d['accounts'][1].update(accountSHA256='INVALID'),lambda d:d['accounts'][1].update(lamports='1'),lambda d:d['accounts'][1].update(address=d['accounts'][0]['address']),lambda d:d.update(stakeAccounts=[]),lambda d:d['voteAccounts'][0].update(dataSHA256='b'*64),lambda d:d['stakeAccounts'][0].update(nativeUnits='1')]
  for mutate in mutations:
   for phase in ['probe','final']:
    with self.subTest(mutate=mutate,phase=phase):self.synthetic_driver(changed_decoded=mutate,decode_phase=phase)
 def test_reserve_byte_exception_requires_zero_rent_epoch_and_empty_data(self):
  for changed in [{'rentEpoch':'1'},{'dataSHA256':'b'*64},{'dataBytes':1},{'owner':key(901)},{'executable':True}]:
   with self.subTest(changed=changed):self.synthetic_driver(changed_decoded=lambda d:d['accounts'][0].update(changed))
 def test_changed_decoder_input_is_retained_but_never_replayed(self):
  self.synthetic_driver(changed_input=True)
 def test_snapshot_rejects_empty_symlink_and_overbound_input(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();p=root/'genesis.bin';p.write_bytes(b'valid');self.assertEqual(m.genesis_snapshot(p),b'valid')
   alias=root/'alias';alias.symlink_to(p)
   with self.assertRaises(ValueError):m.genesis_snapshot(alias)
   p.write_bytes(b'')
   with self.assertRaises(ValueError):m.genesis_snapshot(p)
   with p.open('wb') as out:out.truncate(16*1024**2+1)
   with self.assertRaises(ValueError):m.genesis_snapshot(p)
 def test_snapshot_rejects_same_byte_file_replacement_during_read(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp).resolve()/'genesis.bin';p.write_bytes(b'genesis');original=os.fstat;calls=0
   def replace(fd):
    nonlocal calls
    result=original(fd);calls+=1
    if calls==2:
     replacement=p.with_name('replacement');replacement.write_bytes(b'genesis');replacement.replace(p)
    return result
   with patch.object(m.os,'fstat',side_effect=replace),self.assertRaisesRegex(ValueError,'GENESIS_SNAPSHOT_CHANGED'):m.genesis_snapshot(p)
 def test_snapshot_rejects_fifo_without_waiting(self):
  import subprocess,sys
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp).resolve()/'fifo';os.mkfifo(p)
   code="import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('p',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\ntry:m.genesis_snapshot(Path(sys.argv[2]))\nexcept ValueError:print('refused')\nelse:raise AssertionError('FIFO admitted')"
   result=subprocess.run([sys.executable,'-B','-c',code,str(Path(m.__file__)),str(p)],capture_output=True,text=True,timeout=3)
   self.assertEqual(result.returncode,0);self.assertEqual(result.stdout.strip(),'refused')
 def synthetic_driver(self,changed_poh=None,changed_reserve=None,changed_policy=None,changed_accounts=None,changed_decoded=None,decode_phase="final",changed_input=False):
  import io,tarfile,bz2,subprocess
  nodes=[{'identity':key(100+i*3),'vote':key(101+i*3),'stake':key(102+i*3)} for i in range(3)]
  public={f'node-{i}-{kind}.json':node[kind] for i,node in enumerate(nodes) for kind in node};public['synthetic-reserve.json']=key(500)
  audits={};commands=[]
  def fake_tool(args,log,**kwargs):
   commands.append(args);name=Path(args[0]).name;out=''
   if name=='solana-keygen':
    if args[1]=='new':Path(args[-1]).write_text('DISPOSABLE TEST PLACEHOLDER')
    else:out=public[Path(args[-1]).name]
   elif name=='solana-genesis':
    ledger=Path(args[args.index('--ledger')+1]);ledger.mkdir(mode=0o700);(ledger/'genesis.bin').write_bytes(b'genesis')
    data=io.BytesIO()
    with tarfile.open(fileobj=data,mode='w:') as archive:
     for member,payload in [('genesis.bin',b'genesis'),('rocksdb/CURRENT',b'MANIFEST-000001')]:
      item=tarfile.TarInfo(member);item.size=len(payload);archive.addfile(item,io.BytesIO(payload))
    (ledger/'genesis.tar.bz2').write_bytes(bz2.compress(data.getvalue()))
    units=json.loads(Path(args[args.index('--primordial-accounts-file')+1]).read_text())[key(500)]['balance'];accounts=[]
    for node in nodes:
     for kind,owner in [('identity','11111111111111111111111111111111'),('vote','Vote111111111111111111111111111111111111111'),('stake','Stake11111111111111111111111111111111111111')]:accounts.append({'address':node[kind],'owner':owner,'lamports':'111','dataBytes':0,'executable':False})
    accounts.append({'address':key(500),'owner':'11111111111111111111111111111111','lamports':str(units),'dataBytes':0,'executable':False})
    audits[str(ledger)]={'genesis':key(600),'clusterType':'development','totalLamports':str(999+units),'accounts':accounts,'accountCount':10,'inflation':{'initial':0,'terminal':0},'feeRateGovernor':{'burnPercent':0},'rent':{'burn_percent':0},'pohConfig':{'hashes_per_tick':12500},'epochSchedule':{'slotsPerEpoch':128,'warmup':True}}
   elif name=='classic-genesis-audit-v2':
    audit=audits[args[1]].copy()
    if changed_poh is not None and Path(args[1]).name=='fresh-genesis':audit['pohConfig']=changed_poh
    if changed_reserve is not None and Path(args[1]).name=='fresh-genesis':
     audit['accounts']=[{**row,**changed_reserve} if row['address']==key(500) else row.copy() for row in audit['accounts']]
    if changed_policy is not None and Path(args[1]).name=='fresh-genesis':
     field,value=changed_policy
     if value is None:audit.pop(field)
     else:audit[field]=value
    if changed_accounts is not None and Path(args[1]).name=='fresh-genesis':
     audit['accounts']=[row.copy() for row in audit['accounts']];changed_accounts(audit)
    out=json.dumps(audit)
   elif name=='classic-genesis-allocation-bytes':
    self.assertEqual(args[1],'--isolated-genesis-stdin');self.assertEqual(kwargs['input_bytes'],b'genesis');self.assertEqual(args[3],hashlib.sha256(kwargs['input_bytes']).hexdigest())
    phase='final' if len(audits)==2 else 'probe';audit=list(audits.values())[-1]
    rows=[{**row,'dataSHA256':hashlib.sha256(b'').hexdigest(),'rentEpoch':'0','accountSHA256':hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest()} for row in audit['accounts']]
    decoded={'schemaVersion':1,'scope':'offline-selected-isolated-genesis-allocation-bytes-v1','creationTime':'100' if phase=='probe' else '101','nonAccountParametersSHA256':'a'*64,'completeAccountFingerprintsComputed':True,'genesisAccountBytesDecoded':True,'authorityKeysDecoded':True,'genesis':audit['genesis'],'accountCount':audit['accountCount'],'totalNativeUnits':audit['totalLamports'],'accounts':list(reversed(rows))}
    for field in ['keyCustodyVerified','lockupEnforcementVerified','reserveCustodyVerified','backingVerified','independentOperatorsVerified','consensusVerified','canSign','canBroadcast','mainnetActivated','productionReady']:decoded[field]=False
    for field,owner in [('stakeAccounts','Stake11111111111111111111111111111111111111'),('voteAccounts','Vote111111111111111111111111111111111111111')]:decoded[field]=[{'address':r['address'],'nativeUnits':r['lamports'],'dataSHA256':r['dataSHA256'],'authorities':{'synthetic':True}} for r in rows if r['owner']==owner]
    if changed_decoded is not None and phase==decode_phase:changed_decoded(decoded)
    if changed_input and phase=='final':(Path(list(audits)[-1])/'genesis.bin').write_bytes(b'changed')
    out=json.dumps(decoded)
   elif name=='agave-ledger-tool':out=json.dumps({'slot':0,'hash':key(700)}) if 'verify' in args else '123\n'
   else:raise AssertionError('Unexpected subprocess')
   return out.encode()
  with tempfile.TemporaryDirectory() as temp:
   base=Path(temp).resolve()/'private';binaries=Path(temp).resolve()/'tools';binaries.mkdir();pins={}
   for name in m.c.host.PINS:
    (binaries/name).write_bytes(b'x');(binaries/name).chmod(0o700);pins[name]=(hashlib.sha256(b'x').hexdigest(),1)
   def check_bundle(bundle,directory):return json.loads((bundle/'manifest.json').read_text()),{'accountCount':10}
   with patch.object(m,'BASE',base),patch.object(m.c.host,'PINS',pins),patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_tools',return_value=True),patch.object(m,'no_active_validator'),patch.object(m.offline_process,'run_tool',side_effect=fake_tool),patch.object(m.c,'check_bundle',side_effect=check_bundle):
    before=os.umask(0o077)
    try:result=m.run(binaries,'complete-001',True)
    finally:os.umask(before)
   genesis_calls=[command for command in commands if Path(command[0]).name=='solana-genesis']
   self.assertEqual([command[command.index('--hashes-per-tick')+1] for command in genesis_calls],['auto'] if changed_decoded is not None and decode_phase=='probe' else ['auto','12500'])
   if changed_decoded is not None or changed_input:
    self.assertEqual(result['state'],'failed');self.assertIn(result['failureCode'],['DECODED_GENESIS_ALLOCATIONS_REQUIRED','AUDITED_GENESIS_ALLOCATIONS_REQUIRED','FINAL_GENESIS_ALLOCATION_BYTES_DIFFER','GENESIS_CHANGED_DURING_DECODE'])
    retained=base/'preparations/complete-001';self.assertTrue((retained/'public-result.json').is_file());self.assertTrue((retained/('budget-probe-allocation-private.json' if decode_phase=='probe' else 'fresh-genesis-allocation-private.json')).is_file())
    self.assertFalse((base/'bundles/complete-001/genesis').exists());self.assertFalse(any(Path(command[0]).name=='agave-ledger-tool' for command in commands));return
   if changed_poh is not None or changed_reserve is not None or changed_policy is not None or changed_accounts is not None:
    expected=['EXACT_SYNTHETIC_RESERVE_REQUIRED'] if changed_reserve is not None else ['CALIBRATED_HASH_COUNT_REQUIRED','FINAL_GENESIS_POH_DIFFERS']
    if changed_policy is not None:expected=['AUDITED_GENESIS_POLICY_REQUIRED','FINAL_GENESIS_POLICY_DIFFERS']
    if changed_accounts is not None:expected=['AUDITED_GENESIS_ALLOCATIONS_REQUIRED','FINAL_GENESIS_ALLOCATIONS_DIFFER']
    self.assertEqual(result['state'],'failed');self.assertIn(result['failureCode'],expected)
    self.assertTrue((base/'preparations/complete-001/public-result.json').is_file());self.assertTrue((base/'preparations/complete-001/fresh-genesis/genesis.bin').is_file())
    self.assertFalse((base/'bundles/complete-001/genesis').exists());self.assertFalse((base/'bundles/complete-001/manifest.json').exists())
    self.assertFalse(any(Path(command[0]).name=='agave-ledger-tool' for command in commands));return
   self.assertTrue(result['decodedAllocationsMatchBudgetProbe']);self.assertTrue(result['nonAccountParametersMatchBudgetProbe']);self.assertEqual(result['budgetProbeCreationTime'],'100');self.assertEqual(result['finalCreationTime'],'101')
   self.assertEqual(result['calibratedHashesPerTick'],12500);self.assertTrue(result['finalPohMatchesBudgetProbe']);self.assertTrue(result['auditedPolicyMatchesBudgetProbe']);self.assertTrue(result['auditedAllocationsMatchBudgetProbe'])
   self.assertEqual(result['state'],'prepared');self.assertTrue(result['createdKeys']);self.assertTrue(result['createdLedger']);self.assertEqual(result['generatedKeyFiles'],10);self.assertEqual(result['completedSlotZeroReplays'],2);self.assertTrue(result['sameSlotZeroHashesOnFreshCopies']);self.assertEqual(result['validatorsStarted'],0);self.assertFalse(result['productionReady']);self.assertEqual(int(result['syntheticReserveNativeUnits'])+int(result['fixedGenesisNativeUnits']),m.TOTAL)
   manifest=json.loads((base/'bundles/complete-001/manifest.json').read_text());self.assertEqual(manifest['totalNativeUnits'],str(m.TOTAL));self.assertEqual(manifest['bankHash'],key(700));self.assertNotIn('keyFile',json.dumps(manifest));self.assertEqual(sum(Path(command[0]).name=='solana-genesis' for command in commands),2)
   replays=[command for command in commands if Path(command[0]).name=='agave-ledger-tool'];self.assertEqual(len(replays),4);self.assertEqual(len({command[command.index('--ledger')+1] for command in replays}),2)

class ArtifactRevalidation(unittest.TestCase):
 def test_current_decoder_is_required_by_artifact_admission(self):
  with patch.object(m,'check_binary') as check:
   self.assertTrue(m.check_tools(Path('/tools')))
  artifact=json.loads(Path(m.__file__).with_name('allocation-decoder-artifact.json').read_text())
  expected=(Path('/tools')/artifact['name'],artifact['sha256'],artifact['bytes'],'REVIEWED_PREPARATION_ARTIFACT_REQUIRED')
  self.assertEqual(len(check.call_args_list),3);self.assertIn(expected,[call.args for call in check.call_args_list])
  def refuse(binary,*args):
   if binary.name==artifact['name']:raise ValueError('REVIEWED_PREPARATION_ARTIFACT_REQUIRED')
  with patch.object(m,'check_binary',side_effect=refuse),self.assertRaisesRegex(ValueError,'REVIEWED_PREPARATION_ARTIFACT_REQUIRED'):m.check_tools(Path('/tools'))
 def test_exact_executable_required_and_errors_remain_path_free(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'tool';p.write_bytes(b'fixture');p.chmod(0o700);digest=hashlib.sha256(b'fixture').hexdigest()
   m.check_binary(p,digest,7,'REVIEWED_RUNTIME_ARTIFACT_CHANGED')
   for mutation in ['digest','size','permission','missing','symlink','directory']:
    with self.subTest(mutation=mutation):
     candidate=p;expected=digest;size=7
     if mutation=='digest':expected='0'*64
     elif mutation=='size':size=8
     elif mutation=='permission':p.chmod(0o600)
     elif mutation=='missing':candidate=p.with_name('missing')
     elif mutation=='symlink':candidate=p.with_name('alias');candidate.symlink_to(p)
     elif mutation=='directory':candidate=p.parent
     try:
      with self.assertRaisesRegex(ValueError,'^REVIEWED_RUNTIME_ARTIFACT_CHANGED$'):m.check_binary(candidate,expected,size,'REVIEWED_RUNTIME_ARTIFACT_CHANGED')
     finally:p.chmod(0o700)

 def test_offline_artifact_manifest_check_rejects_mutation_during_read(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'fixture';p.write_bytes(b'fixture');p.chmod(0o700)
   artifact={'name':p.name,'bytes':7,'sha256':hashlib.sha256(b'fixture').hexdigest()}
   original=os.read;changed=False
   def change(fd,size):
    nonlocal changed
    data=original(fd,size)
    if not changed:
     changed=True
     replacement=p.with_name('replacement');replacement.write_bytes(b'fixture');replacement.chmod(0o700);replacement.replace(p)
    return data
   with patch.object(Path,'read_text',return_value=json.dumps(artifact)):
    self.assertTrue(m.check_tools(p.parent))
    with patch.object(m.c.host.os,'read',side_effect=change):
     with self.assertRaisesRegex(ValueError,'^REVIEWED_PREPARATION_ARTIFACT_REQUIRED$'):m.check_tools(p.parent)

 def test_fifo_revalidation_refuses_without_waiting_for_a_writer(self):
  import subprocess,sys
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'fifo';os.mkfifo(p)
   code="""import importlib.util,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('preparation',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
try:m.check_binary(Path(sys.argv[2]),'0'*64,1,'REVIEWED_RUNTIME_ARTIFACT_CHANGED')
except ValueError as error:assert str(error)=='REVIEWED_RUNTIME_ARTIFACT_CHANGED'
else:raise AssertionError('FIFO admitted')
print('refused')
"""
   result=subprocess.run([sys.executable,'-B','-c',code,str(Path(m.__file__)),str(p)],capture_output=True,text=True,timeout=3)
   self.assertEqual(result.returncode,0);self.assertEqual(result.stdout.strip(),'refused')

 def test_runtime_changed_after_host_admission_never_invokes_tool_and_retains_failure(self):
  for mutation in ['content','permission','fifo']:
   with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as temp:
    base=Path(temp).resolve()/'private';binaries=Path(temp).resolve()/'tools';binaries.mkdir();pins={}
    for name in m.c.host.PINS:
     p=binaries/name;p.write_bytes(b'x');p.chmod(0o700);pins[name]=(hashlib.sha256(b'x').hexdigest(),1)
    selected=binaries/'solana-keygen'
    def change_after_admission():
     if mutation=='content':selected.write_bytes(b'y')
     elif mutation=='permission':selected.chmod(0o600)
     else:selected.unlink();os.mkfifo(selected)
    with patch.object(m,'BASE',base),patch.object(m.c.host,'PINS',pins),patch.object(m.c.host,'probe',return_value={}),patch.object(m.c.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_tools',return_value=True),patch.object(m,'no_active_validator',side_effect=change_after_admission),patch.object(m.offline_process,'run_tool') as process:
     before=os.umask(0o077)
     try:result=m.run(binaries,'changed-001',True)
     finally:os.umask(before)
    process.assert_not_called();self.assertEqual(result['state'],'failed');self.assertEqual(result['failureCode'],'REVIEWED_RUNTIME_ARTIFACT_CHANGED');self.assertEqual(result['generatedKeyFiles'],0);self.assertFalse(result['createdLedger']);self.assertEqual(result['validatorsStarted'],0)
    retained=base/'preparations/changed-001/public-result.json';self.assertEqual(json.loads(retained.read_text()),result)
    self.assertEqual(list(retained.parent.glob('tool-*-private.log')),[])

if __name__=='__main__':unittest.main()
