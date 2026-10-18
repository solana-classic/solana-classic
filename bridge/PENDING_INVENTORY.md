# Selected pending-journal accounting

`pending-inventory.mjs` adds an offline check of multiple selected version2 or
version3 private journals. It cannot establish a complete source-event inventory,
fresh chain state, common branch, funded backing or settlement. It never signs,
hands out transaction bytes, reads an RPC, broadcasts, refunds or enables retry.
Keep its output private; it contains selected operation identities and hashes.

## Inputs and inspection

Call `reviewPendingInventory({directory, selection, expectedDomain, accounting})`.
The single directory must satisfy the existing private journal rules. Explicitly
select one to 256 distinct receipt IDs and their independently retained journal
hashes as `{id, journalHash}`. Never combine separate rehearsal branches simply
because they have the same genesis or bridge addresses. The function cannot
prove common history from local journal bytes.

`expectedDomain` has exactly `bridge`, `originChain`, `nativeChain`,
`originProgram`, `nativeProgram`, `originMint`, `epoch` and `originDecimals`.
Both directions must match this orientation, exact mint, epoch and precision;
known public chains and the canonical devnet are refused. Legacy unpinned
version1 records cannot gain admission by supplying copied hashes.

`accounting` has exactly these canonical u64 decimal strings:

- `originEscrowUnits`
- `originOutstandingUnits`
- `nativeOutstandingUnits`
- `reserveNativeUnits`
- `protectedFloorNativeUnits`

All caller selections are copied before asynchronous inspection. Each journal
passes the existing signed-transaction, event, receipt and retained policy
verification. The inspection additionally exposes the signed bridge identity.
The inventory reads every selected record again before returning and refuses
changed hashes. Existing per-operation locks coordinate reads; no journal save
occurs. Sequential inspections are not an atomic multi-record or chain snapshot.
No directory, RPC endpoint, signature or signed bytes are returned.

## Conservative selected obligations

Every state except a locally labelled `FINALIZED` remains pending, including
`PREPARED`, `SUBMISSION_ATTEMPTED`, `PENDING`, `EXPIRED_UNRESOLVED`,
`CONSUMED_REVIEW_REQUIRED` and `FAILED_REVIEW_REQUIRED`. Expiry, a failed label
or uncertainty cannot erase the selected amount. A locally finalized label is
listed separately; the function does not independently establish its truth.
It does not change or close any operation.

The selected declared equation is:

```text
origin escrow = origin outstanding
origin outstanding = native outstanding
                   + selected pending native claims in original units
                   + selected pending original redemptions in original units
```

The declared native reserve must also cover the declared protected floor plus
all selected pending native payouts. Exact BigInt conversion and checked u64
sums reject rounding and overflow. Returned-native redemption obligations remain
in the original escrow equation; they are not treated as new native payouts.

The ordered selection and result have deterministic domain-separated hashes.
Hashes bind the chosen bytes and arithmetic, not authenticity or completeness.
Coordinated omission of a journal and its declared liability cannot be detected
without a complete independently observed source-event/accounting inventory.
Tests explicitly demonstrate that limitation. Production needs that inventory,
consistent finalized snapshots, fresh code/custody checks, actual backing and
independent review before these numbers could support any release decision.

## Verification and remaining gates

Thirteen new synthetic tests cover both directions, all unresolved labels,
locally finalized separation, metadata version3, domain/mint/epoch mismatch,
changed/omitted/duplicate records, caller mutation, exact large units, overflow,
reserve/counter failures and strict bounded inputs. All 167 related bridge
regressions pass locally; the existing Linux review workflow includes them.
No actual chain request, validator start or retained private attempt is involved.
See [the scoped local result](../evidence/bridge-selected-pending-inventory-local.json).

`completeSourceEventInventoryVerified`, `sameLedgerHistoryVerified`,
`simultaneousSnapshotVerified`, `freshChainStateVerified`,
`finalizedJournalLabelsIndependentlyVerified`, `codeAndCustodyVerified` and
`backingVerified` stay false. Retry, refund, reset, signing, broadcast,
settlement and production permission also stay false. Existing unresolved
attempts remain preserved and require their separately reviewed recovery path.

## Retained-record compatibility runner

`rehearsal/selected-inventory.mjs` exports `checkRetainedInventory` for a
private, explicitly configured worker. Stage its dependency closure beside it
and supply separate owner-only source and output directories. Infrastructure
identifiers, private directory configuration and the launcher remain private.
The output attempt is reserved exclusively and cannot be reused.

The runner copies two actual version3 journals from one completed metadata
rehearsal: a locally finalized native claim and an expired unresolved original
redemption. It checks their exact bytes against retained hashes, reviews both
directions together using historical declared counters, verifies deterministic
selection ordering and rejects omission, erased liability, duplicates, changed
hashes and another epoch. Originals and copies must remain byte-identical.

This performs no RPC reads, validator starts, signing, handoffs or transactions.
A passed result establishes offline compatibility of the selected retained
records only. The runner does not independently prove the finalized label,
common ledger history, complete source events, current balances, custody or
funded backing. No retry, refund, settlement or production permission is granted.
Keep full output private; publish only explicitly selected aggregate counts,
limitations and public source hashes.


## Separate returned-account model

[Source-event and receipt accounting](EVENT_INVENTORY.md) now supplies a second
pure verifier. It derives both pending directions from supplied programme-owned
event/receipt accounts and compares the derived amounts with both configurations,
a separately supplied escrow and the returned native vault. It does not use
journal finalization labels. Eleven synthetic groups cover omission against
unchanged counters, orphan receipts, exact arithmetic and policy boundaries.
This is not a fresh RPC collector or complete-history proof; coordinated
omission with changed supplied counters remains an explicit limitation. It
cannot change the permissions or conclusions of selected-journal review.
