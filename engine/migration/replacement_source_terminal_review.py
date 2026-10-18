"""Strict offline terminal review for the separately admitted replacement source-built devnet run.

No network, keys, signing, test activation, runtime writes or release approval.
An in-progress run is refused, even after its earliest completion time.
"""
from pathlib import Path
import argparse,datetime,hashlib,importlib.util,json

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
terminal=module('terminal_review','terminal_review.py')
load_review=module('load_review','load_review.py')
ROOT=Path(__file__).resolve().parents[2]
START='2026-10-16T01:24:36.342Z'
FREEZE_SHA='55b668e56a946ec94f0195b03530aba23593bd71d7fd52493d5403b21882757f'
ACTIVATION_SHA='183084ae1c32aec9df3a23f297eb02c43c86737f289dd525810e2ffe43c4ecef'
PREREQUISITES=('load','backup-check','restart-check','pilot-agent-one','pilot-agent-two','monitoring-config','frontend-rollback','remote-negative-controls')
require=terminal.require

def review(bundle,freeze_raw,admission,proofs,now=None):
 require(hashlib.sha256(freeze_raw).hexdigest()==FREEZE_SHA,'EXACT_SOURCE_FREEZE_REQUIRED')
 freeze=json.loads(freeze_raw);expected=freeze['runtime'];candidate=freeze['candidate']
 require(hashlib.sha256(json.dumps(admission,sort_keys=True,separators=(',',':')).encode()).hexdigest()==ACTIVATION_SHA,'EXACT_SOURCE_ACTIVATION_DIGEST_REQUIRED')
 require(admission.get('passed') is True and admission.get('stabilityAccepted') is False and admission.get('startedAt')==START and admission.get('freezeSha256')==FREEZE_SHA and admission.get('genesis')==freeze['genesis'] and admission.get('candidate')==candidate and admission.get('runnerDeploymentId')=='93d2d479-4064-4c2e-af8e-bdce70312ce6' and admission.get('namespace')=='source-soak-20261016T0110Z-v1','EXACT_SOURCE_ACTIVATION_REQUIRED')
 require(terminal.milliseconds(admission['at'])>=terminal.milliseconds(START) and terminal.milliseconds(admission['expectedFinishAt'])==terminal.milliseconds(START)+terminal.DURATION,'SOURCE_ACTIVATION_TIME_DIFFERS')
 pins=admission.get('prerequisiteChecksums',{})
 require(set(pins)=={'candidate-freeze',*PREREQUISITES} and pins['candidate-freeze']==FREEZE_SHA and set(proofs)==set(PREREQUISITES),'COMPLETE_SELECTED_PREREQUISITES_REQUIRED')
 expected_times={}
 for name in PREREQUISITES:
  raw=proofs[name];require(isinstance(raw,bytes) and len(raw)<=1_048_576 and hashlib.sha256(raw).hexdigest()==pins[name],'SELECTED_PREREQUISITE_BYTES_DIFFER')
  proof=json.loads(raw)
  require(proof.get('passed') is True and proof.get('genesis')==freeze['genesis'],'SOURCE_PREREQUISITE_NOT_PASSED')
  at=terminal.milliseconds(proof['at']);require(at<terminal.milliseconds(START),'SOURCE_PREREQUISITE_AFTER_START');expected_times[name]=proof['at']
 result=bundle.get('soak',{});qa=bundle.get('qa',{});status=bundle.get('status',{});progress=bundle.get('progress',{})
 require(result.get('passed') is True and result.get('startedAt')==START and qa.get('state')=='completed' and qa.get('soakAccepted') is True,'SOURCE_RUN_NOT_COMPLETED')
 require(type(qa.get('exitCode')) is int,'SOURCE_RUNNER_EXIT_TYPE_INVALID')
 require(all(type(result.get(field)) is int for field in ['completedJourneys','smokeEveryMs','observationEveryMs','faucetCalls']),'SOURCE_WORKLOAD_SCALAR_TYPES_INVALID')
 require(qa.get('inputChecksums')==pins,'TERMINAL_RUNNER_INPUTS_DIFFER')
 observed=terminal.milliseconds(status['fetchedAt']);now_ms=round((now or datetime.datetime.now(datetime.timezone.utc)).timestamp()*1000)
 require(-10_000<=now_ms-observed<90_000,'TERMINAL_OBSERVATION_STALE_OR_FUTURE')
 require(status.get('soak',{}).get('startedAt')==START and progress.get('progress',{}).get('startedAt')==START,'SOURCE_RUN_START_DIFFERS')
 require(bundle.get('runtime',{}).get('engineBuild')==expected['engineBuild'],'SOURCE_ENGINE_MANIFEST_DIFFERS')
 prerequisites=result.get('prerequisites',[])
 require(isinstance(prerequisites,list) and len(prerequisites)==8 and all(isinstance(p,dict) and set(p)=={'name','at'} and p.get('name') in expected_times and p.get('at')==expected_times[p['name']] for p in prerequisites),'RECORDED_PREREQUISITE_TIMES_DIFFER')
 require(len({p['name'] for p in prerequisites})==8,'RECORDED_PREREQUISITE_NAMES_DIFFER')
 report=terminal.review(bundle,freeze,FREEZE_SHA,expected_start=START)
 load_review.identifier(result.get('payer'),32);load_review.identifier(result.get('fundingSignature'),64)
 require(result['fundingSignature'] not in {j['transferSignature'] for j in result['journeys']},'FUNDING_RECEIPT_REUSED')
 for journey in result['journeys']:
  require(journey['scheduleDelayMs']<=5000,'FROZEN_FIVE_SECOND_CADENCE_EXCEEDED')
  for field,size in [('mint',32),('recipient',32),('transferSignature',64)]:load_review.identifier(journey[field],size)
 recipients={journey['recipient'] for journey in result['journeys']};mints={journey['mint'] for journey in result['journeys']}
 require(len(recipients)==288 and not recipients.intersection(mints) and result['payer'] not in recipients|mints,'SOURCE_JOURNEY_KEY_ROLES_INVALID')
 # The pinned public reader intentionally exposes a bounded summary, not receipts.
 reader=progress['result'];fields={'genesis','candidate','passed','durationMs','startedAt','at','completedJourneys'}
 require(set(reader)==fields and all(reader[field]==result[field] for field in fields),'BOUNDED_TERMINAL_READER_DIFFERS')
 require(terminal.milliseconds(result['at'])<=now_ms+5_000,'TERMINAL_RESULT_FROM_FUTURE')
 report.update({'scope':'remote replacement source-built devnet terminal evidence review; recorded complete report and receipts, not independent chain replay or release acceptance','sourceBuildActive':True,'exactActivationBound':True,'prerequisiteHashesVerified':8,'base58ReceiptLengthsVerified':True,'boundedReaderSummaryMatches':True,'fullReportInventoryReviewed':True,'fundingReceiptStructureReviewed':True,'fiveSecondCadenceBoundVerified':True,'uniqueRecipients':len(recipients),'distinctJourneyKeyRolesVerified':True,'workloadScalarTypesVerified':True,'activationSHA256':hashlib.sha256(json.dumps(admission,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'limitations':['One source-built test validator and a bounded valueless browser workload.','Recorded receipts are checked for identity, structure and uniqueness; no independent replay of pruned transaction history.','This audit does not approve final browser regression, remaining release gates, mainnet, custody or a bridge.']})
 return report

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input-dir',type=Path,required=True);parser.add_argument('--frozen-context',type=Path,required=True);args=parser.parse_args()
 try:
  require(not args.input_dir.is_symlink() and not args.frozen_context.is_symlink(),'UNLINKED_INPUT_DIRECTORIES_REQUIRED')
  freeze_raw=terminal.public_file(ROOT/'evidence/agave-source-candidate-freeze.json');require(hashlib.sha256(freeze_raw).hexdigest()==FREEZE_SHA,'EXACT_SOURCE_FREEZE_REQUIRED');freeze=json.loads(freeze_raw)
  admission_raw=terminal.public_file(ROOT/'evidence/agave-source-stability-replacement-started.json');admission=json.loads(admission_raw)
  raw={name:terminal.public_file(args.input_dir/(name+'.json')) for name in terminal.FILES}
  proofs={name:terminal.public_file(args.input_dir/(name+'.json')) for name in PREREQUISITES}
  require(len(freeze['coreFiles'])==45 and all(hashlib.sha256(terminal.public_file(args.frozen_context/path)).hexdigest()==pin for path,pin in freeze['coreFiles'].items()),'FROZEN_SOURCE_CONTEXT_DIFFERS')
  report=review({name:json.loads(value) for name,value in raw.items()},freeze_raw,admission,proofs)
  report['activationFileSHA256']=hashlib.sha256(admission_raw).hexdigest();report['frozenFileCount']=45
  report['inputHashes']={name:hashlib.sha256(value).hexdigest() for name,value in raw.items()}
  report['auditorHashes']={name:hashlib.sha256(terminal.public_file(Path(__file__).with_name(name))).hexdigest() for name in ['replacement_source_terminal_review.py','terminal_review.py','load_review.py']}
 except Exception as error:
  report={'schemaVersion':1,'passed':False,'state':'not-accepted','scope':'offline source-built devnet terminal evidence admission; not a test execution or observed chain failure','failureType':type(error).__name__,'releaseAccepted':False,'mainnetAccepted':False,'bridgeAccepted':False}
  if type(error) is ValueError and str(error).replace('_','').isupper() and str(error).replace('_','').isalpha():report['failureCode']=str(error)
 print(json.dumps(report,indent=2));return 0 if report['passed'] else 78
if __name__=='__main__':raise SystemExit(main())
