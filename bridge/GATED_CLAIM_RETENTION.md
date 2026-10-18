# Immutable private gated-claim review retention

`gated-claim-review-journal.mjs` retains an already signed, externally selected
native-bootstrap-trailer-v3 claim for offline review. This is a separate inert
review namespace, not an operational submission journal. It does not change
legacy journal versions, builders, compiled programmes or deployments.

## Explicit namespace and retention

The caller supplies a fresh empty real directory owned by the current user,
mode0700, with a canonical path containing no symlink alias. Explicit
`initializeGatedClaimReviewDirectory(directory)` creates the fixed private
format marker. A nonempty directory, including one holding old journals, is
refused. Initialization is never an automatic import or recovery operation.

`retainGatedClaimReview({directory, intent, expectedReviewSHA256,
transactionBytes})` first calls the separate exact signed-message verifier.
Only native claims are supported. The external digest binds complete selected
code/policy/authority pins, configuration/bootstrap inputs, exact compiled
message and expiry height as described in `GATED_MESSAGE_REVIEW.md`.

The module snapshots signed bytes once, reconstructs the stored wire inputs
and revalidates that snapshot before writing. Later caller-buffer edits cannot
change retained bytes. The claim receipt PDA names the record. Its canonical private JSON preserves
selected account/event bytes, exact integer values, review digest and signed
transaction bytes/hash. A different blockhash, expiry, quorum or amount cannot
replace an already retained receipt. No signing key or RPC endpoint is stored.
Signed transaction bytes remain sensitive and must never enter source, build
inputs, deployments, public evidence or shared directories. These files are
not encrypted; authorized local access and storage protection still matter.

## Exclusive publication and inspection

Each write uses a fixed exclusive mode0600 `.pending` file, file fsync,
no-replace hard-link publication, removal of the temporary link and directory
fsync. Another writer cannot overwrite either the pending or complete record.
A failed write deliberately leaves its artifacts for operator review. No API
clears a partial file, stale link, existing record or namespace marker.

`inspectGatedClaimReview({directory, id, expectedReviewSHA256})` requires the
external selection again. It opens only owned mode0600 regular single-link
files without following symlinks; reads are bounded to16384 bytes plus one
sentinel and compare file metadata before/after. Symlinked/shared roots,
marker changes, pending files, noncanonical JSON/base64, unknown schemas,
changed receipt/message/selection or bad signatures refuse. Reconstructed
inputs pass the exact verifier again before a summary is returned. Summaries
omit raw signed bytes and account/event contents and grant no permissions.

A crash between link publication and temporary-link removal leaves two links;
that state remains blocked. A crash before publication leaves only the pending
artifact, also blocked. Genuine operator investigation must preserve and
review those files, rather than deleting them to enable a replacement.

Fifteen focused groups include actual inspection in a new Node process and
two real concurrent writers, with exactly one successful retention. Other
checks cover duplicate domains, unsafe files/permissions/links, tampering,
record bounds, namespace separation and retained partial states. Interrupted
states are injected test artifacts; these are not power-loss or mid-write
process-kill drills. No hostile same-user filesystem, distributed storage or
production recovery guarantee is established by these local tests.

## Remaining integration

State remains `RETAINED_REVIEW_ONLY`, attempt count zero. There is no signing,
network, submission handoff, retry, state transition, expiry clearance or
recovery-mutation API. Chain state, source finality, expiry validity, submission,
signing, broadcast and production flags remain false. Retention does not prove
deployed code, current vault/receipt/configuration state, real funded backing,
source economics, custody or independent verification.

A future active gated journal needs authenticated current observations,
exactly-once durable handoff, finalized economic reconciliation and failure/
recovery review. Existing unresolved obligations and old journals are untouched.
The canonical devnet and its separately frozen stability run are unaffected.
