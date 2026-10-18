import { channel } from 'node:diagnostics_channel';
import { performance } from 'node:perf_hooks';

// Observe the original request; never wrap fetch, consume a body or retry it.
export function installRuntimeDiagnostics({ origin, onRecord, maxRecords = 4096 } = {}) {
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new TypeError('An exact HTTPS origin or explicit HTTP loopback origin is required.');
  }
  if (typeof onRecord !== 'function' || !Number.isInteger(maxRecords) ||
      maxRecords < 1 || maxRecords > 10000) throw new TypeError('A bounded diagnostic sink is required.');
  const started = new WeakMap();
  const counters = { records: 0, sinkErrors: 0, malformedEvents: 0, truncated: false, closed: false };
  const matches = request => request && typeof request === 'object' &&
    request.method === 'GET' && request.path === '/api/runtime' && String(request.origin) === origin;
  const emit = record => {
    if (counters.records >= maxRecords) { counters.truncated = true; return; }
    counters.records++;
    try { onRecord(Object.freeze(record)); } catch { counters.sinkErrors++; }
  };
  const safe = fn => event => {
    if (counters.closed) return;
    try { fn(event); } catch { counters.malformedEvents++; }
  };
  const base = request => ({ at: new Date().toISOString(),
    durationMs: Math.max(0, Math.round((performance.now() - started.get(request)) * 1000) / 1000) });
  const created = safe(({ request }) => { if (matches(request)) started.set(request, performance.now()); });
  const headers = safe(({ request, response }) => {
    if (!matches(request) || !started.has(request)) return;
    if (!Number.isInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599) {
      counters.malformedEvents++; return;
    }
    const record = { ...base(request), outcome: 'response', statusCode: response.statusCode };
    // Only provider trace IDs and bounded numeric Retry-After are eligible.
    // Never retain arbitrary headers, request credentials or response bodies.
    const pairs = Array.isArray(response.headers) ? response.headers : [];
    if (pairs.length <= 256 && pairs.length % 2 === 0) {
      for (let i = 0; i < pairs.length; i += 2) {
        const name = String(pairs[i]).toLowerCase();
        const value = String(pairs[i + 1]);
        if (name === 'x-railway-request-id' && /^[A-Za-z0-9_-]{1,96}$/.test(value)) record.traceId = value;
        if (name === 'retry-after' && /^(0|[1-9][0-9]{0,4})$/.test(value) && Number(value) <= 86400) {
          record.retryAfterSeconds = Number(value);
        }
      }
    }
    emit(record);
    started.delete(request);
  });
  const failed = safe(({ request, error }) => {
    if (!matches(request) || !started.has(request)) return;
    const record = { ...base(request), outcome: 'transport-error' };
    if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,48}$/.test(error.code)) record.errorCode = error.code;
    emit(record);
    started.delete(request);
  });
  const subscriptions = [['undici:request:create', created], ['undici:request:headers', headers],
    ['undici:request:error', failed]].map(([name, fn]) => [channel(name), fn]);
  for (const [source, fn] of subscriptions) source.subscribe(fn);
  return Object.freeze({ state: () => Object.freeze({ ...counters }), close() {
    if (counters.closed) return;
    counters.closed = true;
    for (const [source, fn] of subscriptions) source.unsubscribe(fn);
  } });
}
