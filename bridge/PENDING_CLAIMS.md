# Private bridge-claim recovery journal

`pending-claim.mjs` implements native release and original-token redemption
in a private rehearsal workflow. It never creates keys, signs, broadcasts, requests a new blockhash
or builds a replacement transaction. Both RPCs must be explicit loopback
endpoints; known public chains and the live Classic devnet are refused.
This is not a production relayer or a signing/custody service.

## Interface

- `preparePendingClaim(...)` accepts one already signed legacy claim
  transaction and its independently selected expected event. It verifies all
  signatures, canonical bytes, the exact programme/instruction/accounts,
  chain identities, source event PDA and checkpoints. A receipt-derived ID
  makes the operation unique even if a caller tries to change message bytes.
  The first record is exclusive; existing records are never overwritten.
- `takeSubmissionAttempt(directory, id)` checks destination genesis, expiry,
  an absent receipt, configuration/precision/committee, and a fresh
  finalized source observation. It durably records the attempt **before**
  returning the existing signed bytes. It will not hand them out again.
- `reconcilePendingClaim(directory, id)` reads the same signature, finalized
  receipt and exact transaction. Finalization requires the recipient's native
  balance increase and reserve's decrease to match the event's exact converted
  amount. Original redemption instead requires exact escrow/recipient token
  debits/credits, matching mint/owner/programme/decimals metadata, and no hidden
  native movement in those vault/recipient accounts. Rechecking genesis and a nondecreasing destination checkpoint guards
  restart/endpoint replacement during observation.

Caller code is responsible for submitting only the returned bytes to the
returned private RPC, at most once. This module contains no broadcast method.
On-chain receipt protection remains necessary even with a journal. A caller
with custody can bypass a client tool; reviewed production controls must
address that authority and the integrity of durable storage.

The prototype restricts the rent/fee payer to an address separate from the
recipient and committee, uses exactly three distinct configured co-signers,
and accepts one claim instruction with no extra transfers. Original redemption
also requires a canonical Token-2022 recipient ATA and token accounts that are
plain or carry only ImmutableOwner. Versions1/2 admit only plain82-byte immutable
mints for original redemption. Explicit version3 adds the narrow reviewed
metadata policy described below. Shared payer accounting, versioned messages
and extra instructions remain unsupported.

## Durable state and uncertainty

The directory must be real/canonical and private (mode0700); records and locks
are mode0600. Writes use exclusive files, file fsync, atomic rename for updates
and directory fsync. An exclusive per-operation lock stops concurrent callers.
Signed bytes and raw journal files remain private; public summaries contain
only programme/receipt IDs, signature, hashes, state and attempt count.

If the client crashes after the attempt marker but before submission, that
operation is ambiguous. It must be reconciled; the API does not authorize a
fresh attempt merely because no signature is currently visible. Expiry alone
does not prove that an earlier transaction never landed. A consumed receipt
without the matching transaction's economic evidence is marked for review.
RPC failure or conflicting evidence preserves the current record. A known
finalized operation cannot silently regress to pending on a later RPC.

Stale `.lock` or `.new` files after a crash require operator review. First
establish exclusive ownership and preserve the record, then inspect the exact
signature/receipt; do not automatically clear files or reset the attempt state.
The tool is not an encrypted wallet. It holds no private signing keys, but
signed transaction bytes must still stay out of source and web deployments.

## Verification scope

```sh
node --test bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs
```

Twenty-three filesystem/transaction/RPC-fixture checks cover private persistence,
exact signatures and instructions, duplicate domains, public/soaking identity
guards, outage recovery, expiry, pruning, conflicts and economic reconciliation.
Fixtures do not establish two-chain finality or production readiness.

