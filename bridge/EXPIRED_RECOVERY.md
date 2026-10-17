# Expired redemption: review and recovery draft

This is a policy draft, not a signer, relayer, approval or enabled recovery
transaction. Preserve the existing journal and its single submission attempt.
Expiry does not authorize a source refund, second deposit, new event nonce or
reset. The current takeSubmissionAttempt continues to refuse a second attempt.

## Offline packet preflight

`expired-review.mjs` now implements `reviewExpiredRedemption({directory, id,
reports, accounting, reviewedAt})`. It inspects and verifies the original
private journal's signatures, canonical transaction, exact instruction and
receipt domain using `inspectPendingClaim`. It does not save the journal,
read an RPC, sign, hand out transaction bytes or broadcast. The temporary
exclusive journal lock coordinates inspection with existing reconciliation.

Supply two to five observer reports. Each must bind the inspected journal,
event, original signature, transaction and instruction hashes, both network
and programme identities, and source event. Distinct observer public keys and
evidence hashes are required. Reports must be no older than five minutes at
the supplied canonical review time, with source/destination finalized slots
at or beyond the original checkpoints and destination height beyond expiry.
A reported receipt or signature, unavailable history or changed domain stops
this absent-settlement review; reconcile or investigate those cases instead.

Accounting uses canonical u64 strings, retains the operation's full pending
liability, reconciles escrow/origin counter against native counter plus that
liability, and checks the reserve floor. This equation is restricted to the
single pending-redemption fixture. Production needs a complete pending-event
inventory and independently observed economic history; this tool does not
infer them from supplied balances.

These are **unsigned supplied reports**. Different keys do not establish
independent operators; `evidenceHash` binds an asserted evidence reference,
not its authenticated contents. Timestamps, finalized heights, absent receipt,
history completeness, accounting, bytecode and custody are not independently
verified by this offline preflight. All such release checks remain open.
The returned packet explicitly keeps `canRetry`, `canRefund`,
`canResetAttempt`, `settlementAccepted` and `productionReady` false even when
structural checks pass. It strips arbitrary report fields and never exports
signed bytes, endpoints or private keys. Retain packets privately; the packet
hash is not an operator approval. A concurrently finalized journal must be
re-inspected and reconciled; a prior snapshot grants no authority.

Seven new synthetic tests cover original-byte binding, late settlement,
domain changes, duplicate/stale observers, checkpoints, accounting precision,
pending-liability preservation and refusal for native/finalized operations.
Run with pinned Node24:

```sh
node --test bridge/expired-review.test.mjs
```

## Observed private case

The V2 native return of10000original base units finalized, adding10000000native
units to reserve. Creating its297-byte event separately cost the sender2958000
native units in rent; sender debit was12958000. Network fee payer was separate.
This measured test-chain cost is not a production quote.

Original redemption was broadcast once; no signature status was observed before
the copied origin crash. After restart it expired without a finalized receipt
or token payout. The original signed journal remains EXPIRED_UNRESOLVED.

| Quantity | Original base units |
| --- | --- |
| Original escrow/outstanding counter | 1960000 |
| Native outstanding counter | 1950000 |
| Pending original redemption | 10000 |
| Recipient original-token account | 40000 |

Escrow equals native outstanding plus pending redemption. Keep that obligation;
do not set counters equal. Native reserve52000000/floor2000000 remain intact.
These are synthetic fixture balances, not complete funded mainnet backing.

## Required private review packet

1. Preserve receipt/operation ID, event hash, source signature/PDA/nonce,
   original destination signature/transaction hash, signed bytes and last-valid
   block height. Signed bytes remain private.
2. Re-observe both pinned genesi, programme bytes/upgrade authorities,
   configuration/epoch, mint/decimals, committee and pause/custody policy.
   Matching programme addresses alone are insufficient.
3. Independent source observers must verify the same successful finalized
   native return, exact event, reserve movement and counter. No new source event.
4. Independent destination operators must supply dated finalized contexts,
   actual heights beyond expiry, receipt observations and sufficient history
   coverage. Missing one-RPC data, elapsed time or a journal label cannot prove
   non-settlement. Reconcile any valid receipt/finalized payout; conflicting
   history/authorities/finalized views stop recovery and invoke reviewed pause.
5. Reconcile recipient/escrow movements and counters with the pending liability.
   Record a separate append-only operator decision, evidence hashes and approved
   independent quorum. Never overwrite the original attempt or invent success.

## Proposed future path, unimplemented

