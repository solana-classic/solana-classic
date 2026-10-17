import { constants, openSync, closeSync, writeSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { installRuntimeDiagnostics } from './runtime_http_diagnostics.mjs';

const origin = process.env.SC_RUNTIME_DIAGNOSTICS_ORIGIN;
const path = process.env.SC_RUNTIME_DIAGNOSTICS_FILE;
if (!origin || !path || !isAbsolute(path)) throw Error('Explicit diagnostic origin and absolute private output file are required.');
const parent = lstatSync(dirname(path));
if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid?.() ||
    (parent.mode & 0o077)) throw Error('Diagnostic parent must be an owner-only regular directory.');
// Validate configuration before creating an output. The observer issues no requests.
let fd;
const observer = installRuntimeDiagnostics({ origin, onRecord: record => {
  writeSync(fd, JSON.stringify(record) + '\n');
} });
try {
  fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
} catch (error) { observer.close(); throw error; }
process.once('exit', () => {
  observer.close();
  try { writeSync(fd, JSON.stringify({ outcome: 'diagnostic-summary', ...observer.state() }) + '\n'); }
  catch { /* A missing summary cannot be treated as a complete diagnostic log. */ }
  try { closeSync(fd); } catch { /* Never change the workload exit outcome. */ }
});
