import copy,hashlib,json,os,subprocess,sys,tempfile,unittest
import genesis_authority_review as m
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
from genesis_authority_review import compare,selected_file,review
class AuthorityReviewTests(unittest.TestCase):
 def fixture(self):
  rows=[{'address':'stake','owner':'Stake11111111111111111111111111111111111111','lamports':'11','dataBytes':200,'executable':False,'dataSHA256':'a'*64},{'address':'vote','owner':'Vote111111111111111111111111111111111111111','lamports':'13','dataBytes':3762,'executable':False,'dataSHA256':'b'*64}]
  d={'genesis':'synthetic','accountCount':2,'totalNativeUnits':'24','accounts':rows,'genesisAccountBytesDecoded':True,'authorityKeysDecoded':True,'stakeAccounts':[{'address':'stake','nativeUnits':'11','dataSHA256':'a'*64,'authorities':{'staker':'node','withdrawer':'node','lockup':{'unixTimestamp':'0','epoch':'0','custodian':'11111111111111111111111111111111'},'delegation':{'voter':'vote'}}}],'voteAccounts':[{'address':'vote','nativeUnits':'13','dataSHA256':'b'*64,'authorities':{'node':'node','withdrawer':'node','authorizedVoters':[{'epoch':'0','voter':'node'}]}}]}
  for k in ['keyCustodyVerified','lockupEnforcementVerified','reserveCustodyVerified','backingVerified','independentOperatorsVerified','consensusVerified','canSign','canBroadcast','mainnetActivated','productionReady']:d[k]=False
  e={'genesisAudit':{'genesis':'synthetic','accountCount':2,'totalLamports':'24','accounts':[{k:v for k,v in row.items() if k!='dataSHA256'} for row in rows]}}
  return d,e
 def test_complete_matching_rows_expose_shared_roles_without_custody_permission(self):
  d,e=self.fixture();before=copy.deepcopy(d);r=compare(d,e)
  self.assertEqual(r['distinctWithdrawalKeysAcrossStakeAndVote'],1);self.assertEqual(r['stakeWithdrawerEqualsDelegatedVoteNodeCount'],1);self.assertEqual(r['voteVoterEqualsNodeRecords'],1);self.assertEqual(r['stakeNondefaultLockupFieldsCount'],0);self.assertFalse(r['actualCustodyVerified']);self.assertFalse(r['productionReady']);self.assertEqual(d,before)
 def test_inventory_coverage_and_authority_byte_mismatches_refuse(self):
  for mutate in [lambda d:d.update(accountCount=3),lambda d:d['accounts'][0].update(lamports='12'),lambda d:d.update(stakeAccounts=[]),lambda d:d['stakeAccounts'].append(copy.deepcopy(d['stakeAccounts'][0])),lambda d:d['stakeAccounts'][0].update(dataSHA256='c'*64),lambda d:d['voteAccounts'][0].update(nativeUnits='14')]:
   d,e=self.fixture();mutate(d)
   with self.assertRaises(ValueError):compare(d,e)
 def test_permission_promotions_and_missing_decode_proofs_refuse(self):
  for field in ['canSign','canBroadcast','productionReady','keyCustodyVerified','reserveCustodyVerified','independentOperatorsVerified','consensusVerified']:
   d,e=self.fixture();d[field]=True
   with self.assertRaises(ValueError):compare(d,e)
  d,e=self.fixture();d['authorityKeysDecoded']=False
  with self.assertRaises(ValueError):compare(d,e)
 def test_nondefault_lockup_fields_are_observations_not_enforcement(self):
  d,e=self.fixture();d['stakeAccounts'][0]['authorities']['lockup']['epoch']='18446744073709551615';r=compare(d,e);self.assertEqual(r['stakeNondefaultLockupFieldsCount'],1);self.assertFalse(r['lockupEnforcementVerified'])
 def test_selected_files_reject_links_wrong_hash_sizes_and_writable_inputs(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t).resolve()/'genesis';p.write_bytes(b'selected');p.chmod(0o600);digest=hashlib.sha256(b'selected').hexdigest();self.assertEqual(selected_file(p,digest,10),b'selected')
   q=Path(t).resolve()/'link';q.symlink_to(p)
   for args in [(q,digest,10),(p,'0'*64,10),(p,digest,3)]:
    with self.assertRaises((ValueError,OSError)):selected_file(*args)
   p.chmod(0o622)
   with self.assertRaises(ValueError):selected_file(p,digest,10)
 def test_wrong_worker_refuses_before_namespace_or_process_access(self):
  class Args:pass
  from unittest.mock import patch
  with patch.dict(os.environ,{'RAILWAY_SERVICE_ID':'wrong'}):
   with self.assertRaisesRegex(ValueError,'EXACT_PRIVATE_WORKER_REQUIRED'):review(Args())
 def test_fifo_selection_refuses_without_waiting_for_a_writer(self):
  with tempfile.TemporaryDirectory() as t:
   fifo=Path(t).resolve()/'input';os.mkfifo(fifo)
   code="from genesis_authority_review import selected_file; import sys; selected_file(sys.argv[1], '0'*64, 16)"
   child=subprocess.run([sys.executable,'-B','-c',code,str(fifo)],cwd=Path(__file__).parent,capture_output=True,timeout=3)
   self.assertNotEqual(child.returncode,0);self.assertIn(b'SELECTED_FILE_ADMISSION_FAILED',child.stderr)
 def test_empty_input_and_non_string_selector_refuse(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t).resolve()/'input';p.write_bytes(b'')
   for digest in [hashlib.sha256(b'').hexdigest(),None,123]:
    with self.subTest(digest=digest),self.assertRaises(ValueError):selected_file(p,digest,16)
 def test_review_passes_admitted_snapshot_directly_and_rejects_later_input_change(self):
  for changed in [False,True]:
   with self.subTest(changed=changed),tempfile.TemporaryDirectory() as t:
    base=Path(t).resolve();decoded,expected=self.fixture();args=SimpleNamespace(output=str(base/'genesis-authority-review-input'))
    for name,data in [('binary',b'synthetic executable placeholder'),('genesis',b'selected genesis bytes'),('metadata',json.dumps(expected).encode())]:
     p=base/name;p.write_bytes(data);p.chmod(0o600);setattr(args,name,str(p));setattr(args,name+'_sha256',hashlib.sha256(data).hexdigest())
    def process(command,log,**options):
     self.assertEqual(command,[args.binary,'--isolated-genesis-stdin','synthetic',args.genesis_sha256])
     self.assertEqual(options['input_bytes'],b'selected genesis bytes');self.assertEqual(options['timeout'],30)
     if changed:Path(args.genesis).write_bytes(b'changed after selection')
     return json.dumps(decoded).encode()
    with patch.object(m,'REVIEW_BASE',base),patch.dict(os.environ,m.WORKER),patch.object(m,'no_active_validator'),patch.object(m,'run_tool',side_effect=process) as tool:
     before=os.umask(0o077)
     try:
      if changed:
       with self.assertRaisesRegex(ValueError,'SELECTED_FILE_CHANGED'):review(args)
      else:self.assertEqual(review(args)['state'],'passed')
     finally:os.umask(before)
     tool.assert_called_once()
     retained=json.loads((Path(args.output)/'attempt-private.json').read_text());self.assertEqual(retained['state'],'failed' if changed else 'passed')
     self.assertTrue((Path(args.output)/'decoded-private.json').is_file())
     with self.assertRaises(FileExistsError if not changed else ValueError):review(args)
     tool.assert_called_once()
if __name__=='__main__':unittest.main()
