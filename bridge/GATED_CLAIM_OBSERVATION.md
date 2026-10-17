# Read-only gated-claim destination observation

The new modules check the destination preconditions for one selected
native-bootstrap-trailer-v3 claim. They do not enable submission, change the
immutable retention format or modify legacy journals, builders or programmes.

## Supplied account review

`reviewGatedClaimDestinationAccounts` requires an externally selected full
message-review digest, exact claim intent, positive minimum context slot,
BigInt fee and bounded raw account RPC JSON. It derives nine addresses: config,
vault, bootstrap record, consumed bootstrap receipt, new incoming receipt, Rent,
Clock, fee payer and recipient. Known public and canonical soaking chains are
refused through existing message/pin validation.

It preserves u64 balance digits before Number conversion, verifies exact owners,
layouts and canonical data, and matches all382 configuration and120 selected
bootstrap bytes. The consumed bootstrap receipt must match its source event;
the incoming receipt must be absent. Vault floor, actual Rent policy and the
selected minimum rent must agree. Vault and receipt rent calculations are
restricted to the supported exact Number-integer range, matching the existing
reserve observer; large account balances remain full u64 integers. Reserve balance must cover the protected
floor plus all remaining declared original-token capacity. Recipient credit
must not overflow; payer must cover32-byte receipt rent plus the supplied fee.
An absent recipient is treated as the default empty System account; an existing
recipient and payer must be plain nonexecutable System accounts.

Clock must lie within the finalized snapshot/checkpoint. Proposed settlement
uses the programme's day-rollover, backwards-time, exact addition and daily-limit
rules. The remaining daily amount reports headroom after the proposed claim;
it is not a committed account change. A stable account hash excludes the
advancing Clock, whose slot/timestamp are checked separately.

This pure function examines supplied JSON and declarations. It executes no RPC
and grants no code, independent finality, expiry, signing or lifecycle permission.

## Bounded private observer

`observeGatedClaimDestination` accepts only an explicit numeric loopback endpoint
and captures the intent before asynchronous reads. Existing `observePinnedProgram`
brackets two matching selected account snapshots with exact current Loader-v3,
full ProgramData/code, authority and static-policy observations. Dynamic config
bytes must match the selected intent; changed obligations refuse. Caller edits
cannot replace the captured selection.

The observer asks `getFeeForMessage` for the exact unsigned legacy message and
checks finalized block height and blockhash validity before and after the final
code bracket. Checkpoints never regress; expired/invalid hashes and unavailable
or unsupported fees refuse. A matching observation can become stale immediately;
there is no atomic reservation or independent inclusion proof.

At most15 read-only RPC requests share one overall100–30000ms deadline
(default15000ms). Redirects, non-JSON responses, malformed envelopes, declared
or streamed size overflow refuse. Limits are2MiB per code snapshot,32768 bytes
per selected account snapshot,2048 bytes for other replies and8MiB overall.
Abort and body cancellation cover slow headers and stalled streams. No mutation
method, private key, signed payload, journal update, retry or broadcast is used.

## Verification and boundaries

Thirteen supplied-account groups and three endpoint/transport/deadline refusal
groups run in normal CI, alongside existing pin/SDK/journal regressions. Five
additional explicit local groups require the externally selected public ELF
through `SC_GATED_OBSERVER_ELF`; missing/mismatched artifacts fail, never skip.
These are not part of default CI, which has no artifact bytes. The local tests
verify full selected code bytes in controlled RPC responses, real loopback HTTP
request/response transport, stalled-body cancellation, late expiry/receipt/state
changes and caller-input isolation. No SBF is executed or rebuilt. The ELF is
neither committed nor uploaded; it remains separately checksum-selected.

The first local artifact test used stale serialized Clock bytes in its synthetic
RPC fixture: two groups refused before their intended checks. Updating returned
clock bytes fixes the fixture; rejection assertions now require their intended
cause. The failed log remains retained. These are synthetic RPC/HTTP checks,
not actual Agave account observations or independent finality/backing evidence.

Only same-endpoint destination facts are observed. Source lock economics/finality,
original escrow, complete genesis backing, operator/custody/upgrade/security
review, durable active handoff and finalized economic recovery remain separate.
All submission, signing, broadcast and production permissions stay false. The
running devnet stability test, retained old journals and unresolved native history
are untouched.