The separate `bridge/rehearsal/pending.mjs` and `engine/rehearsal/pending.py`
harness passed six actual private-ledger checks: a new synthetic source lock,
private prebroadcast journal, one native claim broadcast, actual destination
RPC outage/restart, original-signature economic reconciliation and matching
700,000-unit bridge counters. Its fault orchestrator deliberately waited for
chain finality while the client journal remained unconfirmed. This establishes
recovery of a landed pending operation, not unknown landing, an expired
transaction, a fork, a hard crash, independent operators or security review.
See [the exact uploaded source hashes and result](../evidence/bridge-pending-recovery.json).

The original-token redemption subsequently passed a separate six-check actual
private-ledger drill: one native return, one journaled redemption, actual
origin RPC outage/restart and same-signature/token-delta recovery. Escrow and
both counters reconcile at 600,000 origin units; the original user has 1,400,000
units. See [redemption evidence](../evidence/bridge-redemption-recovery.json).
Its fault harness also waited for finality before outage; unknown landing,
expiry/pruning and actual fork testing remain open. Earlier native evidence
retains its historical source hashes. Shared native regression tests pass.

RPC native balance metadata now uses raw JSON source digits and exact u64
BigInt balances in `lossless-native-rpc.mjs`; Node24 source support is mandatory. An
attempt count is a conservative no-resubmission marker, not a measurement of
network broadcasts. The actual rehearsal separately records its one broadcast.

Production still needs a durable signer/custody service,
enforced production programme/upgrade policy, independent source-transaction/backing
verification, crash-safe storage recovery, independent verifiers and review.
See [the finality policy draft](FINALITY_RECOVERY.md).

## Mandatory programme pins for new private claims

`preparePinnedPendingClaim(args)` prepares a version2 journal. Supply
`programmePins: {source, destination}` with each exact reviewed pin schema
from `program-pins.mjs`. Both sides must bind the signed event's chains,
programmes, bridge, direction and original mint. Canonical policy bytes are
domain-separated and hashed before the first exclusive, fsynced write.
This is a new private rehearsal API, not an approved production configuration.

`takePinnedSubmissionAttempt(directory,id)` refuses legacy records. For
version2 records, the older `takeSubmissionAttempt` entry also enforces pins;
choosing that entry cannot skip the committed policy. Historical version1
rehearsals remain readable through their original interface. They do not gain
pin acceptance retrospectively, and cannot declare unenforced pin metadata.

While holding the receipt lock, handoff checks both deployed programmes twice
before source-event admission and twice afterward. Each observer verifies the
derived loader-v3 ProgrammeData pointer, complete account hash, exact ELF and
zero unused capacity, explicit upgrade authority or immutability, and static
bridge configuration hash. Epoch, decimals, settlement pause and the full
five-key committee must agree with the signed claim and both sides. Receipt,
configuration, original-token account and source-event reads use nonregressing
finalized checkpoints. Finalized block height and absent receipt are checked
again before recording the single attempt and returning existing signed bytes.
The journal saves only public observation metadata alongside its private signed
bytes. This module still cannot sign, replace a transaction or broadcast.

The original preparation checkpoint is retained separately from later recovery
checkpoints. Advancing recovery does not invalidate the saved admission.
An expiry observed before any handoff remains inspectable with no fabricated
pin admission and cannot authorize a new attempt. Failed admission preserves
the original journal bytes. Eighteen new synthetic filesystem/transaction/RPC
tests cover both directions, late upgrades/policy changes, expiry, receipts,
concurrency, input/record corruption and later reconciliation. With previous
journal/parser/pin/review regressions, 82 checks pass locally. No new Agave
handoff or real bridge transaction was executed for this integration.

These checks bind the code observed at handoff time. They cannot prove the
source event was originally executed by that code or stop an authorized
upgrade after the last observation. A local writer with journal access or a
signer with custody can bypass client controls; the policy hash is not a
signature authenticating durable storage. Production needs reviewed immutable
deployment or upgrade custody, signing enforcement, authenticated operators,
independent history/backing verification and external security review. The
combined pinned-journal path still needs its own private-ledger drill. Earlier
standalone real programme-pin and crash results keep their historical hashes.
Future private uploads of `pending-claim.mjs` must also include its sibling
`claim-pin-policy.mjs`, `program-pins.mjs`, `sdk.mjs` and
`lossless-native-rpc.mjs`, with every uploaded dependency hash recorded. Do
not patch retained passed attempt directories to update their dependencies.

