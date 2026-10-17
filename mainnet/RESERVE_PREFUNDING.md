# Native reserve prefunding review

The earlier synthetic genesis puts its reserve in an ordinary system account.
The V2 bridge's existing initializer also supports a funded, empty system
account at its exact vault PDA. This review tests that narrower alternative
with the unchanged compiled programme in fresh in-memory SVMs. It does not
create a new genesis, transfer the old reserve or upgrade any retained ledger.

## Proposed custody transition

The selected bridge programme and bridge identifier derive a configuration PDA,
then `vault` plus that configuration derives the native reserve PDA. These seeds
do not include the genesis hash: a future planner can select the address before
genesis compilation, then initialize policy with the resulting chain identity.
The current rehearsal preparer has not been changed to use this construction. Before
initialization, the proposed reserve account has that address, System owner,
empty data and the selected funded balance. Its address is off-curve: an
ordinary keypair cannot supply its signature. This is not an assertion that the
account is unspendable; the selected programme can supply its PDA signature.
Programme upgrades remain a material custody control before and after setup.

The existing initializer requires the current upgrade authority, epoch1,
zero outstanding/daily counters and both pause flags. It allocates and assigns
the funded vault using the programme's PDA signature. A reserve already above
rent needs no top-up: its balance remains exact, owner becomes the bridge and
data becomes the16-byte `SCVLT002` layout with the actual rent floor. Config
rent and transaction fees are separate payer costs. A below-rent vault would
require additional payer funding; that case cannot inherit a budget assuming
balance preservation.

This removes the need for a separate ordinary reserve key in that proposed
construction. It does not protect against malicious replacement code or a
committee attesting false backing. The current quorum can change pause flags;
paused initialization alone is not an enforced full-bootstrap release gate.
Production must still require reviewed bootstrap, final source backing, reserve
and upgrade custody, complete accounting and an explicit release decision.

## Compiled-program scenarios

Three new groups in `bridge/program/tests/runtime.rs` exercise:

- Exact funded balance preservation, System-to-programme owner transition,
  V2 bytes and actual rent floor, zero counters and paused configuration.
  Reinitialization refuses without changing the saved vault/configuration.
  Missing PDA signatures refuse direct System withdrawals before and after
  initialization, with the selected vault unchanged.
- Wrong authority and wrong vault address, including rollback of a config
  allocation performed before the later address check. Neither the selected
  reserve nor the substituted funded account changes.
- A foreign-owned or already allocated account at the selected PDA. Both
  refusals leave reserve bytes, owner and balance unchanged and config absent.

The tests inject synthetic accounts and use fresh ephemeral in-memory keys.
They neither read retained keys nor open a raw ledger. Token-2022 and V2 SBF
artifacts must match their existing reviewed SHA256 values before execution.
The bridge implementation and state source are unchanged from those artifacts.
The locked runtime dependency graph requires Rust1.89.0. The separate CI job compiles the scenarios; it does not claim SBF execution
without those retained artifacts. Actual worker execution has its own result.

## Remaining complete-genesis gate

A future genesis would need a newly reviewed reserve allocation to the selected
PDA. Do not change the retained on-curve genesis or describe the in-memory
injection as an actual genesis result. All account allocations, stake/vote
withdrawal controls, setup fees/rent and every original-backed native unit need
full reconciliation. After initialization, owner/data and config accounts have
changed: never reuse the pre-initialization inventory digest as a fresh complete
activation inventory. No protected bootstrap floor or consumed backing receipt
is established by initialization alone.

A capable Linux host is still required for genuine full-validator execution,
complete activation-bank inspection, consensus/recovery and strict historical
blockstore inspection. No host checks are reduced by these in-memory tests.
No production reserve, native SOC or live bridge is activated.


## Retained worker result

All three new groups passed on the separate Linux worker using Rust1.89.0 and
the unchanged lockfile. The first attempt stopped before compilation because
the offline LiteSVM cache was missing. A second attempt fetched locked public
dependencies, then refused the default Rust1.86 compiler's unsupported versions.
Both attempts remain retained and executed no runtime scenarios. A separately
installed1.89 compiler left the default compiler unchanged. The fresh corrected
attempt executed only these three groups; the nine older scenarios were filtered.

The eight selected scenario transactions include one successful initialization
and seven refusals; injected account setup and synthetic fixture funding are
separate. All checks use in-memory VMs, not Agave processes or RPC. No retained
keys or ledger files are read/copied, and no transaction reaches a chain.
Original runtime binaries and original SBF artifacts remain unchanged. Aggregate
source-bound evidence is [recorded here](../evidence/bridge-native-reserve-prefunding.json).


[The offline allocation proposal](RESERVE_ALLOCATION_PLAN.md) now derives a future
reserve address, preserves every other supplied allocation and compares a
separately selected fresh inventory. It does not compile genesis, change the
preparer or establish account bytes, custody or actual backing.
