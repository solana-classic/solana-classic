# Passive runtime HTTP diagnostics

The interrupted source-built stability attempt retained 237 of 288 journey
receipts after 70,925,938 milliseconds. Its runtime check rejected an unsuccessful
HTTP response, but the frozen workload did not record the status. Subsequent
successful requests do not identify the original failure or accept that run.
See the [retained interruption](../../evidence/agave-source-stability-interruption.json).

`runtime_http_diagnostics.mjs` subscribes to Node Undici diagnostic channels.
It observes only GET `/api/runtime` on one exact configured origin. It never
wraps fetch, issues a request, consumes a body, changes a response, retries a
request or changes workload timing and acceptance rules. A throwing synchronous
sink is contained. Request credentials, arbitrary headers, URLs and response
bodies are excluded. Captured fields are timestamp, monotonic duration, HTTP
status or sanitized transport error code, optional sanitized provider trace ID
and bounded numeric Retry-After. Headers describe receipt of response headers,
not successful body consumption. Buffer-array header metadata is supported;
other header representations supply the status without optional header fields.

The optional `runtime_http_preload.mjs` writes at most 4096 request rows plus
one final diagnostic summary. Configure `SC_RUNTIME_DIAGNOSTICS_ORIGIN` and
`SC_RUNTIME_DIAGNOSTICS_FILE` explicitly, then preload it before the unchanged
workload with Node `--import`. The output parent must already be an owner-only
regular directory. The output is created exclusively with mode 0600; an old
file cannot be replaced. This module does not create directories or activate a
workload. Capture truncation, malformed events and sink errors are explicit in
the final summary. An absent summary means diagnostic completeness is unknown.
The summary cannot accept stability or prove availability.

Nine local checks include actual failed loopback HTTP requests, a socket reset
and separate Node processes. No live chain request, funding, validator start or
24-hour run is part of those tests. The preload is auxiliary QA instrumentation;
it is not part of the frozen candidate and needs a separate reviewed source hash
in any new activation. Preserve the failed namespace, report, controls and source.
A replacement requires its own admission, exclusive evidence namespace, bounded
TEST funding and an actual full 24 hours. The old terminal auditor remains bound
to the old run and cannot accept a replacement merely by changing a timestamp.

Primary API reference: [Undici diagnostics channels](https://github.com/nodejs/undici/blob/main/docs/docs/api/DiagnosticsChannel.md).

The auxiliary controller also uses `qa_state.mjs` to retain all nine selected
input checksums in terminal status. The earlier controller replaced its status
object and dropped those fields after exit. This correction preserves the
actual selection and refuses changed claimed hashes; it does not weaken the
terminal auditor or infer acceptance. Five local status-transition checks pass.