```sh
node --test bridge/pinned-pending.test.mjs bridge/program-pins.test.mjs \
  bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs \
  bridge/pending-large-native.test.mjs bridge/lossless-native-rpc.test.mjs \
  bridge/observer-reports.test.mjs bridge/expired-review.test.mjs
```

## Exact large-native RPC metadata

The journal now reads `getTransaction` native balances from original JSON
decimal digits using Node24 reviver source support and checked u64 BigInt.
Values above Number precision, including the u64 maximum, remain exact.
Canonical nonnegative integer numeric tokens and exact signed-account counts
are required; fractional/exponent/string/null/overflow metadata rejects.
Other finality/expiry fields retain the existing safe-number guards.

Thirty-three checks pass: five parser, five large-balance journal scenarios
(including actual loopback HTTP with synthetic replies), and 23 original
two-direction regressions. A one-unit incorrect delta above Number precision
cannot finalize or reset a submission attempt. No new real-ledger claim or
reconciliation is claimed; previous private rehearsal evidence retains its
historical source hashes. Include `lossless-native-rpc.mjs` in future private
journal uploads. See `evidence/bridge-lossless-native-metadata.json`.


## Real-ledger exact-metadata journal verification

Ten checks now pass on fresh cold copies of the stopped V1 ledgers and copies
of both retained finalized journals. The current client reconciles the original
native claim and original-token redemption signatures, signed bytes, receipts
and economic deltas. Actual fee-payer metadata around 499999997000000000 native
base units stays exact. A one-unit altered native balance rejects in each
direction; journal bytes stay unchanged and another handoff remains forbidden.
Zero broadcasts, no new signed transactions, both copied validators stopped.
Original stopped-ledger inventories and original journals remain unchanged.

The first attempt returned no native transaction history and stopped admission;
its copied processes were shut down. A separate fresh attempt returned both
original transactions. This does not establish permanent pruning, exercise a
real competing fork or test unknown landing. Existing local missing-history
guards still apply. See `evidence/bridge-retained-journal-reconciliation.json`
for actual source hashes, signatures and scope; 33 client and nine worker/copy
checks also pass. Preserve both private attempt roots, never replay/reset them.
Production custody/code pins, independent finality/backing and security review
remain separate release gates.


## V2 claim crash before observed finality

Seven checks pass on new private ledger copies with one new synthetic
10000-origin-unit lock (nonce4) and one journaled native-claim broadcast.
Immediately afterward, the fault harness observed the claim confirmed at
slot690 while the finalized root was659, then killed only the pinned copied
destination process with SIGKILL (actual exit-9). It did not wait for claim
finality. The client journal remained submission-attempted during the outage,
kept its original signed bytes/signature and refused another handoff.

After same-genesis restart, the original claim finalized. Current exact-u64
metadata verifies the transaction and10000000-native-unit payout; both
counters and source escrow equal1960000, original user40000. The reserve
is42000000 native units with its2000000 floor and bootstrap record unchanged.
All three copied process starts stopped; original cold-restored ledgers and
fixture input remain unchanged. Nine worker/copy guards and33 journal/parser
regressions pass. See `evidence/bridge-v2-pending-crash.json`.

This adds a pre-finality native-claim process-crash case to the earlier
known-finalized drills. It does not test original-redemption pending faults,
a competing fork or physical host failure. The runner's expired-unresolved
branch was not exercised: this attempt recovered FINALIZED. Hypothetical
budget/global-backing gates remain false, and independent custody/verifiers,
code pins, full validators and security review remain required. Preserve
`/data/bridge-v2-pending-crash-v1`; never rerun/reset it. Future drills need
new copies and new nonces.


