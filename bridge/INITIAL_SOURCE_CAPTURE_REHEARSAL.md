# Initial source capture on new private Agave ledgers

`rehearsal/initial-source-capture.mjs` and
`engine/rehearsal/initial_source_capture.py` exercise the
[source capture gateway](SOURCE_CONFIRMATION_CAPTURE.md) using two fresh,
private, source-built Agave test validators. This is a valueless functional
rehearsal, not full-validator consensus or production bridge acceptance.

The worker reserves an exclusive attempt before generating fixture keys or
starting validators. It admits only the separate private worker, pinned
validator and public programme artifacts, unchanged staged source, adequate
private-worker capacity and disjoint loopback TCP/UDP ports. Existing private
validators cause refusal. No retained ledger or signed operation is reused.
Never run this fixed-namespace worker again after its attempt exists.

The fixture initializes an immutable self-metadata Token-2022 mint and a bounded
synthetic native reserve. Each direction submits one new source transaction
with its original signed receipt saved privately before submission. The source
checkpoint is the event's slot; the later event-account observation provides a
separate minimum context for destination preparation. A later account context
must not be mislabeled as the source transaction's slot.

Before claim preparation, the gateway retains the exact finalized transaction
response, separately checks finalized signature status, collects current
programme accounts and verifies signatures, instruction, event and exact
source economic metadata. The completed capture and normalized snapshot must
exist before the unused version3 destination journal is returned. The fixture
checks that journal attempts remain zero and destination economic state is
unchanged at that boundary.

A second preparation using the same evidence directory must refuse without
changing either the saved raw response or prepared journal. Only the first
journal can pass the existing reviewed mint and code admission, receive one
submission handoff, settle and reconcile. Another handoff must refuse. The
round trip must restore the initial escrow, outstanding counters and reserve;
transaction fees and source-event rent remain separate.

The worker stops its owned validators on success or failure. Normal SIGINT
exit is process-stop evidence, not proof of application-level graceful flush.
A separate final audit must check both stopped processes, public source hashes,
raw response hashes, saved original signed-source hashes, final journal states
and aggregate counts before publishing a result. Failed attempts and their
private logs must be retained without retry, reset or overwrite.

This exercise does not retrieve the earlier native transaction's missing
metadata or change its unresolved obligation. It does not establish independent
finality, historical code, complete history, funded genesis backing, production
custody or security. It does not migrate all callers to the gateway or authorize
mainnet, production signing, real-value settlement, refunds or retries. Keys,
raw signed receipts, account identities, captures, journals, ledgers and logs
remain private; publish only aggregate checks and public source hashes.


The first actual attempt stopped after two setup checks and one source deposit:
its finalized-account pin observation refused before a completed capture,
destination journal or settlement submission. The raw source transaction and
finalized signature status survived, both validators stopped and the source
obligation remains unresolved. The rejected account RPC response itself was
not retained, so its exact error code is not asserted.

Review found that capture had incorrectly used the signature-status observation
context as a finalized-account checkpoint. The pinned RPC source and a
both-direction regression distinguish these contexts. The corrected runner
uses another exclusive namespace and entirely new fixture identities; it must
never resume the first deposit or relabel its refusal as a pass.


The corrected fresh attempt passed eight actual checks: two completed source
captures, two finalized one-time settlements, two capture-directory reuse
refusals and an exact return to initial selected accounting. Both validators
stopped. A separate audit verified all26 staged source hashes, saved raw
transaction/status hashes, original signed-source hashes, two final version3
journals with one handoff each and an empty private-validator process census.
See the [aggregate result](../evidence/bridge-initial-source-capture-agave.json).
The failed first source obligation remains unresolved and is never settled by
this successful fixture.
