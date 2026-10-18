"""Read-only selected genesis review; private output, no validator or signing."""
import argparse,hashlib,json,os,re,stat
from pathlib import Path
from offline_process import run_tool
from process_admission import no_active_validator
REVIEW_BASE=Path('/data')
SYSTEM='11111111111111111111111111111111'
STAKE='Stake11111111111111111111111111111111111111'
VOTE='Vote111111111111111111111111111111111111111'
WORKER={'RAILWAY_PROJECT_ID':'356bcb0b-49c4-4bd3-bf10-bff7db8f33fe','RAILWAY_ENVIRONMENT_ID':'3367b373-2332-4702-8cce-c12b8f03949e','RAILWAY_SERVICE_ID':'29189101-226c-483b-a424-b8cd140abd80'}
def sha(data):return hashlib.sha256(data).hexdigest()
def selected_file(path,expected,limit):
 path=Path(path)
 if path.resolve()!=path or not isinstance(expected,str) or not re.fullmatch('[a-f0-9]{64}',expected):raise ValueError('EXACT_SELECTED_REGULAR_FILE_REQUIRED')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_mode&0o022 or not 0<before.st_size<=limit:raise ValueError('SELECTED_FILE_ADMISSION_FAILED')
  with os.fdopen(fd,'rb',closefd=False) as stream:data=stream.read(limit+1)
  after=os.fstat(fd)
  if len(data)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or path.resolve()!=path or sha(data)!=expected:raise ValueError('SELECTED_FILE_CHANGED')
  return data
 finally:os.close(fd)
def compare(decoded,expected):
 if decoded.get('genesisAccountBytesDecoded') is not True or decoded.get('authorityKeysDecoded') is not True:raise ValueError('DECODED_AUTHORITY_BYTES_REQUIRED')
 g=expected['genesisAudit'];rows=decoded['accounts'];fields=['address','owner','lamports','dataBytes','executable']
 if decoded['genesis']!=g['genesis'] or decoded['accountCount']!=g['accountCount'] or decoded['totalNativeUnits']!=g['totalLamports'] or len(rows)!=g['accountCount']:raise ValueError('GENESIS_METADATA_DIFFERS')
 normalized=[{k:a[k] for k in fields} for a in rows]
 if sorted(normalized,key=lambda a:a['address'])!=sorted(g['accounts'],key=lambda a:a['address']):raise ValueError('GENESIS_ACCOUNT_METADATA_DIFFERS')
 by_key={a['address']:a for a in rows}
 if len(by_key)!=len(rows):raise ValueError('DUPLICATE_DECODED_ACCOUNT')
 for field,owner in [('stakeAccounts',STAKE),('voteAccounts',VOTE)]:
  group=decoded[field]
  if len(group)!=len({a['address'] for a in group}) or {a['address'] for a in group}!={a['address'] for a in rows if a['owner']==owner}:raise ValueError('AUTHORITY_ACCOUNT_COVERAGE_DIFFERS')
  for a in group:
   row=by_key[a['address']]
   if a['nativeUnits']!=row['lamports'] or a['dataSHA256']!=row['dataSHA256']:raise ValueError('AUTHORITY_ACCOUNT_BYTES_DIFFER')
 for field in ['keyCustodyVerified','lockupEnforcementVerified','reserveCustodyVerified','backingVerified','independentOperatorsVerified','consensusVerified','canSign','canBroadcast','mainnetActivated','productionReady']:
  if decoded.get(field) is not False:raise ValueError('DECODER_PERMISSION_PROMOTION')
 stakes=decoded['stakeAccounts'];votes=decoded['voteAccounts'];vote_map={a['address']:a['authorities'] for a in votes}
 return {'accountCount':len(rows),'stakeAccounts':len(stakes),'voteAccounts':len(votes),'totalNativeUnits':g['totalLamports'],'distinctStakeWithdrawers':len({a['authorities']['withdrawer'] for a in stakes}),'distinctVoteWithdrawers':len({a['authorities']['withdrawer'] for a in votes}),'distinctWithdrawalKeysAcrossStakeAndVote':len({a['authorities']['withdrawer'] for a in stakes+votes}),'stakeStakerEqualsWithdrawerCount':sum(a['authorities']['staker']==a['authorities']['withdrawer'] for a in stakes),'stakeWithdrawerEqualsDelegatedVoteNodeCount':sum(a['authorities']['withdrawer']==vote_map.get((a['authorities']['delegation'] or {}).get('voter'),{}).get('node') for a in stakes),'voteWithdrawerEqualsNodeCount':sum(a['authorities']['withdrawer']==a['authorities']['node'] for a in votes),'voteAuthorizedVoterRecords':sum(len(a['authorities']['authorizedVoters']) for a in votes),'voteVoterEqualsNodeRecords':sum(v['voter']==a['authorities']['node'] for a in votes for v in a['authorities']['authorizedVoters']),'stakeNondefaultLockupFieldsCount':sum(a['authorities']['lockup']!={'unixTimestamp':'0','epoch':'0','custodian':SYSTEM} for a in stakes),'genesisAccountMetadataMatched':True,'authorityKeysDecoded':True,'actualCustodyVerified':False,'lockupEnforcementVerified':False,'backingVerified':False,'independentOperatorsVerified':False,'consensusVerified':False,'productionReady':False}
def review(args):
 if any(os.environ.get(k)!=v for k,v in WORKER.items()):raise ValueError('EXACT_PRIVATE_WORKER_REQUIRED')
 root=Path(args.output)
 if root.parent!=REVIEW_BASE or not re.fullmatch('genesis-authority-review-[a-z0-9-]{1,48}',root.name) or root.parent.resolve()!=root.parent:raise ValueError('FRESH_PRIVATE_REVIEW_NAMESPACE_REQUIRED')
 no_active_validator();os.umask(0o077)
 selections=[(Path(args.binary),args.binary_sha256,32*1024**2),(Path(args.genesis),args.genesis_sha256,16*1024**2),(Path(args.metadata),args.metadata_sha256,2*1024**2)]
 contents=[selected_file(*s) for s in selections];expected=json.loads(contents[2])
 root.mkdir(mode=0o700)
 with (root/'attempt-private.json').open('x') as f:json.dump({'state':'running'},f)
 try:
  command=[args.binary,'--isolated-genesis-stdin',expected['genesisAudit']['genesis'],args.genesis_sha256]
  with (root/'decoder-stderr-private.log').open('xb') as log:output=run_tool(command,log,timeout=30,stdout_limit=8*1024**2,input_bytes=contents[1])
  with (root/'decoded-private.json').open('xb') as f:f.write(output)
  summary=compare(json.loads(output),expected)
  for selection in selections:selected_file(*selection)
  no_active_validator()
  result={'state':'passed','summary':summary,'selectedInputsUnchanged':True,'privateValidatorCensusClear':True,'validatorsStarted':0,'chainRequests':0,'privateKeysRead':0,'signatures':0,'submissions':0}
  (root/'attempt-private.json').write_text(json.dumps(result));return result
 except BaseException:
  (root/'attempt-private.json').write_text(json.dumps({'state':'failed','reason':'OFFLINE_AUTHORITY_REVIEW_REFUSED'}));raise
if __name__=='__main__':
 parser=argparse.ArgumentParser()
 for option in ['binary','binary-sha256','genesis','genesis-sha256','metadata','metadata-sha256','output']:parser.add_argument('--'+option,required=True)
 try:print(json.dumps(review(parser.parse_args())))
 except (OSError,ValueError,KeyError,TypeError):raise SystemExit('OFFLINE_AUTHORITY_REVIEW_REFUSED')