## V2 original-redemption crash: actual expiry guard

Seven actual checks pass on new V2 copies after one native return and one
original redemption broadcast. No withdrawal signature status was observed
before copied-origin SIGKILL(-9), with processed944/finalized913. After
same-genesis restart the original withdrawal remained EXPIRED_UNRESOLVED:
no token payout, second handoff, replacement, refund or counter reset. This
is a passed expiry guard, not successful redemption recovery. Its finalized
branch was not exercised. See `evidence/bridge-v2-redemption-crash-expiry.json`
and `bridge/EXPIRED_RECOVERY.md` for unimplemented manual recovery policy.

Escrow/counter1960000 equals native outstanding1950000 plus pending original
redemption10000; original user40000, native reserve52000000/floor2000000.
Bootstrap record unchanged. All3copy starts stopped; original ledgers/input
and prior native journal unchanged. 33journal/parser+4worker+6copy checks
pass; all41frozen hashes match. Source return10000000 credits reserve;
event rent2958000 separately raises sender debit to12958000, with a separate
network fee payer. This is synthetic-chain rent, not a production fee quote.

First v1 attempt failed an assertion omitting that rent after one source
return, before any withdrawal broadcast. It is preserved/stopped with nonce5.
Passed `/data/bridge-v2-redemption-crash-v2` uses nonce6 on NEW copies of the
previous native-settlement baseline. Never replay/reset either attempt or
reuse nonces5/6. Successful pending original redemption, actual competing
forks, custody/code pins, independent verification, funded complete backing
and security review remain release gates.


## Actual combined pinned-journal integration

Eight checks now pass on fresh private source-built Agave copies. Two source
events and two pinned-journal settlements finalized, with exact native release
and original-token redemption. Six deliberately wrong expected code/authority/
policy pins refused handoff against real accounts and preserved prepared
records/economics. Both original signatures reconcile once; later checkpoints
retain admission metadata and repeated handoffs refuse. Final escrow/counters
1950000, original user50000, reserve52000000 and floor2000000 return to the
selected baseline, with bootstrap record unchanged. Both copies stopped and
original ledger/input/journal hashes match. Three worker and six copy guards
also pass. See `evidence/bridge-pinned-journal-agave.json`.

The first attempt refused a checkpoint-bound RPC request before any broadcast.
Its two processes stopped, zero-transaction outcome and executed source are
preserved. Fresh v2 waits for finalized roots to reach the retained pin
checkpoints; no checkpoint was lowered. Preserve both attempt roots. This
known-finalized functional round trip does not test an actual code upgrade,
new crash/fork, physical power loss or production custody. Complete funded
backing, independent operators/verifiers and security review remain open.


## Isolated authority-change admission rehearsal

`rehearsal/authority-change.mjs` and
`../engine/rehearsal/authority_change.py` prepare a separate, fresh copy of the
stopped V2 synthetic ledgers. They preserve the original ledgers and journals.
The runner admits the retained finalized checkpoints and exact historical
programme pins before creating one new source lock with unused nonce10.

A version2 native-claim journal is prepared before either authority changes.
The native programme authority is then changed with Loader-v3's checked
instruction, signed by both old and new fixture authorities. The same process
is repeated for the source programme. Each change must finalize and alter only
the authority bytes in ProgramData: the executable and its remaining bytes
must stay identical. The old reviewed pins must refuse observation and claim
handoff, while the prepared journal, receipt absence, escrow, counters, reserve
and bootstrap record remain unchanged. No settlement is broadcast. The pending
source-lock liability remains recorded rather than being refunded or erased.

This runner does not rotate production authorities, upgrade programme code,
retry a retained event, or approve new pins after a change. Fixture authority
keys stay on the private worker. Both copied validators must stop and original
cold inventories, fixture and finalized journal hashes must still match before
exporting a passed result. Execution results are recorded separately; source
and local guards alone do not establish an actual authority-change result.


