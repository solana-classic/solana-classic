"""Read-only visible Linux process census; not atomic host exclusion.

No process arguments, executable paths or identities are exported.
"""
from pathlib import Path
import os
VALIDATORS={'agave-validator','solana-test-validator'}
COMM_NAMES=VALIDATORS|{name[:15] for name in VALIDATORS}

def no_active_validator(proc_root=Path('/proc')):
 try:
  if not proc_root.is_dir():raise ValueError('LINUX_PROCESS_CENSUS_REQUIRED')
  processes=list(proc_root.iterdir())
 except OSError:raise ValueError('LINUX_PROCESS_CENSUS_UNAVAILABLE') from None
 for proc in processes:
  if not proc.name.isascii() or not proc.name.isdigit():continue
  try:
   prefix,separator,tail=(proc/'stat').read_text().rpartition(') ');fields=tail.split()
   if not separator or not prefix.startswith(proc.name+' (') or not fields or len(fields[0])!=1 or fields[0] not in 'RSDZTtXxKWPI':raise ValueError('LINUX_PROCESS_STATE_INVALID')
   if fields[0] in 'ZXx':continue
   with (proc/'comm').open('rb') as stream:comm=stream.read(65)
   if len(comm)>64:raise ValueError('LINUX_PROCESS_NAME_INVALID')
   if os.fsdecode(comm.rstrip(b'\n')) in COMM_NAMES:raise ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')
   with (proc/'cmdline').open('rb') as stream:arguments=stream.read(8193)
   first,terminated,_=arguments.partition(b'\0')
   if first and not terminated:raise ValueError('LINUX_PROCESS_ARGUMENTS_INVALID')
   if first and Path(os.fsdecode(first)).name in VALIDATORS:raise ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')
   try:executable=os.readlink(proc/'exe')
   except FileNotFoundError:executable=''
   if executable.endswith(' (deleted)'):executable=executable[:-10]
   if executable and Path(executable).name in VALIDATORS:raise ValueError('OTHER_VALIDATOR_ALREADY_ACTIVE')
  except (FileNotFoundError,ProcessLookupError):
   if proc.exists():raise ValueError('LINUX_PROCESS_CENSUS_INCOMPLETE') from None
  except (OSError,UnicodeError):raise ValueError('LINUX_PROCESS_CENSUS_UNAVAILABLE') from None
 return None
