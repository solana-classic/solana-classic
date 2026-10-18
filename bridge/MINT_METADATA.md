# Immutable metadata-mint inspection and private observation

`inspectImmutableMint` is a pure byte inspector. It makes no RPC request,
accepts no key, reads no journal and cannot sign, submit or authorize a bridge
operation. It is preparation for [metadata admission review](https://github.com/solana-classic/solana-classic/issues/2).

The private read-only origin observer can explicitly select
`mintPolicy: "immutable-self-metadata-v1"`. Its default remains `plain`, which
rejects extended mints. Versions1/2 of the claim journal retain plain-mint
original-redemption admission. Explicit version3 now binds this narrow reviewed
metadata policy in a private prototype. A fresh two-chain Agave rehearsal now
verifies both metadata settlement directions and known-finalized restart
recovery. No bridge is enabled on mainnet or the public website. Successful inspection
does not establish origin backing, reserve custody, independent finality or
production readiness.

## Selected layout

Input is a Buffer of at most4096bytes and a canonical nonzero mint address.
An initialized unextended82-byte mint is accepted only with no mint/freeze
authority and precision no greater than9. Supply remains an exact u64 string.

The extended policy accepts only the pair MetadataPointer(type18) and
TokenMetadata(type19). It requires zero mint padding, the mint account-type
byte, exact TLV lengths, unique supported types, an immutable self-pointing
metadata pointer, no metadata update authority and metadata bound to the
selected mint. Other extensions, including transfer fees, transfer hooks,
permanent delegates, scaled balances and pausing, are refused.

Strings are strict UTF-8 with byte bounds: name256, symbol32, URI2048,
additional keys128 and values512. At most8additional fields are admitted;
duplicate keys, truncated data and trailing bytes are rejected. Metadata URIs
are decoded as text and never fetched. The policy intentionally rejects valid
Token-2022 layouts outside this narrow selection, including spare TLV padding.
It is stricter than the current on-chain prototype's extension allowlist.

The caller must separately verify account owner/executable status, chain
identity, source freshness, selected supply, escrow/control, complete token and
bridge code pins and all settlement rules. This inspector cannot supply those
guarantees. Do not treat metadata labels as proof of token identity or authorship.

## Verification

```sh
node --test bridge/mint-metadata.test.mjs bridge/origin-assets.test.mjs bridge/origin-token-code.test.mjs bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs
```

12 decoder checks use the existing pinned SPL Token0.4.15 and Token Metadata0.1.6
SDKs as serialization/decoding oracles. Seven new observer checks exercise
explicit selection, unchanged defaults, authority/layout refusals, changing
metadata, chain restrictions and token-code bracketing. Related observer and
both-direction journal regressions pass, for70checks total including the eight
reviewed-policy checks described below. Observer fixtures
use synthetic RPC responses, not a running ledger. The workflow requires no
production secrets or chain endpoint.

The observer retains exact selected supply/precision, a fixed165-byte escrow,
complete bridge and optional token-code pins, nonregressing finalized contexts
and identical asset bytes between reads. Metadata bytes are included in that
comparison. Other mint extensions and all escrow extensions remain refused.
See [the earlier scoped local result](../evidence/bridge-metadata-observer-local.json).

An actual415-byte public SOC mint snapshot requested with finalized commitment
also passes offline inspection. Its exact slot/data hash and read-only scope
are in [the inspection record](../evidence/bridge-metadata-inspection.json).
This is one selected RPC observation, not independent consensus verification.

Before live settlement admission: review the explicit version3 claim/redemption
admission, complete expiry-branch and competing-fork checks,
retain negative controls and obtain independent security review. The earlier plain-mint ledger result does not verify this
metadata option. Issue2remains open for that wider work.

## Fresh private Agave origin

Seven actual checks now pass on one fresh source-built Agave3.0.14 ledger.
Four valueless fixture transactions create an immutable metadata mint, initialize
its bridge escrow, enable source locks and finalize one source lock. Settlement
stays paused. The observer verifies the actual metadata layout, exact supply,
escrow/counter equality and full bridge/Token-2022 code pins. The default plain
policy, wrong supply/precision and wrong complete token-code pin reject.

The observer makes65 read-only RPC requests. A fresh observation retains exact
asset bytes after the negative checks. The private validator stops with SIGINT;
no existing ledger is copied or opened and no settlement is broadcast. Four
local admission guards cover worker identity, isolated startup, public-chain
refusal and retaining an already-reserved attempt. Source hashes and exact
scope are in [the private-origin result](../evidence/bridge-metadata-origin-agave.json).

This is one synthetic origin and a read-only observer result. It does not
verify metadata settlement, a two-chain round trip, recovery, full-validator
consensus, funded backing or independent custody/security review. The private
fixture and its source obligation remain retained; never replay or reset it.

The separate [reviewed origin policy](REVIEWED_ORIGIN_MINT.md) now binds exact
selected mint bytes and original supply to complete code pins. Eight new local
checks and five actual read-only private-copy checks pass. This stricter
observation is separate from the new version3 private journal integration. Its
16 new local checks and145 combined regressions do not establish actual
metadata settlement or production admission by themselves. A later, separate
10-check actual two-chain/restart rehearsal is recorded in
[the metadata journal proof](../evidence/bridge-metadata-journal-agave.json).
See [journal scope](PENDING_CLAIMS.md).


A separate7-check actual metadata native-claim fault now verifies one original
signature/payout after destination SIGKILL before observed finality, with review
admissions retained and retry blocked. The original fixture stays unchanged.
That proof covers native release only. A separate original-redemption fault
now passes7 actual checks with the original signature and exact token payout
recovered after copied-origin process kill. Neither case verifies a competing
fork or an expiry branch. See
[the redemption result](../evidence/bridge-metadata-redemption-crash-agave.json) and
[the scoped fault result](../evidence/bridge-metadata-pending-crash-agave.json).


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