Seven actual private-ledger checks now pass. Both checked authority rotations
finalized, and each blocked the original prepared claim without changing its
journal or bridge economics. There was one new synthetic source lock, two
authority-change broadcasts and zero settlement broadcasts. Both copied
validators stopped; original ledger, fixture and finalized journal hashes
match. The10000-origin-unit pending liability is retained. See
[the actual result](../evidence/bridge-authority-change-agave.json).
This adds actual authority-change coverage to the earlier wrong-expected-pin
tests. Programme-code upgrades, competing forks, independent operators,
production custody and complete funded backing remain separate requirements.


## Version3 reviewed metadata claim records

`prepareReviewedPendingClaim(args)` requires both `programmePins` and a separately
selected `reviewedMintPolicy`. It binds exact mint bytes, original supply and
precision, complete origin bridge policy/code and Token-2022 code/authority
pins to the signed event before exclusively writing a version3 record. The
older preparation APIs refuse this new option rather than silently ignoring it.
No old record is upgraded or retrospectively granted metadata admission.

`takeReviewedSubmissionAttempt(directory,id)` requires version3. All three
handoff entry points enforce its retained review. Before returning the existing
signed bytes once, the journal observes the original mint/escrow/counters twice,
with complete code checks and nonregressing finalized contexts on the correct
chain. Selected mint bytes and supply must match, escrow must cover outstanding
obligations, and obligations must cover the claim. Original-redemption recipient
and authority checks remain in force. Final programme observations bracket the
mint checks, followed by late expiry, receipt and genesis checks.

A compact admission record is persisted with the single-attempt marker. Missing
or altered policy/admission data refuses inspection. Expiry, outage, missing
history and receipts cannot authorize another attempt. An exact finalized
transaction found without this reviewed handoff is retained as
`CONSUMED_REVIEW_REQUIRED`, rather than finalized as reviewed settlement.

16 new synthetic filesystem/transaction/RPC checks cover both directions,
changed metadata/token code, depleted escrow, old-entry bypass attempts,
policy mutation, record tampering, recipient controls, concurrency and recovery
states. Together with existing journal, code-pin, expiry-review and exact-balance
regressions,145 JavaScript checks pass. Seven existing worker guards also pass.
The socket-based regression uses an actual loopback HTTP server with synthetic
responses. These checks do not execute a new Agave metadata settlement or crash.
See [the scoped local result](../evidence/bridge-reviewed-journal-local.json).

This remains a private prototype. The policy digest is integrity binding, not
authentication. Trusted durable storage, approved custody/signers, independent
history/finality/backing verification and external security review remain
required. Actual two-chain metadata settlement and known-finalized restart
recovery are recorded separately below; further expiry/fork testing remains pending.
Earlier read-only and plain-mint proofs retain their original scope and hashes.
Future private uploads must include every transitive metadata/policy observer
dependency and record its exact hash. Never patch a retained attempt to update it.

```sh
node --test bridge/reviewed-pending.test.mjs bridge/pinned-pending.test.mjs
```


## Fresh metadata settlement and restart harness

`rehearsal/metadata-journal.mjs` with
`../engine/rehearsal/metadata_journal.py` prepares two fresh private, loopback-only
source-built ledgers. It creates one immutable synthetic metadata mint, selects
complete genesis code pins, and runs one version3 lock/native-release/return/
original-redemption round trip. Wrong selected mint digest and token-code pins
must refuse handoff in both directions while retaining journal/economic state.

Each signed setup/source transaction is retained privately before its sole
submission attempt; claim bytes are handed out through the existing journal.
The harness reconciles finalized signatures before stopping each destination
in turn. With that RPC unavailable, reconciliation must fail without changing
the saved record or allowing retry. Same-ledger restart must verify the original
signature, receipt, review admission and exact economic deltas again. This is
known-finalized restart recovery, not a pre-finality crash or fork test.

