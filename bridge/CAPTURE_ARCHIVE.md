# Retained source-capture review and archive restore

`retained-source-capture.mjs` rechecks a completed private source capture without
RPC, signing, journal writes or transaction submission. It is an offline evidence
review, not a source of settlement permission.

`retainedSourceCaptureDigest(directory)` calculates a current selection over the
seven exact capture files, including their names, lengths and byte hashes.
Store that selection outside the archive before copying or restoring it. A
selection made now does not establish custody since the initial capture. A
trusted owner who replaces both the evidence and its external selection remains
outside this integrity guarantee.

`reviewRetainedSourceCapture` requires exactly `directory`, `expectedSHA256`,
`pins`, `transactionBase64`, `sourceEvent` and `minimumContextSlot`. The supplied
signed source must be the original retained request. The expected hash is the
previously selected capture digest, not a digest silently recalculated from the
restored files.

The reader requires real owned mode0700 directories and mode0600 regular files
with one link. Aliased paths, symbolic links, hard links, unknown or missing
records, changed directories/files and broad permissions refuse. Reads are
bounded even when a file grows during inspection: raw responses are at most
64KiB, selection/response records16KiB, the completed observation1MiB and the
whole capture2MiB. No filesystem content is changed.

Review checks the external selection, both raw response hashes, exact selected
pins/event/source signature and original signed bytes. The recorded status must
report same-slot finalized success with null confirmations and no error. The
existing pure economic verifier then rechecks the stored transaction against
its stored event snapshot, including exact native/token movements, fee, rent
and inner instructions. Large native numbers keep their original raw digits.
Stored success labels cannot grant signing, retry or production permissions.

These files contain RPC observations and current snapshots from the original
capture. Offline consistency does not establish independent chain inclusion,
historical deployed code, complete history or current balances. A completed
capture is required; the earlier incomplete capture remains incomplete and its
source obligation remains unresolved.

## Actual private archive drill

`engine/rehearsal/capture_archive.py` uses a new exclusive attempt on the separate
private worker. It admits the completed, stopped two-direction capture fixture
and verifies its retained public source hashes. It copies only the two completed
capture directories and original signed-source receipts: sixteen selected
files. No fixture keys, journals or ledgers are copied.

A separate Node process records external capture selections and reviews the
working copies. The worker creates a bounded owner-only archive, pins its hash
before extraction and validates its complete member list before writing any
restored file. Extraction accepts only the sixteen expected regular files;
traversal, unknown/duplicate members, links, sparse files and oversized content
refuse. A changed archive hash refuses before creating an extraction directory.
Another Node process reviews the restored captures using the selections stored
outside the archive. It never recalculates those expected selections from the
restored data.

Five actual checks passed: baseline review, exact sixteen-file restore,
corrupted-archive refusal, restored offline review and original/source integrity.
A separate final audit compared both review results, external selections,
original signed receipts, restored bytes and staged source hashes; the private
validator census was clear. The [aggregate result](../evidence/bridge-capture-archive.json)
contains no capture hashes, transaction signatures, account identities, signed
payloads, keys or raw metadata.

Nine verifier groups and six archive guards cover both directions, changed
selections and signed inputs, raw/status/observation tampering, confirmed-only
and contradictory status, incomplete/unsafe files, growth during reads, archive
path/link/member bounds, exact worker admission and attempt reuse refusal.
The full bridge suite passes279 checks.

This is a capture-file archive restore, not a ledger restore, validator restart,
independent finality or recovery of the older missing native transaction.
Actual validator starts, chain RPC requests, new signatures and submissions in
this drill are all zero. The same-host archive is not an off-host backup or
proof against physical host loss. Keep all private captures, selections,
receipts, archives and logs out of source and deployments.
