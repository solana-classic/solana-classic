# Gated claim reply loss and expiry rehearsal

The separate fault profile exercises the existing private gated operation journal
on two fresh synthetic Agave chains. It does not reuse completed operations,
change the journal format or programme artifacts, or touch the stability candidate.
The previous interrupted 10,000-unit obligation stays retained in its own profile.

## Controlled loss of a client reply

`dropForwardedSubmission` is a private rehearsal transport, not a public relayer.
It accepts only bounded, canonical signed legacy bytes, an explicit numeric
loopback RPC and an externally selected non-public, non-canonical-devnet genesis.
It checks that genesis before listening and immediately before forwarding. One
local complete POST must equal the selected signed request, including preflight
and `maxRetries:0`. Exactly one upstream submission is permitted. The harness
checks the selected upstream signature, then destroys the client connection
without returning an RPC acknowledgement. It never retries.

One 100–10000ms deadline bounds the entire helper, default 5000ms. Genesis replies
are bounded to 256 bytes, submission replies and local request bodies to 4096.
Redirects, non-JSON replies, malformed envelopes, oversized bodies, changed genesis
and signature disagreement refuse. Cancellation is checked before listening or
forwarding; sockets and the owned listener close after either outcome. An occupied
port is left untouched. Six actual local HTTP groups cover the forward/loss path,
wrong or changed genesis, known public chains and bad selections, signature
mismatch, a stalled body deadline and an occupied listener.

The caller experiences a real connection failure with zero RPC replies. The
harness observes upstream acceptance, so this controlled result is not proof
of arbitrary unknown landing or a transaction lost inside validator networking.
Fresh original-signature observations must establish the actual outcome.

## Separate deliberately unsubmitted expiry

A different source event receives its own exact one-time journal handoff. The
fixture retains the returned bytes and deliberately makes no submission. It
waits for actual finalized height to exceed that selection's unchanged
`lastValidBlockHeight`, then checks that the same blockhash is invalid. It does
not edit the expiry, replace the transaction, assume elapsed time is expiry,
or repeatedly submit until a different outcome appears.

Two original-signature status reads, finalized transaction lookup and receipt
lookup remain absent. Reconciliation still refuses and the immutable attempted
record stays byte-for-byte unchanged, with attempts 1 and no finalized record.
Another handoff refuses before RPC. The journal deliberately retains
`SUBMISSION_ATTEMPTED`; expiry and absent history do not prove safe retry,
refund or replacement. The new source obligation remains unpaid and backed
only within the synthetic fixture's observed escrow/counter accounting.
This known-unsubmitted branch does not establish absence after an arbitrary
lost network submission or authorize recovery of any older obligation.

## Evidence and limits

Twenty actual checks pass. Eleven setup/source/claim transactions finalize
once: three source deposits and one ordinary gated claim. The client loses its
reply after exactly one upstream submission. Actual pre-finalized status refuses
reconciliation without changing the attempt; later exact original-signature
settlement succeeds. A controlled missing-history reply still refuses without
overwriting that finalized record. The separate unsubmitted claim passes 62
actual height observations over 61,804ms before its original height is exceeded
and the hash becomes invalid. Two absent statuses, absent transaction and absent
receipt cannot authorize retry. Its attempts 1 and exact signed bytes remain.

Final source escrow/counter are 162,000 origin units; native counter 152,000,
reserve 1,850,000,000 and recipient 150,000,000 native units. The second 10,000-unit
source obligation remains unsettled. Both owned validators stop, all 33 public
inputs and four runtime executable hashes match, and existing profiles stay
unchanged. All 397 selected local bridge regression groups and six new worker
admission guards pass. No application-level graceful flush is inferred from
process exit.

See `evidence/bridge-gated-claim-faults.json` for exact actual results, synthetic
economics and public source/artifact hashes. Raw signatures, source captures,
signed journals, private RPC replies, keys and ledgers stay private. CI executes
the local HTTP regressions and worker admission guards; the actual two-chain
execution has separate evidence. The complete genesis budget, funded original
backing, independent source verification/operators, custody/upgrades, compatible
fork/reorg behavior, recovery policy and external security/release review remain
open. The older missing native transaction history is unresolved.
