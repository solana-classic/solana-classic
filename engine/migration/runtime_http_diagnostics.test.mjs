import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { channel } from 'node:diagnostics_channel';
import { installRuntimeDiagnostics } from './runtime_http_diagnostics.mjs';

async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
function observe(t, origin, extra = {}) {
  const records = [];
  const observer = installRuntimeDiagnostics({ origin, onRecord: x => records.push(x), ...extra });
  t.after(() => observer.close());
  return { records, observer };
}
test('actual failed HTTP response stays failed and body remains available with private fields excluded', async t => {
  const origin = await serve(t, (_req, res) => {
    res.writeHead(503, { 'x-railway-request-id': 'trace_123', 'retry-after': '12',
      'set-cookie': 'private-cookie', 'x-private': 'private-header' });
    res.end('private-response-body');
  });
  const { records } = observe(t, origin);
  const response = await fetch(origin + '/api/runtime', { headers: { authorization: 'private-credential' } });
  assert.equal(response.ok, false);
  assert.equal(await response.text(), 'private-response-body');
  assert.equal(records.length, 1);
  assert.equal(records[0].statusCode, 503);
  assert.equal(records[0].traceId, 'trace_123');
  assert.equal(records[0].retryAfterSeconds, 12);
  assert.ok(records[0].durationMs >= 0);
  assert.ok(Number.isFinite(Date.parse(records[0].at)));
  assert.equal(JSON.stringify(records).includes('private'), false);
});
test('only exact origin, GET method and runtime path are observed', async t => {
  const origin = await serve(t, (_req, res) => res.end('ok'));
  const other = await serve(t, (_req, res) => res.end('ok'));
  const { records } = observe(t, origin);
  for (const [url, method] of [[origin + '/api/runtime?secret=1', 'GET'],
    [origin + '/api/runtime', 'POST'], [origin + '/api/status', 'GET'], [other + '/api/runtime', 'GET']]) {
    const response = await fetch(url, { method }); await response.text();
  }
  assert.equal(records.length, 0);
  await (await fetch(origin + '/api/runtime')).text();
  assert.equal(records.length, 1);
});
test('actual transport failure is observed without swallowing or retrying the request', async t => {
  let requests = 0;
  const origin = await serve(t, (req) => { requests++; req.socket.destroy(); });
  const { records } = observe(t, origin);
  await assert.rejects(fetch(origin + '/api/runtime'));
  assert.equal(requests, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, 'transport-error');
  assert.equal(records[0].errorCode, 'UND_ERR_SOCKET');
});
test('throwing diagnostic sink cannot change the fetch outcome', async t => {
  const origin = await serve(t, (_req, res) => { res.writeHead(502); res.end('unchanged'); });
  const { observer } = observe(t, origin, { onRecord: () => { throw Error('sink failure'); } });
  const response = await fetch(origin + '/api/runtime');
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'unchanged');
  assert.equal(observer.state().sinkErrors, 1);
});
test('capture is bounded, sanitizes allowed values and closes idempotently', async t => {
  const origin = await serve(t, (_req, res) => res.end('ok'));
  const { records, observer } = observe(t, origin, { maxRecords: 1 });
  const request = { method: 'GET', path: '/api/runtime', origin };
  const created = channel('undici:request:create');
  const headers = channel('undici:request:headers');
  created.publish({ request });
  headers.publish({ request, response: { statusCode: 429,
    headers: [Buffer.from('x-railway-request-id'), Buffer.from('bad value'),
      Buffer.from('retry-after'), Buffer.from('99999')] } });
  assert.deepEqual(Object.keys(records[0]).sort(), ['at', 'durationMs', 'outcome', 'statusCode'].sort());
  await (await fetch(origin + '/api/runtime')).text();
  assert.equal(records.length, 1);
  assert.equal(observer.state().truncated, true);
  observer.close(); observer.close();
  await (await fetch(origin + '/api/runtime')).text();
  assert.equal(observer.state().records, 1);
  assert.equal(observer.state().closed, true);
});
test('invalid parameters and malformed channel messages fail safely', t => {
  const credentialOrigin = new URL('https://example.com');
  credentialOrigin.username = 'fixture';
  for (const origin of ['http://example.com', 'https://example.com/path', 'https://example.com/',
    credentialOrigin.href, 'https://example.com?key=value']) {
    assert.throws(() => installRuntimeDiagnostics({ origin, onRecord() {} }));
  }
  for (const maxRecords of [0, -1, 10001, 1.5, true]) {
    assert.throws(() => installRuntimeDiagnostics({ origin: 'https://example.com', onRecord() {}, maxRecords }));
  }
  assert.throws(() => installRuntimeDiagnostics({ origin: 'https://example.com' }));
  const { observer } = observe(t, 'https://example.com');
  channel('undici:request:create').publish(null);
  assert.equal(observer.state().malformedEvents, 1);
});
