import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const preload = fileURLToPath(new URL('./runtime_http_preload.mjs', import.meta.url));
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-diagnostics-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.writeHead(503); res.end('unchanged'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { dir, origin: `http://127.0.0.1:${server.address().port}`, requests: () => requests };
}
function run(origin, path) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', preload, '--input-type=module', '--eval',
      "const r=await fetch(process.env.SC_RUNTIME_DIAGNOSTICS_ORIGIN+'/api/runtime');await r.text();if(!r.ok)process.exitCode=17"],
    { env: { ...process.env, SC_RUNTIME_DIAGNOSTICS_ORIGIN: origin, SC_RUNTIME_DIAGNOSTICS_FILE: path },
      stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data.toString(); });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stderr }));
  });
}
test('preloaded observer retains HTTP failure and process exit while creating a private complete log', async t => {
  const f = await fixture(t); const path = join(f.dir, 'requests.jsonl');
  const result = await run(f.origin, path);
  assert.equal(result.code, 17);
  assert.equal(f.requests(), 1);
  const rows = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows[0].statusCode, 503);
  assert.deepEqual(rows[1], { outcome: 'diagnostic-summary', records: 1, sinkErrors: 0,
    malformedEvents: 0, truncated: false, closed: true });
  assert.equal(statSync(path).mode & 0o777, 0o600);
});
test('preload refuses to replace an existing output before any workload request', async t => {
  const f = await fixture(t); const path = join(f.dir, 'existing.jsonl');
  writeFileSync(path, 'retained failure');
  const result = await run(f.origin, path);
  assert.notEqual(result.code, 0);
  assert.equal(f.requests(), 0);
  assert.equal(readFileSync(path, 'utf8'), 'retained failure');
});
test('invalid origin refuses before creating output or executing workload', async t => {
  const f = await fixture(t); const path = join(f.dir, 'invalid.jsonl');
  const result = await run('http://example.com', path);
  assert.notEqual(result.code, 0);
  assert.equal(f.requests(), 0);
  assert.throws(() => statSync(path), { code: 'ENOENT' });
});
