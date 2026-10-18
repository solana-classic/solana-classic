# Gated native claim settlement evidence

The new read-only settlement guard is a prerequisite for a future active gated
journal. It does not change the inert review namespace, existing legacy journals,
signing builders, programme artifacts or the public stability candidate.

## Exact supplied evidence

`reviewGatedClaimSettlement` requires the externally selected message-review
digest, exact valid signed legacy bytes, a positive checkpoint, exact fee and
raw pre-account, signature-status, transaction-history and post-account replies.
The pre-account selection passes the unchanged destination reviewer, including
reserve capacity, bootstrap witness/receipts, Rent, Clock and daily limits.

Success requires finalized, error-free signature status and transaction history
at the same slot, matching every signed byte. A consumed receipt alone cannot
replace missing transaction history. Lossless native JSON preserves all u64
balances. Every compiled account's change must match exactly: native reserve
debit, recipient credit, receipt rent, payer rent plus fee, and zero movement
elsewhere. The exact three System funding/allocation/assignment calls, receipt
bytes/owner, protected bootstrap state, static policy and outstanding/daily
counter transitions must also match. Token movement, conflicting execution
logs, changed code selections and malformed or incomplete evidence refuse.

Selected pre/post account balances must match the transaction metadata exactly.
Intervening movement or another settlement affecting these accounts refuses.
This strict private-rehearsal guard does not authorize a concurrent production
relayer. Current account replies and logs are not independent historical proofs.

## Bounded private collection

`observeGatedClaimSettlement` accepts only an explicit numeric loopback RPC and
captures inputs before asynchronous reads. Six read-only requests check genesis,
finalized signature status, the original base64 transaction, selected accounts,
status again and genesis again. A missing/pruned transaction, disappearing or
regressed status, contradictory slot or changed genesis refuses. There is no
retry, refund, replacement transaction or attempt-state reset.

One 100–30000ms deadline covers the RPC sequence, default 15000ms. Per-response
limits are 256 bytes for genesis, 4096 for status, 65536 for transaction history
and 32768 for accounts, with 131072 bytes overall. Redirects, non-JSON replies,
declared/streamed overflow and stalled headers/bodies refuse. Summaries omit
raw responses, signed bytes and endpoints. Flags distinguish supplied-data
review from same-endpoint RPC observation; neither grants lifecycle acceptance,
independent verification, historical-code/backing proof or submission authority.

## Actual private Agave rehearsal

Fourteen checks pass on two new source-built Agave 3.0.14 test-validator ledgers
with fresh keys/genesi and unchanged selected V2/gated/Token-2022 artifacts.
The new synthetic bootstrap locks 102,000 origin base units. A second 50,000-unit
source lock precedes one gated native claim. The fixture writes and fsyncs the
selected signed bytes and review/expiry before exactly one non-retried HTTP
submission. A repeated fixture attempt refuses its existing immutable marker
before another submission. This is a one-operation fixture, not an active
journal API or a mid-write-kill, unknown-landing or crash-recovery proof.

The exact finalized claim, both status brackets, consumed receipt, all account
movements and receipt CPIs reconcile through six actual RPC reads. Seven raw
read-only replies, including the pre-account snapshot, stay private. A separate
controlled missing-history input is rejected while retaining the actual status
and receipt inputs; real chain history was not removed. The older missing
native history and expired redemption remain unresolved and untouched.

Final synthetic escrow and both counters are 152,000 origin units; native reserve
is 1,850,000,000 and recipient 150,000,000 native base units. The payout is 50,000,000,
receipt rent 1,113,600 and fee 20,000. Ten setup/source/claim transactions finalize
once. Both private processes stop; all 19 selected public inputs and four runtime
executables remain unchanged. Keys, signed bytes, raw replies and ledgers are
not published. The two-row budget is hypothetical, with no complete genesis
backing, independent custody/operator or production security acceptance.

Twenty-three synthetic/HTTP groups cover exact settlement, precision, missing
history, signature/receipt/code selection, per-account movement, counters, CPI,
response bounds, actual loopback transport/deadline cancellation and captured
inputs. Six new worker admission groups and the full 375 bridge regressions pass.
CI runs those regressions/guards and compilation only; it does not execute the
private Agave profile or silently substitute fixtures for actual chain evidence.
See evidence/bridge-gated-claim-settlement.json for aggregate results and hashes.
Preserve the completed private attempt and every older failed or unresolved one.
