"""Synthetic kernel-file fixtures; no real limits, credentials or hosts changed."""
import importlib.util,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('host_cgroup_subject',Path(__file__).with_name('host-preflight.py'));host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
GIB=1024**3

def files():
 return {'/proc/self/cgroup':'0::/tenant/workload\n','/proc/self/mountinfo':'9 8 0:20 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n','/sys/fs/cgroup/cgroup.controllers':'cpu memory io\n','/sys/fs/cgroup/memory.max':'max\n','/sys/fs/cgroup/cpu.max':'max 100000\n','/sys/fs/cgroup/tenant/memory.max':str(12*GIB),'/sys/fs/cgroup/tenant/cpu.max':'300000 100000','/sys/fs/cgroup/tenant/workload/memory.max':str(8*GIB),'/sys/fs/cgroup/tenant/workload/cpu.max':'200000 100000'}

def probe(f):
 def read(path,*args,**kwargs):
  if str(path) not in f:raise FileNotFoundError()
  return f[str(path)]
 with patch.object(host.Path,'read_text',new=read),patch.object(host.Path,'is_file',new=lambda path:str(path) in f),patch.object(host.Path,'is_dir',return_value=True),patch.object(host,'PINS',{}),patch.object(host.resource,'getrlimit',return_value=(1000000,1000000)),patch.object(host.os,'sysconf',side_effect=lambda name:128*GIB//4096 if name=='SC_PHYS_PAGES' else 4096),patch.object(host.os,'sched_getaffinity',create=True,return_value=set(range(8))),patch.object(host.platform,'system',return_value='Linux'),patch.object(host.platform,'machine',return_value='x86_64'),patch.object(host.shutil,'disk_usage',return_value=SimpleNamespace(free=32*GIB)):
  return host.probe(Path('/reviewed-tools'),Path('/private-storage'))

class EffectiveCgroupLimits(unittest.TestCase):
 def test_process_membership_limits_are_not_replaced_with_unlimited_mount_root(self):
  r=probe(files());self.assertTrue(r['containerLimitsObserved']);self.assertEqual(r['effectiveMemoryBytes'],8*GIB);self.assertEqual(r['effectiveCpuCount'],2)
 def test_tighter_parent_limits_still_apply_when_the_child_is_unlimited(self):
  f=files();f['/sys/fs/cgroup/tenant/workload/memory.max']='max';f['/sys/fs/cgroup/tenant/workload/cpu.max']='max 100000'
  r=probe(f);self.assertTrue(r['containerLimitsObserved']);self.assertEqual(r['effectiveMemoryBytes'],12*GIB);self.assertEqual(r['effectiveCpuCount'],3)
 def test_hierarchy_root_can_be_unlimited_without_nonroot_limit_files(self):
  f=files();f['/proc/self/cgroup']='0::/\n';del f['/sys/fs/cgroup/memory.max'];del f['/sys/fs/cgroup/cpu.max']
  r=probe(f);self.assertTrue(r['containerLimitsObserved']);self.assertEqual(r['effectiveMemoryBytes'],128*GIB);self.assertEqual(r['effectiveCpuCount'],8);self.assertEqual(r['cgroupVisibleAncestorCount'],1)
 def test_child_or_partial_root_files_missing_refuse_resource_admission(self):
  for missing in ['/sys/fs/cgroup/tenant/workload/memory.max','/sys/fs/cgroup/tenant/cpu.max','/sys/fs/cgroup/memory.max']:
   f=files();del f[missing]
   with self.subTest(missing=missing):
    r=probe(f);self.assertFalse(r['containerLimitsObserved']);self.assertIn('EFFECTIVE_CONTAINER_LIMITS_UNKNOWN',host.assess(r)['blockingReasons'])
 def test_legacy_ambiguous_and_escaping_memberships_cannot_fall_back_to_host_totals(self):
  for membership in ['','2:memory:/tenant/workload\n','0::/tenant/workload\n2:cpu:/tenant/workload\n','0::/tenant/workload\n0::/other\n','0::relative\n','0::/tenant/../workload\n','0::/tenant//workload\n','0::/tenant/./workload\n']:
   f=files();f['/proc/self/cgroup']=membership
   with self.subTest(membership=membership):self.assertFalse(probe(f)['containerLimitsObserved'])
 def test_unmapped_bind_mounts_or_duplicate_mounts_refuse(self):
  for mount in ['9 8 0:20 /tenant /sys/fs/cgroup rw - cgroup2 cgroup rw\n','9 8 0:20 / /other-cgroup rw - cgroup2 cgroup rw\n',files()['/proc/self/mountinfo']*2,'invalid mount record\n']:
   f=files();f['/proc/self/mountinfo']=mount
   with self.subTest(mount=mount):self.assertFalse(probe(f)['containerLimitsObserved'])
 def test_controller_and_numeric_limits_are_explicit_and_canonical(self):
  cases=[('/sys/fs/cgroup/cgroup.controllers','memory io'),('/sys/fs/cgroup/tenant/workload/memory.max','-1'),('/sys/fs/cgroup/tenant/workload/memory.max','01'),('/sys/fs/cgroup/tenant/workload/memory.max','1e9'),('/sys/fs/cgroup/tenant/workload/memory.max','18446744073709551616'),('/sys/fs/cgroup/tenant/cpu.max','0 100000'),('/sys/fs/cgroup/tenant/cpu.max','max 0'),('/sys/fs/cgroup/tenant/cpu.max','300000'),('/sys/fs/cgroup/tenant/cpu.max','-1 100000'),('/sys/fs/cgroup/tenant/cpu.max','300000 100000 extra')]
  for path,value in cases:
   f=files();f[path]=value
   with self.subTest(path=path,value=value):self.assertFalse(probe(f)['containerLimitsObserved'])
 def test_memory_cpu_affinity_and_parent_quotas_all_constrain_effective_resources(self):
  f=files()
  for directory in ['/sys/fs/cgroup','/sys/fs/cgroup/tenant','/sys/fs/cgroup/tenant/workload']:
   f[directory+'/memory.max']=str(256*GIB);f[directory+'/cpu.max']='1600000 100000'
  r=probe(f);self.assertTrue(r['containerLimitsObserved']);self.assertEqual(r['effectiveMemoryBytes'],128*GIB);self.assertEqual(r['effectiveCpuCount'],8)
  f['/sys/fs/cgroup/tenant/memory.max']=str(16*GIB);f['/sys/fs/cgroup/tenant/cpu.max']='400000 100000'
  r=probe(f);r['binaries']={name:{'matchesReviewedArtifact':True,'executable':True} for name in host.PINS};self.assertTrue(host.assess(r)['canPrepareFreshPrivateRehearsal'])
  f['/sys/fs/cgroup/tenant/cpu.max']='350000 100000';r=probe(f);self.assertEqual(r['effectiveCpuCount'],3.5);self.assertIn('REHEARSAL_CPU_BELOW_4',host.assess(r)['blockingReasons'])
  f['/sys/fs/cgroup/tenant/workload/memory.max']='0';r=probe(f);self.assertTrue(r['containerLimitsObserved']);self.assertEqual(r['effectiveMemoryBytes'],0);self.assertIn('REHEARSAL_MEMORY_BELOW_16_GIB',host.assess(r)['blockingReasons'])
 def test_private_membership_and_raw_file_errors_never_enter_report(self):
  import json
  f=files();del f['/sys/fs/cgroup/tenant/workload/cpu.max'];r=probe(f);text=json.dumps(r)
  self.assertFalse(r['containerLimitsObserved'])
  for private in ['/tenant','/proc/','/sys/','private-storage','reviewed-tools']:self.assertNotIn(private,text)
  self.assertIn('hidden host ancestors are not attested',text)
 def test_mapping_ancestry_and_file_bounds_refuse_before_unbounded_walk(self):
  cases=[('/proc/self/cgroup','0::/'+'group/'*130+'leaf\n'),('/proc/self/cgroup','x'*65537),('/proc/self/mountinfo','x'*(1024**2+1)),('/sys/fs/cgroup/tenant/workload/memory.max','1'*1025)]
  for path,value in cases:
   f=files();f[path]=value
   with self.subTest(path=path):self.assertFalse(probe(f)['containerLimitsObserved'])

 def test_standalone_admission_creates_no_bytecode_or_other_files(self):
  import tempfile,subprocess,sys,os,json
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   for name in ['host-preflight.py','cgroup_limits.py']:(root/name).write_bytes(Path(__file__).with_name(name).read_bytes())
   before={str(p.relative_to(root)) for p in root.rglob('*')};env=dict(os.environ);env.pop('PYTHONDONTWRITEBYTECODE',None)
   result=subprocess.run([sys.executable,str(root/'host-preflight.py'),'--binary-directory',str(root/'missing-tools'),'--storage-root',str(root)],capture_output=True,text=True,env=env,timeout=20)
   self.assertEqual(result.returncode,78);report=json.loads(result.stdout);self.assertFalse(report['createdKeys']);self.assertFalse(report['createdLedger']);self.assertFalse(report['changedLimits'])
   self.assertEqual({str(p.relative_to(root)) for p in root.rglob('*')},before)
if __name__=='__main__':unittest.main()
