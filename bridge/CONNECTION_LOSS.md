# Withdrawal handoff and connection loss

A missing RPC acknowledgement cannot authorize another withdrawal. The private
claim journal records its one allowed handoff before returning signed bytes.
If the connection then fails, keep that original transaction, its expiry,
code/mint admissions and the full escrow obligation until reconciliation.
Elapsed time alone cannot prove whether a transaction landed.

## Controlled private rehearsal

`rehearsal/metadata-dropped-redemption.mjs` exercises this boundary on two new
copies of the stopped metadata fixture. Its separate worker driver requires
the exact private worker, pinned executable and source files, unused attempt,
free loopback ports, retained finalized checkpoints and unchanged baseline.
It never opens the live devnet ledger or imports a local wallet.

One unused native return finalizes, with returned value separate from event
rent. Its version3 original-token withdrawal passes actual code/mint admission
and leaves the journal exactly once. The local `drop-submission.mjs` helper
receives the complete HTTP submission and destroys the connection without an
RPC response. It has no validator URL, forwarding path or retry behavior.
The client observes an actual connection failure; zero withdrawal requests
are forwarded to a node. The owned HTTP listener closes before proceeding.

All three handoff APIs must refuse another attempt while the signed withdrawal
is still unexpired. The rehearsal then waits for actual finalized block height
to exceed its original expiry. Attempted journal bytes must remain unchanged,
and all three APIs must still refuse. Reconciliation must retain
EXPIRED_UNRESOLVED, one attempt, original signed bytes/expiry and both code/mint
admissions. All three APIs refuse again afterward.

No destination signature, transaction, receipt or token payout may appear.
Original escrow/outstanding must retain the pending liability; returned native
backing stays in reserve, without a native refund. Recipient token/native
balances remain unchanged. Both copied validators must stop, and complete
baseline ledger inventories and selected private records must remain unchanged.
Private keys, signed bytes, journals, signatures and accounting inputs stay on
the worker. Only scoped aggregate checks and public source hashes are exported.

## Admission and verification scope

Three local transport checks exercise a real dropped connection, malformed
input refusal and an occupied-port refusal without affecting the unrelated
listener. Six worker guards cover host/baseline/result admission, retained
attempts, immutable copied-ledger commands and TCP port reuse. The HTTP port
precheck uses the listener's normal TIME_WAIT reuse and still requires bind
and listen; an active listener refuses. No reuse-port or alternate-port fallback
is enabled. The initial overly strict port check failed before copies,
validators or transactions; that attempt remains retained separately.

This is a deliberately dropped request whose non-delivery is controlled by the
fixture. It does not establish behavior after arbitrary unknown delivery,
pruned history, a competing fork or physical host loss. It does not implement
a replacement transaction, refund, retry, recovery signer or production
approval. Read [the expiry policy](EXPIRED_RECOVERY.md) before reviewing any
unresolved obligation. Complete funded backing, independent operators, custody,
full-validator consensus and external security review remain release gates.

## Completed private result

Nine actual checks passed on fresh private source-built Agave copies. One
reviewed withdrawal handoff and one controlled complete submission drop led to
actual-height expiry and EXPIRED_UNRESOLVED, with all nine repeat-handoff
refusals, unchanged original bytes/admissions and no payout or refund. Both
copied validators stopped; original ledgers and private records stayed
unchanged. Six worker guards and three transport checks also passed on Linux.
The separate initial port-admission failure remains retained. See
[the aggregate evidence](../evidence/bridge-metadata-dropped-redemption-agave.json).