The driver reserves the attempt before generating disposable keys. Each client
phase has an exclusive durable marker; existing results and phases cannot be
replayed. Both processes must stop. Four local guards verify worker identity,
new-ledger/restart command separation, finalized readiness and retained-attempt
refusal. Execution results are recorded separately; source/guards alone do not
establish actual settlement, recovery or production readiness.


Ten actual checks now pass on two fresh source-built Agave3.0.14 private ledgers.
The immutable metadata mint and setup finalize, followed by one source lock,
one version3 native release, one native return and one version3 original-token
redemption. Four wrong reviewed-mint/token-code handoffs refuse against actual
accounts without changing prepared journals or bridge economics.

Each finalized journal survives an actual destination RPC outage unchanged;
same-genesis restart then reconciles its original signature, receipt, exact
movements and retained review admission. Another handoff remains forbidden.
Tracked escrow, both counters, original token balance, native reserve and floor
return to their initial values. User event rent and payer fees are separate
from those bridge-accounting checks. All four process starts stop with SIGINT;
application-level graceful flushing is not claimed. Four worker guards pass
locally and on Linux. See [aggregate evidence](../evidence/bridge-metadata-journal-agave.json).

This known-finalized restart result does not verify a metadata claim interrupted
before finality, a competing fork, physical host loss, independent operators,
complete genesis backing or production custody/security. No previous private
ledger or journal was opened, reset or replayed. Private keys, signatures,
policies, balances and raw ledgers stay out of this public evidence.


## Metadata native-claim pre-finality fault harness

`rehearsal/metadata-pending-crash.mjs` and
`../engine/rehearsal/metadata_pending_crash.py` prepare new cold copies of the
completed metadata round-trip fixture. Original ledgers, both finalized journals,
review policy and private inputs must retain their complete hashes. The copied
client uses the retained version3 code/mint review and an unused source nonce;
no earlier source event or signed settlement is replayed.

One new source lock must finalize, followed by one reviewed native-claim handoff
and one submission. The fault harness refuses an already-finalized claim and
requires the exact copied destination process before SIGKILL. Its last observed
signature status and processed/finalized slots are retained privately. The
journal must remain unchanged while RPC is unavailable and must refuse another
handoff. Recovery may accept only the original finalized signature/economic
movement or retain `EXPIRED_UNRESOLVED` with no payout, replacement or refund.
The source obligation and protected reserve floor remain recorded in either case.

Five local guards cover worker identity, completed baseline/code/accounting,
process/finality selection, nonresetting copied startup and attempt replay.
Six existing stopped-ledger copy guards also pass. Actual execution is recorded
separately; source and these guards alone do not verify a real pending fault.
This harness covers the native-release direction, not pending original redemption,
a competing fork, physical host loss or production custody/security.


Seven actual checks now pass for this metadata native-claim fault. One new
source lock finalizes on fresh private copies, and one version3 native claim
is submitted without waiting for destination confirmation. The fault harness
observes the signature as confirmed above the finalized root, then kills only
the copied native destination with SIGKILL (exit-9). During the actual outage,
the attempted journal remains unchanged and another handoff refuses.

After same-genesis restart, the original signature, receipt and exact native
payout reconcile as `FINALIZED`. The original signed bytes and complete review
admissions remain intact. Source escrow/obligation and the protected reserve
floor remain correct. All three copied process starts stop; complete original
ledger inventories, fixture/review inputs and both previous finalized journals
remain unchanged. Five worker guards pass locally and on Linux; six local
cold-copy guards also pass. See
[the aggregate result](../evidence/bridge-metadata-pending-crash-agave.json).

This attempt exercised successful native-claim recovery after a process kill
before observed finality. Its expiry branch was not exercised. The separate original-metadata redemption
fault below now covers that direction. Actual competing forks, physical host loss, independent
verification, complete funded backing and production custody/security remain
open. Private addresses, signatures, policies, balances, keys and ledgers remain
excluded from the public result. Never replay or reset this retained attempt.


