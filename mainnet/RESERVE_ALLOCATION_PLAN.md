# Prefunded reserve allocation proposal

`reserve-prefund-plan.mjs` prepares an offline proposal for a future isolated
synthetic genesis. It replaces the selected ordinary reserve address with the
selected bridge vault PDA while preserving its balance and every other supplied
allocation. It neither edits the retained genesis nor invokes genesis tooling.
The existing preparer and its ordinary reserve remain unchanged.

`planPrefundedReserve(input)` requires an externally selected baseline genesis
and complete metadata digest, a funded empty System reserve, a bridge programme
and bridge identifier, and an explicit synthetic origin supply/backing budget.
It derives the configuration and vault addresses, rejects either address already
in the baseline, and returns sorted proposed allocation metadata with an exact
u64 supply and a domain-separated proposal digest. The proposal has no new
genesis hash. All units stay integer strings, including values beyond ordinary
JavaScript integer precision. The V2 sixteen-byte vault rent is included in the
declared backing budget; the eventual config/program deployment costs remain
separate and require activation-bank accounting.

The proposal keeps the reserve System-owned with empty data. The earlier
[compiled-program checks](RESERVE_PREFUNDING.md) separately test initialization
of that construction. The proposal itself neither initializes custody nor
proves that the bridge programme or its upgrade authority is safe. Its selected
bridge identity is not appointed as a production authority.

## Compare a future complete inventory

`reviewPrefundedReserveInventory` recomputes the proposal from its selected
inputs, requires an external expected proposal digest, a different selected
isolated genesis and an external complete metadata digest, then compares every
supplied account row, total, rent, inflation and fee policy. Keeping the old
reserve as an extra account, omitting an account, shifting balances, changing
any owner/data length/executable field or reusing the old genesis refuses.
Output still says actual genesis compilation and account-byte verification are
false: caller-supplied JSON, even if exact, cannot prove either operation.
Selecting an expected digest from the same untrusted input is not independent
verification. These values require a separately retained trusted selection.

The comparison covers allocation metadata and the named budget policies. It
does not compare account bytes, stake/vote authorities, PoH/epoch parameters,
bank hashes, shred versions or executable code. Those keep their separate
compiled-genesis and full-validator gates. New allocation metadata can never
inherit the old binary-genesis hash or consensus evidence.

The functions perform no file writes, network calls, key creation, transaction
signing, genesis compilation or validator launch. Returned metadata is a review
proposal, not a ready-to-run genesis command or compiler input. The guarded
preparer has not been wired to consume it. A future integration requires normal
host admission and a new private namespace with fresh authority review.

## Verification scope

Twelve focused groups cover baseline/proposal/output selection, allocation
preservation, duplicate/missing accounts, fresh-genesis requirements, derived
address collisions, budget/rent/precision bounds, u64 limits, caller immutability
and input ordering. The retained public249-account synthetic metadata produces
a proposal with248 unchanged allocation rows and exact total supply. A separate
synthetic output comparison exercises the success path; no new compiled genesis
or activation inventory is claimed. The full accounting/planning/metadata suite
contains51 groups.

```sh
node --test mainnet/reserve-prefund-plan.test.mjs mainnet/plan.test.mjs \
  mainnet/bootstrap.test.mjs mainnet/genesis-custody.test.mjs
```

After initialization and later transactions, a fresh complete activation-bank
inventory remains required. Protected bootstrap tranches, consumed source
backing, both on-chain counters, independent operators, upgrade custody and
external security review remain release requirements. Nothing in this proposal
activates native SOC, changes devnet or resolves retained missing native history.
Aggregate evidence is [recorded here](../evidence/mainnet-reserve-allocation-plan.json).

The separate [selected byte input adapter](RESERVE_BYTE_INPUT.md) now binds an
exact one-account primordial input and proposed-output fingerprints to selected
binary-genesis decoder reports. Its actual baseline audit and synthetic output
controls are separate; the preparer and actual fresh genesis remain pending.
