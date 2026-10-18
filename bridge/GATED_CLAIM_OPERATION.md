# Private gated claim operation journal

The separate `gated-claim-operation.mjs` namespace retains one exact signed
native claim, admits fresh selected source and destination observations before
one byte handoff, and reconciles the original signature. It does not import
inert review records or legacy journals. Existing programmes and journal
formats remain unchanged. This is private rehearsal tooling, not a live bridge.

## Selection and lifecycle

The caller supplies exact valid signed source deposit and gated claim bytes,
the complete message-review digest, pinned source/destination programmes and
Token-2022 code, immutable self-metadata mint policy, explicit numeric loopback
RPCs and source/destination checkpoints. The source checkpoint equals the
selected source event slot. A separate externally selected operation digest
binds every input, including the claim expiry and full signed-byte hashes.
There is no signing, replacement message, broadcast, refund or retry API.

Initialization requires a fresh owned 0700 directory. `prepareGatedClaimOperation`
is offline: it durably retains the selection and bytes as `PREPARED_REHEARSAL`;
it does not claim source admission has already occurred. An independent process
can inspect the exact selection without receiving signed bytes.

`takeGatedClaimOperation` holds an exclusive receipt-keyed lock. It first retains
initial finalized source transaction/status metadata before collecting source
accounts, then checks the selected current code, immutable metadata mint,
escrow and outstanding obligations. Two destination observations bracket these
source checks, including code, exact configuration/bootstrap/receipts, reserve,
Rent, Clock, fee, block height and blockhash validity. Both source asset samples
must agree, the committee/precision/epoch must match, and origin outstanding
must equal the selected native outstanding plus this one claim. This deliberately
strict single-operation model refuses competing changes; it is not a concurrent
production relayer. Observations from one RPC are not independent finality or
historical-code proofs, and the synthetic budget is not complete genesis backing.

Only after admission does the journal fsync and publish an immutable one-attempt
record, including the last pre-account response and fee, before returning the
selected signed bytes once. The caller owns any explicit private submission.
The record says `SUBMISSION_ATTEMPTED` conservatively even if the caller crashes
before submission. A failed source admission retains its capture and blocks
further automatic handoff as `ADMISSION_REVIEW_REQUIRED`.

`reconcileGatedClaimOperation` requires that retained attempt and runs the
unchanged exact settlement observer: finalized status brackets and full original
signed transaction history, receipt, all account movements, rent/fee CPIs and
counters must match. It publishes immutable `FINALIZED_REHEARSAL` evidence.
Missing history refuses, even with a consumed receipt. A later failed observation
does not overwrite prior finalized evidence or authorize another handoff.
Inspection reports retained state; it does not certify fresh chain availability.
All production, independent-backing, retry, refund and reset permissions stay
false. Reconciliation cannot recover an unresolved operation by guessing.

## File and transport bounds

Owned 0600 regular files must have one link. Canonical records are bounded to
65536 bytes. Exclusive temporary writes are fsynced and published through a
no-replace hard link, followed by directory fsync. Malformed, partial, aliased,
extra-link or retained lock artifacts refuse and remain for review. There is no
automatic cleanup, lock adoption, expiry reset or migration from old formats.
This conservative crash policy can sacrifice availability to prevent a duplicate
handoff. It does not promise recovery from every filesystem or machine failure.

One 100–30000ms deadline (default 30000ms) bounds active observation, at most 128
read-only requests and 32MiB total response bytes. Per-response bounds are 2MiB
for selected accounts, 256KiB for programme inventory, 64KiB for transaction
history and 4KiB otherwise. The retained nine-account prestate is at most 32KiB.
Redirects, non-JSON responses, declared/streamed overflow and stalled requests
refuse. Queries capture immutable selected inputs before asynchronous reads.
Raw source evidence, selected bytes, keys, endpoints and ledgers remain private.

## Verification scope

Sixteen local groups cover exact selection, namespace separation, tampering,
private file rules, deadlines, retained failed admission, new-process inspection,
two real preparation processes racing, and actual SIGKILL at prepared-file
fsync and no-replace link-publication checkpoints. Six worker admission guards pass.

Eighteen actual checks pass on two fresh private Agave ledgers. Eleven
setup/source/claim transactions finalize once: three new source locks and one
ordinary claim. Two real handoff processes produce one success and one refusal;
the successful admission performs 84 read-only calls before its durable attempt.
Six fresh settlement reads reconcile the original signature. A controlled null
history reply refuses without replacing finalized evidence. The second source
operation locks 10,000 units; actual SIGKILL after its pending attempt fsync leaves
the lock and partial record intact, releases no bytes and submits no second claim.
All later lifecycle calls refuse those retained artifacts. Final origin escrow
and counter are 162,000 units, native counter 152,000, reserve 1,850,000,000 and
recipient 150,000,000 native units. The 10,000-unit interrupted obligation remains
unsettled. Both validators stop; 32 public inputs and four executable hashes are
unchanged. All 391 bridge regressions pass locally.
 See `evidence/bridge-gated-claim-operation.json` for its
exact outcome, aggregate economics and selected public source hashes. A kernel
SIGKILL at an instrumented file checkpoint tests process interruption, not power
loss, arbitrary disk corruption or an unknown transaction landing. Controlled
missing-history responses do not remove real chain history. Older missing
native history and expired obligations stay unresolved and are not replayed.
CI runs local regressions and worker guards; actual private Agave execution is
separate. Full-validator consensus, capable hosting, independent operators,
complete funded backing, custody/upgrades and security/release review remain.
