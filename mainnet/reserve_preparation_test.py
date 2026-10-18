"""Disposable orchestration fixtures; no real compiler, decoder or adapter."""
import bz2, copy, hashlib, io, json, os, sys, tarfile, tempfile, unittest
from contextlib import redirect_stdout, redirect_stderr
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
import reserve_preparation as m
from prepare_consensus_test import key

SYSTEM = '11111111111111111111111111111111'
sha = lambda data: hashlib.sha256(data).hexdigest()

class ReservePreparation(unittest.TestCase):
    def test_host_and_canonical_guards_precede_private_input_and_execution(self):
        with patch.dict(os.environ, {'RAILWAY_SERVICE_ID': m.p.CANONICAL_SERVICE}), patch.object(m.p.c.host, 'probe') as probe, patch.object(m, 'selection_file') as selected:
            with self.assertRaisesRegex(ValueError, 'CANONICAL_SERVICE'): m.run(Path('/tools'), 'selected-001', Path('/absent'), 'a'*64, True)
            probe.assert_not_called(); selected.assert_not_called()
        with patch.object(m.p.c.host, 'probe', return_value={}), patch.object(m.p.c.host, 'assess', return_value={'canPrepareFreshPrivateRehearsal': False}), patch.object(m, 'selection_file') as selected, patch.object(m.p, 'check_tools') as tools:
            result = m.run(Path('/tools'), 'selected-001', Path('/absent'), 'a'*64, True)
            self.assertEqual(result['state'], 'blocked'); selected.assert_not_called(); tools.assert_not_called()

    def test_cli_routes_selected_mode_and_preserves_default(self):
        base=['prepare-consensus.py','--binary-directory','/tools','--bundle-id','selected-001']
        with patch.object(sys,'argv',base), patch.object(m.p,'run',return_value={'state':'preparation-host-admitted'}) as ordinary, patch.object(m,'run') as reserve, redirect_stdout(io.StringIO()):
            self.assertEqual(m.p.main(),0);ordinary.assert_called_once_with(Path('/tools'),'selected-001',False);reserve.assert_not_called()
        with patch.object(sys,'argv',base+['--reserve-selection','/private-input','--reserve-selection-sha256','a'*64,'--prepare','--ack','fresh-private-synthetic-genesis']), patch.object(m,'run',return_value={'state':'prepared'}) as reserve, patch.object(m.p,'run') as ordinary, redirect_stdout(io.StringIO()):
            self.assertEqual(m.p.main(),0);reserve.assert_called_once_with(Path('/tools'),'selected-001',Path('/private-input'),'a'*64,True);ordinary.assert_not_called()

    def test_cli_requires_both_selectors_and_explicit_preparation_ack(self):
        base=['prepare-consensus.py','--binary-directory','/tools','--bundle-id','selected-001']
        for flags in [['--reserve-selection','/input'],['--reserve-selection-sha256','a'*64],['--reserve-selection','/input','--reserve-selection-sha256','a'*64,'--prepare']]:
            with patch.object(sys,'argv',base+flags), patch.object(m,'run') as reserve, redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):m.p.main()
            reserve.assert_not_called()

    def test_complete_selected_flow_and_read_only_admission(self): self.exercise()
    def test_adapter_prepare_refusal_never_reaches_compiler(self): self.exercise('prepare-refusal')
    def test_adapter_review_refusal_never_reaches_replay(self): self.exercise('review-refusal')
    def test_different_actual_baseline_audit_refuses_before_adapter(self): self.exercise('baseline-audit')
    def test_canonical_or_reused_proposed_genesis_refuses(self):
        for value in [key(600), *m.p.c.FORBIDDEN]: self.exercise('proposed-genesis', value)
    def test_changed_policy_refuses_before_review(self): self.exercise('policy')
    def test_complete_account_fingerprint_drift_refuses_before_review(self): self.exercise('fingerprint')
    def test_changed_decoder_input_refuses_before_review(self): self.exercise('decoder-input')
    def test_disagreeing_replays_do_not_publish_manifest(self): self.exercise('replay')
    def test_baseline_mutation_withholds_success(self): self.exercise('baseline-change')
    def test_interrupt_retains_failed_attempt_and_restores_umask(self): self.exercise('interrupt')

    def test_selection_rejects_duplicate_fields_changed_hash_permissions_alias_and_overflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve(); file = root/'selection'; file.write_bytes(b'{"schemaVersion":1,"schemaVersion":1}'); file.chmod(0o600)
            with self.assertRaisesRegex(ValueError, 'DUPLICATE'): m.selection_file(file, sha(file.read_bytes()))
            with self.assertRaisesRegex(ValueError, 'BYTES_DIFFER'): m.selection_file(file, 'a'*64)
            file.chmod(0o644)
            with self.assertRaisesRegex(ValueError, 'OWNER_ONLY'): m.selection_file(file, sha(file.read_bytes()))
            file.chmod(0o600); alias = root/'alias'; alias.symlink_to(file)
            with self.assertRaises(ValueError): m.selection_file(alias, sha(file.read_bytes()))
            os.link(file, root/'link')
            with self.assertRaisesRegex(ValueError, 'OWNER_ONLY'): m.selection_file(file, sha(file.read_bytes()))

    def exercise(self, failure=None, value=None):
        commands=[]; adapter_modes=[]; decoded_reports={}
        nodes=[{'identity':key(100+i*3), 'vote':key(101+i*3), 'stake':key(102+i*3)} for i in range(3)]
        rows=[]
        for node in nodes:
            for kind,owner in [('identity',SYSTEM),('vote','Vote111111111111111111111111111111111111111'),('stake','Stake11111111111111111111111111111111111111')]:
                rows.append({'address':node[kind],'owner':owner,'lamports':'111','dataBytes':0,'executable':False})
        reserve_units=m.p.TOTAL-999
        rows.append({'address':key(500),'owner':SYSTEM,'lamports':str(reserve_units),'dataBytes':0,'executable':False})
        audit={'genesis':key(600),'clusterType':'development','totalLamports':str(m.p.TOTAL),'accounts':rows,'accountCount':10,'inflation':{'initial':0,'terminal':0},'feeRateGovernor':{'burnPercent':0},'rent':{'burn_percent':0},'pohConfig':{'hashes_per_tick':12500},'epochSchedule':{'slotsPerEpoch':128,'warmup':True}}
        proposed=copy.deepcopy(audit); proposed['genesis']=key(601); proposed['accounts'][-1]['address']=key(501)
        if failure=='proposed-genesis': proposed['genesis']=value
        if failure=='policy': proposed['rent']['burn_percent']=1
        def archive(data):
            raw=io.BytesIO()
            with tarfile.open(fileobj=raw,mode='w:') as out:
                for name,body in [('genesis.bin',data),('rocksdb/CURRENT',b'MANIFEST-000001')]:
                    member=tarfile.TarInfo(name);member.size=len(body);out.addfile(member,io.BytesIO(body))
            return bz2.compress(raw.getvalue())
        def decoded(a):
            items=[]
            for row in a['accounts']:
                canonical={k:v for k,v in row.items() if k!='address'}
                items.append({**row,'dataSHA256':sha(b''),'rentEpoch':'0','accountSHA256':sha(m.encoded(canonical))})
            d={'schemaVersion':1,'scope':'offline-selected-isolated-genesis-allocation-bytes-v1','creationTime':'100' if a is audit else '101','nonAccountParametersSHA256':'b'*64,'completeAccountFingerprintsComputed':True,'genesisAccountBytesDecoded':True,'authorityKeysDecoded':True,'genesis':a['genesis'],'accountCount':10,'totalNativeUnits':a['totalLamports'],'accounts':items}
            for flag in ['keyCustodyVerified','lockupEnforcementVerified','reserveCustodyVerified','backingVerified','independentOperatorsVerified','consensusVerified','canSign','canBroadcast','mainnetActivated','productionReady']:d[flag]=False
            for field,owner in [('stakeAccounts','Stake11111111111111111111111111111111111111'),('voteAccounts','Vote111111111111111111111111111111111111111')]:d[field]=[{'address':r['address'],'nativeUnits':r['lamports'],'dataSHA256':r['dataSHA256'],'authorities':{'synthetic':True}} for r in items if r['owner']==owner]
            return d
        with tempfile.TemporaryDirectory() as temp, ExitStack() as stack:
            base=Path(temp).resolve()/'private'; baseline=base/'bundles'/'baseline-001'
            for folder in [base,base/'bundles',base/'preparations',baseline,baseline/'keys',baseline/'genesis']:
                folder.mkdir(mode=0o700)
            for i in range(3):
                file=baseline/'keys'/('node-'+str(i)+'-identity.json');file.write_bytes(b'DISPOSABLE KEY PLACEHOLDER');file.chmod(0o600)
            (baseline/'genesis/genesis.bin').write_bytes(b'baseline');(baseline/'genesis/genesis.tar.bz2').write_bytes(archive(b'baseline'))
            manifest={'schemaVersion':1,'scope':'fresh-private-consensus-rehearsal','runtimeSource':m.p.c.SOURCE,'genesis':audit['genesis'],'bankHash':key(700),'shredVersion':123,'genesisBinSHA256':sha(b'baseline'),'genesisArchiveSHA256':sha(archive(b'baseline')),'inventorySHA256':m.p.c.inventory_hash(rows),'totalNativeUnits':str(m.p.TOTAL),'validators':nodes}
            mf=baseline/'manifest.json';mf.write_bytes(m.encoded(manifest));mf.chmod(0o600)
            selection={'schemaVersion':1,'scope':'isolated-reserve-preparation-v1','baselineBundleId':'baseline-001','baselineManifestSHA256':sha(mf.read_bytes()),'planningInput':{'genesisAudit':audit,'expectedGenesis':audit['genesis'],'reserveAddress':key(500)},'prepareSelection':{'planSHA256':'a'*64,'baselineGenesis':audit['genesis'],'totalNativeUnits':str(m.p.TOTAL),'baselineAccountCount':10,'reserveAddress':key(501),'reserveNativeUnits':str(reserve_units)},'node':'/selected/node','bundle':'/selected/bundle'}
            if failure=='baseline-audit':selection['planningInput']['genesisAudit']=dict(audit, extra=True)
            file=base/'selection.json';file.write_bytes(m.encoded(selection));file.chmod(0o600);digest=sha(file.read_bytes())
            baseline_saved={str(f.relative_to(baseline)):f.read_bytes() for f in baseline.rglob('*') if f.is_file()}
            def fake_tool(args,log,**kw):
                commands.append(args); name=Path(args[0]).name
                if name=='classic-genesis-audit-v2':return m.encoded(audit if Path(args[1])==baseline/'genesis' else proposed)
                if name=='classic-genesis-allocation-bytes':
                    selected=audit if kw['input_bytes']==b'baseline' else proposed
                    self.assertEqual(args[3],sha(kw['input_bytes']));d=decoded(selected);decoded_reports[selected['genesis']]=d
                    if failure=='fingerprint' and selected is proposed:d['accounts'][0]['accountSHA256']='c'*64
                    if failure=='decoder-input' and selected is proposed:(base/'preparations/selected-001/fresh-reserve-genesis/genesis.bin').write_bytes(b'changed')
                    return m.encoded(d)
                if name=='solana-genesis':
                    self.assertEqual(args[args.index('--hashes-per-tick')+1],'12500');self.assertEqual(args.count('--bootstrap-validator'),3)
                    primordial=json.loads(Path(args[args.index('--primordial-accounts-file')+1]).read_text())
                    self.assertEqual(primordial,{key(501):{'balance':reserve_units,'owner':SYSTEM,'data':'~','executable':False}})
                    folder=Path(args[args.index('--ledger')+1]);folder.mkdir(mode=0o700)
                    (folder/'genesis.bin').write_bytes(b'proposed');(folder/'genesis.tar.bz2').write_bytes(archive(b'proposed'));return b''
                if name=='agave-ledger-tool':
                    if 'verify' in args:
                        bank=key(702) if failure=='replay' and 'slot-zero-replay-1' in str(args) else key(701)
                        return m.encoded({'slot':0,'hash':bank})
                    return b'123\n'
                raise AssertionError('Unexpected tool '+name)
            def fake_adapter(node,bundle,**kw):
                mode=kw['mode'];adapter_modes.append(mode)
                self.assertEqual(kw['input_sha256'],sha(kw['input_bytes']))
                data=json.loads(kw['input_bytes']);self.assertEqual(data['expectedPlanSHA256'],'a'*64)
                self.assertEqual(data['expectedBaselineDecodedSHA256'],sha(data['rawBaselineDecoded'].encode()))
                if failure==mode+'-refusal':raise ValueError('SELECTED_RESERVE_RESULT_REFUSED')
                if failure=='interrupt':raise KeyboardInterrupt()
                selected=kw['selection'];v=m.adapter.reserve_adapter_result
                result={**selected,**dict.fromkeys(v.FLAGS,False),**dict.fromkeys(v.TRUE_FIELDS[mode],True),'schemaVersion':1,'state':v.STATES[mode],'scope':v.SCOPES[mode],'unchangedAccountCount':9}
                if mode=='prepare':result['primordialReserveJSON']=json.dumps({key(501):{'balance':reserve_units,'owner':SYSTEM,'data':'~','executable':False}})
                else:
                    self.assertEqual(data['expectedProposedDecodedSHA256'],sha(data['rawProposedDecoded'].encode()))
                    self.assertEqual(selected['proposedGenesis'],proposed['genesis']);self.assertTrue(selected['creationTimeChanged'])
                    if failure=='baseline-change':mf.write_bytes(mf.read_bytes()+b' ')
                return v.validate_result(m.encoded(result), mode=mode, selection=selected)
            def check_bundle(folder,binaries):
                value=json.loads((folder/'manifest.json').read_bytes())
                m.p.c.validate_audit(value,audit if folder==baseline else proposed)
                return value,{'accountCount':10}
            for obj,name,kwargs in [(m.p,'BASE',{'new':base}),(m.p.c.host,'probe',{'return_value':{}}),(m.p.c.host,'assess',{'return_value':{'canPrepareFreshPrivateRehearsal':True}}),(m.p,'check_tools',{'return_value':True}),(m.p,'check_binary',{'return_value':None}),(m.p,'no_active_validator',{'return_value':None}),(m.p.c,'check_bundle',{'side_effect':check_bundle}),(m.p.offline_process,'run_tool',{'side_effect':fake_tool}),(m.adapter,'artifact',{'return_value':()}),(m.adapter,'run_validated',{'side_effect':fake_adapter})]:stack.enter_context(patch.object(obj,name,**kwargs))
            for mutation in ['digest','manifest','genesis','artifact-path']:
                changed=copy.deepcopy(selection)
                if mutation=='manifest':changed['baselineManifestSHA256']='d'*64
                if mutation=='genesis':changed['prepareSelection']['baselineGenesis']=next(iter(m.p.c.FORBIDDEN))
                if mutation=='artifact-path':changed['node']='relative/node'
                candidate=base/('bad-'+mutation+'.json');candidate.write_bytes(m.encoded(changed));candidate.chmod(0o600)
                with self.assertRaises(ValueError):m.run(Path('/tools'),'selected-001',candidate,'e'*64 if mutation=='digest' else sha(candidate.read_bytes()),True)
                self.assertEqual(commands,[]);self.assertEqual(adapter_modes,[]);self.assertFalse((base/'preparations/selected-001').exists())
            admitted=m.run(Path('/tools'),'selected-001',file,digest)
            self.assertEqual(admitted['state'],'preparation-host-admitted');self.assertEqual(commands,[]);self.assertEqual(adapter_modes,[]);self.assertFalse((base/'preparations/selected-001').exists())
            before=os.umask(0o027);os.umask(before)
            result=m.run(Path('/tools'),'selected-001',file,digest,True)
            current=os.umask(before);self.assertEqual(current,before)
            self.assertEqual(result['state'],'failed' if failure else 'prepared',result)
            self.assertFalse(result['createdKeys']);self.assertEqual(result['validatorsStarted'],0);self.assertFalse(result['productionReady']);self.assertFalse(result['mainnetActivated'])
            if not failure:
                self.assertEqual(adapter_modes,['prepare','review']);self.assertEqual(result['completedSlotZeroReplays'],2)
                self.assertEqual({str(f.relative_to(baseline)):f.read_bytes() for f in baseline.rglob('*') if f.is_file()},baseline_saved)
                self.assertEqual(len(list((base/'bundles/selected-001/keys').iterdir())),3)
            if failure in ['prepare-refusal','baseline-audit','interrupt']:self.assertFalse(any(Path(x[0]).name=='solana-genesis' for x in commands))
            if failure not in [None,'replay','baseline-change']:self.assertFalse(any(Path(x[0]).name=='agave-ledger-tool' for x in commands));self.assertFalse((base/'bundles/selected-001/manifest.json').exists())
            if failure=='baseline-change':self.assertFalse((base/'bundles/selected-001/manifest.json').exists())
            retained=(base/'preparations/selected-001/public-result.json').read_bytes()
            if failure!='baseline-change':
                with self.assertRaisesRegex(ValueError,'RETAINED'):m.run(Path('/tools'),'selected-001',file,digest,True)
            self.assertEqual((base/'preparations/selected-001/public-result.json').read_bytes(),retained)