## Metadata original-redemption pending-fault harness

`rehearsal/metadata-redemption-crash.mjs` with
`../engine/rehearsal/metadata_redemption_crash.py` prepares new cold copies of
the completed metadata native-claim recovery fixture. The original complete
ledgers, review inputs and finalized native-claim journal must stay unchanged.
An unused native-return nonce funds one new original-token withdrawal. The
version3 journal retains the previous complete mint/code review; it cannot
inherit a new policy from the endpoint during submission.

The harness submits once without waiting for withdrawal finality. Its fault
controller requires the exact copied origin process and refuses an already
finalized operation before SIGKILL. RPC outage must preserve the attempted
journal and block another handoff. Same-genesis recovery must either reconcile
the original signature and exact token movement or retain an expired unresolved
withdrawal with no token payout, native refund, replacement or attempt reset.
Native return backing, escrow obligations and the protected floor must remain
accounted for. Source-event rent is checked separately from returned value.

Five local guards verify the completed baseline, worker/process selection,
checkpoint/startup controls and retained-attempt refusal. Actual execution is
recorded separately. These guards alone do not establish pending redemption,
a competing fork, physical host failure or production custody/security.


Seven actual checks now pass for metadata original redemption on new private
copies of the completed native-claim fault fixture. One native return finalizes
with its event rent checked separately, then one version3 withdrawal is submitted
without waiting for destination confirmation. The copied origin is killed with
SIGKILL (exit-9) before observed withdrawal finality. During the RPC outage,
the attempted journal stays unchanged and another handoff refuses.

After same-genesis restart, the original signature, receipt and exact token
escrow debit/recipient credit reconcile as `FINALIZED`. Recipient native balance
stays unchanged. Original signed bytes and programme/mint review admissions are
retained. Both counters and escrow return to zero, the original token balance
is restored and returned native value stays in the reserve above its protected
floor. All three copied process starts stop; complete original ledger inventories,
review inputs and the previous finalized native journal remain unchanged. Five
new guards pass locally and on Linux. See
[the aggregate redemption result](../evidence/bridge-metadata-redemption-crash-agave.json).

Both metadata settlement directions now have separate successful private
process-kill recovery cases before observed finality. This redemption attempt's
expiry branch was not exercised. Deliberate expiry/pruning, actual competing
forks, physical host loss, independent verification, complete funded genesis
backing and production custody/security remain open. No private fixture identity,
signature, policy, balance, key or raw ledger is included in the public record.
Never replay or reset either retained fault attempt.


## Actual-height expiry without submission

`rehearsal/metadata-unsubmitted-expiry.mjs` and
`../engine/rehearsal/metadata_unsubmitted_expiry.py` use new cold copies of the
completed metadata original-redemption fixture. An unused source lock finalizes,
then a fully signed version3 native claim is prepared without a handoff or
submission. The harness waits for actual destination finalized block height to
exceed the original signed transaction's last-valid height. It does not change
expiry, advance a clock, warp the ledger or fetch a replacement blockhash.

Eight actual checks pass. The prepared journal stays byte-identical until
reconciliation; all three handoff APIs refuse it after expiry. Reconciliation
retains `EXPIRED_UNRESOLVED` with conservative attempts1, unchanged signed bytes
and original expiry. No programme or mint handoff admission is fabricated.
All three APIs refuse again. No claim signature, transaction or receipt lands;
source escrow and its obligation remain, with no recipient payout, retry,
replacement or refund. Both copied validators stop; complete original ledgers
and finalized private records stay unchanged. Five admission guards pass locally
and on Linux. See [the aggregate expiry result](../evidence/bridge-metadata-unsubmitted-expiry-agave.json).

