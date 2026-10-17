"""Invoke caller-selected offline reserve artifacts with bounded private pipes.

Byte selection is not trusted runtime or host admission. Callers must separately
review the selected artifacts and result semantics before using compiler input.
No compiler, validator, key generation or chain operation is exposed here.
"""
import hashlib,os,re,stat
from pathlib import Path
import offline_process

CANONICAL_SERVICE='d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'
MAX_NODE_BYTES=256*1024**2
MAX_BUNDLE_BYTES=4*1024**2
INPUT_BYTES=32*1024**2
OUTPUT_BYTES=1024**2
ERROR_BYTES=64*1024


def artifact(path,digest,size,maximum,executable=False):
 """Bind an exact regular-file read to descriptor and pathname identities."""
 failure='SELECTED_RESERVE_ARTIFACT_REQUIRED'
 def identity(s):
  return (s.st_dev,s.st_ino,s.st_size,s.st_mode,s.st_uid,s.st_nlink,s.st_mtime_ns,s.st_ctime_ns)
 try:
  if type(digest) is not str or re.fullmatch('[0-9a-f]{64}',digest) is None or type(size) is not int or not 0<size<=maximum:raise ValueError()
  path=Path(path)
  if not path.is_absolute() or path.resolve(strict=True)!=path:raise ValueError()
  selected=path.lstat()
  if not stat.S_ISREG(selected.st_mode) or selected.st_size!=size or selected.st_uid not in {0,os.getuid()} or selected.st_mode&0o022 or selected.st_nlink!=1:raise ValueError()
  if executable and not os.access(path,os.X_OK):raise ValueError()
  fd=os.open(path,os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
  try:
   before=os.fstat(fd)
   if identity(before)!=identity(selected):raise ValueError()
   digest_read=hashlib.sha256();count=0
   while count<=size:
    block=os.read(fd,min(1024**2,size-count+1))
    if not block:break
    count+=len(block);digest_read.update(block)
   if count!=size or digest_read.hexdigest()!=digest or identity(os.fstat(fd))!=identity(before) or identity(path.lstat())!=identity(before) or path.resolve(strict=True)!=path:raise ValueError()
   return identity(before)
  finally:os.close(fd)
 except (OSError,ValueError,TypeError,RuntimeError):raise ValueError(failure) from None


def run_selected(node,bundle,*,node_sha256,node_bytes,bundle_sha256,bundle_bytes,mode,input_bytes,log):
 """Return raw bounded stdout only after successful execution and rechecks.

 Exact artifact hashes/sizes are required selections, not an approval allowlist.
 The caller owns the private stderr sink and must validate returned JSON and
 compare all selected plan/report identities. No preparation is activated here.
 """
 if os.environ.get('RAILWAY_SERVICE_ID')==CANONICAL_SERVICE:raise ValueError('CANONICAL_SERVICE_FORBIDDEN')
 if type(mode) is not str or mode not in ('prepare','review') or type(input_bytes) is not bytes or not 0<len(input_bytes)<=INPUT_BYTES:raise ValueError('SELECTED_RESERVE_INPUT_REQUIRED')
 node_before=artifact(node,node_sha256,node_bytes,MAX_NODE_BYTES,True)
 bundle_before=artifact(bundle,bundle_sha256,bundle_bytes,MAX_BUNDLE_BYTES)
 try:
  result=offline_process.run_tool([str(node),str(bundle),mode],log,input_bytes=input_bytes,environment={},stdin_limit=INPUT_BYTES,stdout_limit=OUTPUT_BYTES,stderr_limit=ERROR_BYTES,timeout=30)
 except (OSError,ValueError):raise ValueError('SELECTED_RESERVE_PROCESS_REFUSED') from None
 # Withhold even a successful stdout if either selected artifact changed.
 if artifact(node,node_sha256,node_bytes,MAX_NODE_BYTES,True)!=node_before or artifact(bundle,bundle_sha256,bundle_bytes,MAX_BUNDLE_BYTES)!=bundle_before:raise ValueError('SELECTED_RESERVE_ARTIFACT_CHANGED')
 if not result:raise ValueError('SELECTED_RESERVE_OUTPUT_REQUIRED')
 return result
