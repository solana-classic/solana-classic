# Reviewed metadata-origin policy

`reviewed-origin-mint.mjs` prepares and checks a separate private observation
policy. It binds the complete selected bridge code/policy pins, Token-2022
code/authority pins, exact original supply and precision, and SHA256 of the
complete mint account. `observeReviewedOriginAssets` captures those expectations
before its first asynchronous read and requires the immutable self-metadata
layout. It then uses the existing two-snapshot, bridge/token-code-bracketed
observer. A different complete mint digest cannot inherit valid code admission.

This policy/observer module cannot grant a signed-byte handoff, sign, submit,
write a journal, retry, refund or authorize settlement. The separate explicit
version3 adapter in `pending-claim.mjs` consumes it in a private prototype,
now verified locally and in a separate fresh private two-chain/restart
rehearsal. Existing plain-mint defaults remain.
All signing, retry, broadcast and production flags stay false.

## Selecting and retaining a policy

1. Independently select a private origin genesis and complete bridge/token-code
   pins. Public Solana chains and canonical Classic devnet are refused.
2. Independently review the original mint bytes and select their complete SHA256,
   exact positive u64 supply string and precision. The policy builder performs
   no RPC read and cannot establish the provenance of these inputs.
3. Call `reviewedOriginMintPolicy`, retain its domain-separated digest, then
   call `observeReviewedOriginAssets` with that policy and the retained finalized
   checkpoint. Unknown fields, malformed values, changed policy contents or
   code-chain mismatches reject. Mint bytes must match exactly.
4. Treat any change as requiring a fresh explicit review. A legitimate token burn
   changes supply and mint bytes too; this strict snapshot cannot silently
   accept it. No automatic policy refresh is provided.

The digest is an integrity binding, not a signature, an independent review or
an authenticated production configuration. A caller can construct a different
self-consistent policy. Production storage, custody, approved signers and the
authenticated enforcement of the retained claim policy remain separate
production requirements.
An RPC's finalized snapshot does not establish independent consensus or
complete funded backing.

## Local verification

Eight new policy/integration checks plus62 related regressions pass locally.
They cover exact large supply, complete pin/digest binding, malformed or edited
policies, wrong public/canonical identities, changed metadata, mutable caller
input during awaits, strict metadata layout and preserved read-only boundaries.

```sh
node --test bridge/reviewed-origin-mint.test.mjs bridge/mint-metadata.test.mjs bridge/origin-assets.test.mjs bridge/origin-token-code.test.mjs bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs
python3 engine/rehearsal/reviewed_metadata_origin_test.py
```

The separate copied-ledger runner starts from the completed valueless metadata
origin. It selects its policy before startup, waits for the retained finalized
checkpoint, permits only read-only RPC requests, stops its copied process and
verifies the original ledger, input and transaction records stayed unchanged.
Its execution is a separate proof from the earlier metadata creation/lock
rehearsal. Neither proof verifies version3 metadata settlement or production redemption.

## Actual private-copy verification

Five actual checks pass on one fresh private origin-ledger copy. The selected
mint digest, supply/precision and complete bridge/token-code pins match;
a wrong selected digest or token-code pin refuses actual state. An edited
policy refuses before any RPC. Fresh review-bound observations retain exact
assets after the negative checks. The observer makes56 read-only RPC requests,
with zero simulations or broadcasts.

Three copy admission guards pass locally and on the private Linux worker. The
copied validator stops with SIGINT; the original complete ledger inventory,
fixture input, result and four transaction records remain unchanged. This is
read-only verification, not a new token creation, source lock, settlement,
crash/fork or full-validator consensus test. See
[the scoped result](../evidence/bridge-reviewed-metadata-origin-agave.json).


## Private journal integration boundary

Version3 claim preparation retains this exact policy alongside independently
selected two-chain programme pins. Every handoff API enforces its reviewed
mint and code observations; old records cannot acquire admission by adding
policy fields.16 new local checks cover both directions and refusal/recovery
paths. The145-check combined suite includes legacy journal, exact-u64,
code-pin and expiry-review regressions. A later actual private rehearsal passes10 checks for both
metadata settlement directions and known-finalized restart recovery.
Further metadata expiry/fork tests, custody, independent
verification and security
review remain outstanding. See
[the separate actual result](../evidence/bridge-metadata-journal-agave.json).
See [the version3 journal](PENDING_CLAIMS.md) and
[local evidence](../evidence/bridge-reviewed-journal-local.json).


Seven later actual checks exercise one reviewed metadata native claim interrupted
before observed finality by destination process kill. The original signature
and exact payout finalize after restart; bytes/admissions remain unchanged and
retry refuses. See [the separate fault proof](../evidence/bridge-metadata-pending-crash-agave.json).
This does not expand the read-only observer proofs into production acceptance.


A separate7-check actual original-redemption fault now recovers the same signed
withdrawal and exact token movement after copied-origin process kill before
observed finality. Both review admissions stay intact and retry refuses.
[The scoped result](../evidence/bridge-metadata-redemption-crash-agave.json) keeps
expiry, competing forks and production acceptance unverified.


A separate actual-height test now passes8 checks for a deliberately unsubmitted
version3 metadata native claim. Original signed expiry passes at real finalized
block height; all three handoff APIs refuse before and after reconciliation to
`EXPIRED_UNRESOLVED`. Zero claim handoffs or broadcasts; source liability remains
without payout or refund. Both fresh copies stop, originals stay unchanged and
five guards pass locally and on Linux. This does not establish unknown-landing,
redemption-expiry, pruning or competing-fork recovery. See
[the aggregate expiry result](../evidence/bridge-metadata-unsubmitted-expiry-agave.json)
and [journal scope](PENDING_CLAIMS.md).


Original redemption now has a separate8-check actual-height unsubmitted-expiry
case. One native return finalizes; all three withdrawal handoff APIs refuse after
the original signed expiry and again after EXPIRED_UNRESOLVED reconciliation.
Zero withdrawal handoffs/broadcasts, no token payout or native refund; original
escrow obligation and returned backing remain. Both copies stop, originals stay
unchanged, five guards pass locally and on Linux. This complements native-claim
unsubmitted expiry and does not verify submitted-but-uncertain recovery, pruning,
forks or production backing/custody/security. See
[the separate redemption expiry result](../evidence/bridge-metadata-redemption-expiry-agave.json).


A separate actual origin-code replacement now passes8 private checks. A version3
metadata native claim is prepared before an incompatible Loader-v3 origin
upgrade. All three handoff APIs reject changed code while the claim is unexpired,
with unchanged signed review/bytes, attempts0 and no payout. Destination code
pins and exact mint/escrow/recipient/configuration/reserve snapshots remain
unchanged. Both copies stop, originals stay unchanged, five guards pass locally
and on Linux, and six code-comparison regressions pass locally. This refusal
does not approve a compatible migration or prevent later authority action.
See [the origin-code result](../evidence/bridge-metadata-origin-code-agave.json).