This is deliberately unsubmitted native-claim expiry, with zero claim handoffs
or broadcasts. It does not verify unknown landing, original-redemption expiry,
pruned history, competing forks or a recovery/refund procedure. The unresolved
source liability must remain retained for review. Earlier process-fault results
keep their original scope. Production backing, custody and independent security
verification are still required.


## Unsubmitted original redemption at actual expiry

A separate original-token redemption now passes8 actual checks on fresh cold
copies of the completed metadata native-claim fixture. An unused native-return
event finalizes with value and event rent checked separately. A signed version3
original withdrawal stays PREPARED without handoff or submission until actual
origin finalized block height exceeds its original signed expiry.

All three handoff APIs reject with unchanged prepared bytes. Reconciliation
retains EXPIRED_UNRESOLVED, original signed bytes/expiry and conservative
attempts1 without inventing review admissions; all three APIs then refuse again.
No withdrawal signature, transaction or receipt lands. Original tokens remain
in escrow with the original obligation, returned native backing remains in the
reserve, and the recipient's token/native balances do not increase. No retry,
replacement, token payout or native refund is authorized. Both copied validators
stop; complete original ledgers and finalized private records remain unchanged.
Five new guards pass locally and on Linux. Source and aggregate scope are in
[the original-redemption expiry result](../evidence/bridge-metadata-redemption-expiry-agave.json).

Both deliberately unsubmitted metadata settlement directions now have separate
actual-height expiry cases. These are refusal tests, not successful redemption
or unknown-landing recovery. Submitted-but-uncertain expiry, pruned history,
competing forks, manual recovery, funded backing, custody and independent
security review remain open. All unresolved private obligations stay retained.


## Actual metadata-origin code replacement

A separate8-check private-copy rehearsal now replaces the origin bridge's code
after preparing an unused metadata native claim. Six one-shot buffer setup
transactions stage a reviewed small counter ELF for an intentionally incompatible
replacement. One new source lock finalizes under the original bridge code, then
its version3 claim retains the selected metadata and two-chain code review.
One actual Loader-v3 origin upgrade finalizes; the same authority, ProgramData
capacity and rent remain, while the deployed ELF and complete code data change.
Native destination code pins still match.

All three handoff APIs reject the old origin code pins while the signed claim
is still unexpired. Prepared bytes and selected review stay unchanged, attempts
remain0, no handoff or claim is broadcast, and no destination signature,
transaction or receipt lands. Complete mint, escrow, token-recipient, both
configuration and native-reserve snapshots stay unchanged after the upgrade.
The source obligation remains without payout, refund or retry. Both new copies
stop; complete original ledgers and private finalized records stay unchanged.
Five guards pass locally and on Linux; six upgrade-observation checks pass
locally. See [the aggregate origin-code result](../evidence/bridge-metadata-origin-code-agave.json).

This is rejection of one deliberately incompatible origin replacement in a
private metadata fixture, not an approved bridge migration. It does not prevent
an authority from upgrading code or eliminate a change after a signing snapshot.
Compatible upgrades, rollback governance, forks, funded backing, custody and
independent security review remain production gates. The replacement is never
approved for settlement and the retained prepared claim must not be retried.


Offline authenticated expiry review now rejects a caller code-policy hash that
differs from a retained version2/version3 journal, even if synthetic reports are
otherwise correctly signed. Version3 mint review is bound through verified
inspection and the journal hash; legacy supplied pins are labelled unbound.
Three new regressions and six retained-journal offline checks pass, with no RPC,
validator starts, transactions or enabled retry/refund. See
[the review boundary](EXPIRED_RECOVERY.md) and
[the aggregate offline result](../evidence/bridge-metadata-expiry-review-offline.json).

## Selected pending-liability accounting

A separate offline inventory can sum explicitly selected pinned journals in
both directions while preserving expired, failed and uncertain liabilities.
It does not save records, enable recovery or prove complete history/backing.
Read [the exact input contract and limitations](PENDING_INVENTORY.md).
