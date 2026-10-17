import copy,datetime,hashlib,importlib.util,json,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('source_terminal',Path(__file__).with_name('source_terminal_review.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def key(value,size):
 alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';out='';n=value
 while n:out=alphabet[n%58]+out;n//=58
 raw=value.to_bytes(size,'big');return '1'*(len(raw)-len(raw.lstrip(b'\0')))+out

def fixture():
 start=m.terminal.milliseconds(m.START);date=lambda ms:datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc).isoformat()
 runtime={field:'fixture' for field in m.terminal.IDENTITY};runtime['engineBuild']={'manifestSHA256':'1'*64}
 freeze={'candidate':{'apiOrigin':'https://fixture.example'},'genesis':'fixture','runtime':runtime};raw=json.dumps(freeze,sort_keys=True).encode();pin=hashlib.sha256(raw).hexdigest()
 proofs={name:json.dumps({'passed':True,'genesis':'fixture','at':date(start-60000)}).encode() for name in m.PREREQUISITES}
 admission={'passed':True,'stabilityAccepted':False,'startedAt':m.START,'freezeSha256':pin,'genesis':'fixture','candidate':freeze['candidate'],'runnerDeploymentId':'f5a309fe-bfe6-4958-a4f5-a2e2129da629','namespace':'source-soak-20261015T0348Z-v2','at':date(start+1000),'expectedFinishAt':date(start+m.terminal.DURATION),'prerequisiteChecksums':{'candidate-freeze':pin,**{n:hashlib.sha256(b).hexdigest() for n,b in proofs.items()}}}
 result={'genesis':'fixture','candidate':freeze['candidate'],'runtime':runtime,'passed':True,'startedAt':m.START,'at':date(start+m.terminal.DURATION+300),'durationMs':m.terminal.DURATION+300,'smokeEveryMs':300000,'observationEveryMs':30000,'observations':2880,'completedJourneys':288,'faucetCalls':0,'lastSlot':1000,'payer':key(1000,32),'fundingSignature':key(1000,64),'prerequisites':[{'name':n,'at':date(start-60000)} for n in m.PREREQUISITES],'journeys':[{'at':date(start+i*300000),'durationMs':10000,'scheduleDelayMs':0,'mint':key(i+1,32),'recipient':key(4000+i,32),'transferSignature':key(i+1,64)} for i in range(288)]}
 observed=date(start+m.terminal.DURATION+1000)
 bundle={'soak':result,'runtime':copy.deepcopy(runtime),'status':{'fetchedAt':observed,'checkpoint':{'candidate':freeze['candidate'],'freezeSha256':pin},'network':{'state':'online','identityMatches':True,'genesisMatches':True},'soak':{'accepted':True,'state':'passed','startedAt':m.START}},'qa':{'inputChecksums':copy.deepcopy(admission['prerequisiteChecksums']),'state':'completed','soakAccepted':True,'exitCode':0,'signal':None,'issues':[],'freezeSha256':pin},'progress':{'result':{k:result[k] for k in ['genesis','candidate','passed','durationMs','startedAt','at','completedJourneys']},'progress':{'startedAt':m.START},'freezeSha256':pin},'monitor':{'genesis':'fixture','target':'https://fixture.example','overdue':False,'consecutiveFailures':0,'lastProbeAt':observed,'current':{'healthy':True,'finalizedSlot':1010}}}
 return bundle,raw,admission,proofs,datetime.datetime.fromisoformat(observed)

class SourceTerminal(unittest.TestCase):
 def evaluate(self,items):
  bundle,raw,admission,proofs,now=items
  with patch.object(m,'FREEZE_SHA',hashlib.sha256(raw).hexdigest()),patch.object(m,'ACTIVATION_SHA',hashlib.sha256(json.dumps(admission,sort_keys=True,separators=(',',':')).encode()).hexdigest()):return m.review(bundle,raw,admission,proofs,now)
 def test_complete_synthetic_terminal_is_receipt_review_only(self):
  report=self.evaluate(fixture());self.assertTrue(report['passed']);self.assertEqual(report['uniqueTransferSignatures'],288);self.assertEqual(report['prerequisiteHashesVerified'],8);self.assertTrue(report['boundedReaderSummaryMatches']);self.assertEqual(report['uniqueRecipients'],288);self.assertTrue(report['distinctJourneyKeyRolesVerified']);self.assertTrue(report['workloadScalarTypesVerified'])
  for field in ['releaseAccepted','cutoverAccepted','mainnetAccepted','bridgeAccepted']:self.assertFalse(report[field])
 def test_default_pin_refuses_arbitrary_candidate_even_if_other_inputs_match(self):
  with self.assertRaisesRegex(ValueError,'EXACT_SOURCE_FREEZE'):m.review(*fixture())
 def test_elapsed_time_cannot_accept_current_progress_or_missing_terminal(self):
  for mode in ['running','no-result','failed']:
   items=fixture();b=items[0]
   if mode=='running':b['qa']['state']='starting';b['qa']['soakAccepted']=False
   elif mode=='no-result':b['soak']={}
   else:b['soak']['passed']=False
   with self.subTest(mode=mode),self.assertRaisesRegex(ValueError,'SOURCE_RUN_NOT_COMPLETED'):self.evaluate(items)
 def test_original_run_or_different_source_activation_cannot_pass(self):
  for field,value in [('startedAt',m.terminal.START),('runnerDeploymentId','different'),('namespace','old-run'),('passed',False),('stabilityAccepted',True),('freezeSha256','0'*64)]:
   items=fixture();items[2][field]=value
   with self.subTest(field=field),self.assertRaises(ValueError):self.evaluate(items)
 def test_changed_or_missing_prerequisite_bytes_refuse(self):
  for mode in ['changed','missing','extra']:
   items=fixture();proofs=items[3]
   if mode=='changed':proofs['load']+=b' '
   elif mode=='missing':proofs.pop('backup-check')
   else:proofs['other']=b'{}'
   with self.subTest(mode=mode),self.assertRaises(ValueError):self.evaluate(items)
 def test_matching_digest_does_not_bless_failed_or_late_prerequisite(self):
  for changed in [{'passed':False},{'genesis':'wrong'},{'at':m.START}]:
   items=fixture();p=json.loads(items[3]['load']);p.update(changed);raw=json.dumps(p).encode();items[3]['load']=raw;items[2]['prerequisiteChecksums']['load']=hashlib.sha256(raw).hexdigest()
   with self.subTest(changed=changed),self.assertRaises(ValueError):self.evaluate(items)
 def test_recorded_prerequisite_dates_must_match_selected_raw_reports(self):
  items=fixture();items[0]['soak']['prerequisites'][0]['at']=items[2]['at']
  with self.assertRaises(ValueError):self.evaluate(items)
 def test_freshness_requires_actual_current_observation(self):
  for delta in [90000,-10001]:
   items=list(fixture());items[4]+=datetime.timedelta(milliseconds=delta)
   with self.subTest(delta=delta),self.assertRaisesRegex(ValueError,'STALE_OR_FUTURE'):self.evaluate(items)
 def test_same_version_with_changed_engine_manifest_or_boot_is_rejected(self):
  for mode in ['manifest','boot']:
   items=fixture()
   if mode=='manifest':items[0]['runtime']['engineBuild']={'manifestSHA256':'2'*64}
   else:items[0]['runtime']['validatorBootId']='new-boot'
   with self.subTest(mode=mode),self.assertRaises(ValueError):self.evaluate(items)
 def test_start_mismatch_in_reader_or_status_is_not_hidden_by_valid_report(self):
  for where in ['progress','status']:
   items=fixture();items[0][where]['progress' if where=='progress' else 'soak']['startedAt']=m.terminal.START
   with self.subTest(where=where),self.assertRaises(ValueError):self.evaluate(items)
 def test_exact_identifier_lengths_reject_pattern_valid_short_signature(self):
  items=fixture();items[0]['soak']['journeys'][0]['transferSignature']=key(1,32)
  with self.assertRaisesRegex(ValueError,'byte length'):self.evaluate(items)
 def test_missing_duplicate_or_mistimed_journey_refuses(self):
  for mode in ['missing','duplicate','late']:
   items=fixture();journeys=items[0]['soak']['journeys']
   if mode=='missing':journeys.pop()
   elif mode=='duplicate':journeys[1]['transferSignature']=journeys[0]['transferSignature']
   else:journeys[0]['scheduleDelayMs']=300000
   with self.subTest(mode=mode),self.assertRaises(ValueError):self.evaluate(items)
 def test_bounded_reader_must_match_selected_fields_without_extras(self):
  for mode in ['duration','extra']:
   items=fixture();reader=items[0]['progress']['result']
   if mode=='duration':reader['durationMs']+=1
   else:reader['unexpected']='extra'
   with self.subTest(mode=mode),self.assertRaises(ValueError):self.evaluate(items)
 def test_terminal_runner_must_retain_selected_input_checksums(self):
  items=fixture();items[0]['qa']['inputChecksums']['load']='0'*64
  with self.assertRaisesRegex(ValueError,'RUNNER_INPUTS'):self.evaluate(items)
 def test_funding_identifier_is_distinct_and_full_length(self):
  for mode in ['payer','funding-length','duplicate']:
   items=fixture();result=items[0]['soak']
   if mode=='payer':result['payer']='bad'
   elif mode=='funding-length':result['fundingSignature']=key(1,32)
   else:result['fundingSignature']=result['journeys'][0]['transferSignature']
   with self.subTest(mode=mode),self.assertRaises(ValueError):self.evaluate(items)
 def test_frozen_five_second_schedule_is_enforced_beyond_generic_review(self):
  items=fixture();journey=items[0]['soak']['journeys'][0];journey['scheduleDelayMs']=6000
  journey['at']=datetime.datetime.fromtimestamp((m.terminal.milliseconds(m.START)+6000)/1000,datetime.timezone.utc).isoformat()
  with self.assertRaisesRegex(ValueError,'FIVE_SECOND'):self.evaluate(items)
 def test_ownership_journeys_cannot_credit_self_transfers_or_reused_recipients(self):
  for mode in ['payer-recipient','mint-recipient','reused-recipient','payer-mint','cross-role']:
   items=fixture();result=items[0]['soak'];journeys=result['journeys']
   if mode=='payer-recipient':journeys[0]['recipient']=result['payer']
   if mode=='mint-recipient':journeys[0]['recipient']=journeys[0]['mint']
   if mode=='reused-recipient':journeys[1]['recipient']=journeys[0]['recipient']
   if mode=='payer-mint':result['payer']=journeys[0]['mint']
   if mode=='cross-role':journeys[1]['recipient']=journeys[0]['mint']
   with self.subTest(mode=mode),self.assertRaisesRegex(ValueError,'JOURNEY_KEY_ROLES'):self.evaluate(items)

 def test_workload_scalars_cannot_be_float_or_boolean_aliases(self):
  for field,value in [('completedJourneys',288.0),('smokeEveryMs',300000.0),('observationEveryMs',30000.0),('faucetCalls',False)]:
   items=fixture();items[0]['soak'][field]=value
   if field=='completedJourneys':items[0]['progress']['result'][field]=value
   with self.subTest(field=field),self.assertRaisesRegex(ValueError,'WORKLOAD_SCALAR_TYPES'):self.evaluate(items)

 def test_runner_exit_code_requires_an_integer_zero(self):
  for value in [False,0.0]:
   items=fixture();items[0]['qa']['exitCode']=value
   with self.subTest(value=value),self.assertRaisesRegex(ValueError,'RUNNER_EXIT_TYPE'):self.evaluate(items)

 def test_cli_pins_freeze_before_reading_any_supplied_context_or_proof(self):
  import argparse,contextlib,io
  args=argparse.Namespace(input_dir=Path('/not-read-inputs'),frozen_context=Path('/not-read-context'))
  output=io.StringIO()
  with patch.object(m.argparse.ArgumentParser,'parse_args',return_value=args),patch.object(m.terminal,'public_file',return_value=b'{"coreFiles":{"unexpected":"digest"}}') as read,contextlib.redirect_stdout(output):result=m.main()
  self.assertEqual(result,78);self.assertEqual(json.loads(output.getvalue())['failureCode'],'EXACT_SOURCE_FREEZE_REQUIRED');self.assertEqual(read.call_count,1)
 def test_trusted_freeze_cannot_authorize_replacement_activation_or_input_pins(self):
  bundle,raw,admission,proofs,now=fixture()
  with patch.object(m,'FREEZE_SHA',hashlib.sha256(raw).hexdigest()),self.assertRaisesRegex(ValueError,'ACTIVATION_DIGEST'):m.review(bundle,raw,admission,proofs,now)
if __name__=='__main__':unittest.main()