If independently reviewed and authorized, a future signer could prepare fresh
blockhash/signatures for the same economic event and receipt PDA. Amount,
recipient, mint, programmes, epoch and instruction bytes must remain identical.
Atomic consumed-receipt checks must prevent old and recovery transactions from
both paying. Code pins, source finality, custody and quorum remain mandatory.

Keep original history immutable and any separately authorized recovery attempt
append-only. This draft supplies no recovery signer, approval verifier or
broadcast. Before implementing or enabling it, test late receipt appearance,
concurrent old/recovery submissions, independent-node disagreement, upgrades,
epoch/pause/backing changes, duplicate approvals and signer/broadcast crashes.
A separate new nonce7 withdrawal now passes observed-pending crash recovery
and exact finalized token payout. It does not retry or resolve the expired
nonce6 journal. See `../evidence/bridge-v2-redemption-pending-crash.json`.

## Signed observer reports, review only

`observer-reports.mjs` now supplies a canonical unsigned report message and
Ed25519 signature verification. It never accepts a private signing key, signs
or broadcasts. The message includes a dedicated signing-domain prefix,
review-only purpose, fixed three-of-five roster hash, original receipt/journal,
event/transaction/instruction hashes, both chain/programme identities, source
event, original signature, mint/recipient token account, amount/nonce/epoch,
programme-pin digest, accounting digest and dated observation fields.

`verifyObserverReports` requires three to five distinct signatures from the
explicit five-key isolated review roster. Unknown or duplicate keys/evidence,
wrong domains/rosters/bindings, malformed signatures, noncanonical schemas,
stale/future observations and unsafe numeric fields reject. Reports can express
present/conflicting receipts or incomplete history; signature validity does
not establish that a report describes a safe recovery state.

`reviewAuthenticatedExpiry` combines key authentication with the existing
structural expiry review and reinspects the journal. A late finalized journal,
present receipt, changed obligation or missing history cannot inherit an old
snapshot. Caller inputs are selected before asynchronous inspection. It does
not save or reset the journal, hand out signed transaction bytes or authorize
recovery. All retry/refund/reset/settlement/production flags remain false.

A verified signature authenticates a selected public key. It does not identify
a person or prove that distinct keys belong to independently operated nodes.
No production roster has been appointed. Source economic movement, complete
history, code/custody/finality and actual backing remain separately reviewed
claims. The programme-pin digest is bound by the reports, but this offline
module does not fetch or independently validate its underlying observations.
Signed observation payloads and any assembled dossier should remain private.

Twelve new local synthetic tests cover signature forgery/substitution,
three-of-five quorum, replay domains, operation/policy/accounting bindings,
freshness/schema/precision, late settlement, unchanged journals and caller
mutation across asynchronous inspection. Seven existing structural-review
regressions also pass. This is local fixture evidence, not new Agave-ledger,
independent-operator or production recovery acceptance.


## Retained journal code-policy binding

Authenticated expiry review now compares the caller-selected programme-pin hash
with the verified version2 or version3 journal's own hash. Otherwise valid
signatures cannot replace that retained selection by signing another caller
hash. Matching records return programmePinsBoundToJournal:true. A legacy
version1 record has no enforced pin selection, so its externally supplied hash
is explicitly labelled unbound. This label is equality to a retained policy,
not fresh verification of deployed code or custody. Version3's selected mint
review remains bound through the exact journal hash and verified inspection.

Three new regressions cover substituted valid signatures, both pinned journal
versions and disabled recovery, plus the legacy label; all38 related review/
metadata regressions pass. Six offline checks also pass against the retained
actual metadata original-redemption expiry journal. Those use synthetic signed
assertions and historical contexts, with no fresh RPC observations, validator
starts or transactions. Changed code hashes, journal bindings, reported late
settlement, missing history and lost liability reject; original journal and
selected private inputs stay unchanged. No recovery permission is enabled.
See [the aggregate offline result](../evidence/bridge-metadata-expiry-review-offline.json).

Synthetic signatures authenticate test keys, not independent operators or fresh
chain facts. Private packets and signed assertions stay private. Complete
history, source movements, code/custody, funded backing and independent security
review remain open; retry, refund, reset and production flags stay false.

## Controlled loss after reviewed handoff

The metadata withdrawal rehearsal now distinguishes a prepared-but-unsubmitted
record from an actual one-time reviewed handoff followed by a deliberately
dropped HTTP submission. The latter must keep its fsynced code/mint admissions
and SUBMISSION_ATTEMPTED journal through actual-height expiry and reconciliation.
Lack of an RPC acknowledgement cannot permit a new handoff or discard escrow
liability. This controlled non-delivery case does not accept arbitrary unknown
landing or recovery. See [the exact boundary](CONNECTION_LOSS.md).
