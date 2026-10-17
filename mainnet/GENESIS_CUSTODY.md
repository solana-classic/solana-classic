# Genesis custody metadata review

A balanced genesis budget does not establish control of the accounts holding
that budget. `genesis-custody.mjs` adds an offline review of every supplied
account metadata row, including zero-balance, stake, vote and protocol accounts.
It does not decode genesis or account data, read keys, call RPC, prepare a
ledger, change custody, sign or broadcast.

## Selection and output

`reviewGenesisCustody` requires `genesisAudit`, `expectedGenesis`,
`expectedInventorySHA256`, `reserveAddress`, `bridgeProgram` and `bridgeId`.
The first input uses the existing audit output's development genesis identifier,
account count, total and account rows. Each row has exactly `address`, `owner`,
`lamports`, `dataBytes` and `executable`. Balances are canonical decimal u64
strings. At most4096 accounts and10MiB declared data per account are accepted.
Duplicate rows, ambiguous units, total overflow and mismatched sums refuse.
Known public networks, the canonical devnet and nondevelopment scope refuse.

The externally selected digest covers the genesis identifier and every sorted
metadata row, with the domain `classic-genesis-custody-metadata-v1` followed by
a zero byte. `genesisInventoryMetadataDigest` computes that digest for selecting
and later comparing an input. Selecting a digest from the same untrusted rows
is not independent verification. This digest covers metadata, not account bytes,
compiled genesis, fee parameters, inflation or all other genesis configuration.
Keep private inventories, addresses and their digests private.

The reviewer derives the selected bridge's configuration and V2 native-vault
PDAs using the existing `config` and `vault` seed rules. It compares the selected
reserve's address, programme owner,16-byte declared layout and nonexecutable
flag. Any mismatch remains a finding. Matching all four sets only
`reserveMetadataMatches`; it cannot establish `SCVLT002` data, protected floor,
bootstrap counters, upgrade restrictions or authority custody.

Every account contributes once to counts and exact balances grouped by metadata:

- Zero-data, nonexecutable, on-curve system account metadata.
- Other system account metadata, including off-curve addresses and nonce layouts.
- Stake accounts with undecoded authorities.
- Vote accounts with undecoded authorities.
- Recognized protocol owners with unreviewed controls.
- All remaining programme-owned accounts with unreviewed controls.

An on-curve system address is not evidence of which person holds its key or how
many people control it. An off-curve system address is not declared unspendable:
a programme may supply its PDA signature. Programme ownership alone cannot prove
safe code or upgrade controls. Stake/vote owners do not identify withdrawal
keys; those data and any lockups need a separate reviewed decoder and custody
record. Protocol-owned balances are counted, not assumed available for fees or
withdrawal. All custody, backing, consensus, signing, preparation, activation
and production flags remain false, even for matching reserve metadata.

## Retained synthetic projection

The existing249-account genesis inventory remains unchanged. This offline
review counts all1,000,000,000,000 synthetic native base units. Its selected
reserve holds669,690,377,440 units in a zero-data, on-curve, system-owned account.
It is not the selected V2 programme-owned vault. Three stake and three vote
accounts also require authority review. These are historical rehearsal accounts,
not real SOC allocations or an approved production custody arrangement.

The regression uses that already public retained inventory. Proposed bridge
identities used for the PDA comparison are deterministic public test values;
no bridge is deployed and no operators or production identities are appointed.
The aggregate evidence omits account addresses and inventory digests.

```sh
node --test mainnet/plan.test.mjs mainnet/bootstrap.test.mjs mainnet/genesis-custody.test.mjs
```

Thirty-nine local checks pass, including11 new custody groups. They cover wrong
selected metadata, complete category totals, off-curve ambiguity, exact u64
balances, malformed inputs and a counterfactual matching PDA/owner/length that
still grants no permissions. The Linux workflow runs the same Node checks
alongside the existing Python preparation package. Exact run outcomes are
recorded in [the scoped evidence](../evidence/mainnet-genesis-custody-local.json)
and the current pull request.

Next: a capable Linux host for fresh hashing genesis and full validators, a
reviewed native reserve construction, complete account-byte/authority review,
funded original backing, independent custody/operators and security review.
Do not transfer the retained reserve, upgrade an old fixture, relabel a system
account or treat a metadata match as custody acceptance.
