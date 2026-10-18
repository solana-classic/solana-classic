"""Read visible unified cgroup limits without exporting membership or paths."""
import math,re
from pathlib import Path,PurePosixPath
ROOT=PurePosixPath('/sys/fs/cgroup')
SCOPE='Visible unified cgroup ancestry plus physical RAM and CPU affinity; hidden host ancestors are not attested'

def unsigned(value,positive=False):
 if not isinstance(value,str) or not re.fullmatch('0|[1-9][0-9]{0,19}',value) or int(value)>(1<<64)-1 or (positive and int(value)==0):raise ValueError('CGROUP_LIMIT_INVALID')
 return int(value)

def observe(memory,cpu):
 result={'memoryBytes':memory,'cpuCount':cpu,'observed':False,'visibleAncestorCount':0,'scope':SCOPE}
 try:
  if type(memory) is not int or memory<=0 or type(cpu) not in [int,float] or not math.isfinite(cpu) or cpu<=0:raise ValueError('HOST_RESOURCE_BASELINE_INVALID')
  membership=Path('/proc/self/cgroup').read_text()
  mounts=Path('/proc/self/mountinfo').read_text()
  if len(membership)>65536 or len(mounts)>1024**2:raise ValueError('CGROUP_MAPPING_EXCEEDS_BOUND')
  lines=membership.splitlines()
  if len(lines)!=1 or not lines[0].startswith('0::'):raise ValueError('UNIFIED_CGROUP_MAPPING_REQUIRED')
  group=lines[0][3:];selected=PurePosixPath(group)
  if not group.startswith('/') or str(selected)!=group or any(p in ['.','..'] for p in group.split('/')) or '\0' in group:raise ValueError('CANONICAL_CGROUP_MEMBERSHIP_REQUIRED')
  mounted=[]
  for line in mounts.splitlines():
   before,separator,after=line.partition(' - ')
   if not separator:raise ValueError('CGROUP_MOUNT_MAPPING_INVALID')
   left=before.split();right=after.split()
   if len(left)<6 or len(right)<3:raise ValueError('CGROUP_MOUNT_MAPPING_INVALID')
   if right[0]=='cgroup2' and left[4]==str(ROOT):mounted.append(left[3])
  # A bind-mounted subtree or ambiguous mount cannot establish this mapping.
  if mounted!=['/']:raise ValueError('VISIBLE_CGROUP_ROOT_REQUIRED')
  controllers=Path(str(ROOT/'cgroup.controllers')).read_text().split()
  if not {'cpu','memory'}.issubset(controllers):raise ValueError('CPU_AND_MEMORY_CONTROLLERS_REQUIRED')
  current=ROOT.joinpath(*selected.parts[1:]);ancestors=[]
  while True:
   ancestors.append(current)
   if len(ancestors)>128:raise ValueError('CGROUP_ANCESTRY_EXCEEDS_BOUND')
   if current==ROOT:break
   current=current.parent
  for directory in ancestors:
   limits=[]
   for name in ['memory.max','cpu.max']:
    try:raw=Path(str(directory/name)).read_text().strip()
    except FileNotFoundError:raw=None
    if raw is not None and len(raw)>1024:raise ValueError('CGROUP_LIMIT_EXCEEDS_BOUND')
    limits.append(raw)
   # The true visible hierarchy root can omit both limit files. Missing
   # controller files below it, or only one missing file, remain unverified.
   if limits==[None,None] and directory==ROOT:continue
   if any(value is None for value in limits):raise ValueError('CGROUP_LIMIT_FILES_REQUIRED')
   cap,quota=limits;tokens=quota.split()
   if len(tokens)!=2:raise ValueError('CGROUP_CPU_LIMIT_INVALID')
   period=unsigned(tokens[1],positive=True)
   if cap!='max':result['memoryBytes']=min(result['memoryBytes'],unsigned(cap))
   if tokens[0]!='max':result['cpuCount']=min(result['cpuCount'],unsigned(tokens[0],positive=True)/period)
  result.update(observed=True,visibleAncestorCount=len(ancestors))
 except (OSError,ValueError,OverflowError) as error:
  result['failureCode']=str(error) if type(error) is ValueError and re.fullmatch('[A-Z_]+',str(error)) else 'CGROUP_FILES_UNAVAILABLE'
 return result
