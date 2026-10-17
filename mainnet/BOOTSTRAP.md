# Backed bootstrap accounting

`bootstrap.mjs` is an offline rehearsal auditor. It counts every actual genesis
account and checks exact original/native units, reserve rent, precision slack
and proposed initial bridge counters. It cannot access a network, create keys,
write a ledger, set counters or activate mainnet. Declared backing is not proof
that any original SOC has been purchased or locked.

## Exact budget

Let `F = 10^(9 - originalDecimals)`, `S` be original mint supply in original
base units, `A` be every native unit outside the reserve, and `P` be protected
native units within the reserve (at least the vault's rent requirement).

The audited genesis must have total `G = S × F`. Its reserve is `R = G - A`.
With `L` original base units finalized in escrow for bootstrap:

```text
minimum L = ceil((A + P) / F)
bootstrap backing = L × F
backed native units still inside reserve = L × F - A
precision slack or additional backing = L × F - A - P
capacity for future original deposits = (S - L) × F
R = backed native units inside reserve + future-deposit capacity
```

The initial bootstrap backing already pays for the genesis allocations. It
must not also authorize a second native release. Extra backing/precision slack
is a protected tranche of the reserve, separate from capacity for new deposits.
The auditor conservatively includes all nonreserve lamports, including stake,
vote, feature, built-in, sysvar and other accounts. It does not assume these
accounts are immediately spendable or prove their withdrawal authorities.

Reserve rent matters: protecting it consumes native supply too. Backing only
the validator balances/stake would leave the planned full remaining bridge
capacity short by that structural reserve requirement. Native fee/rent burn
policy changes require a separate reviewed accounting model; this first
rehearsal auditor accepts zero inflation and zero burn only.

## Retained actual genesis projection

The pinned `solana-genesis` inventory contains 249 accounts and totals
1,000,000,000,000 native base units. All other accounts total 330,309,622,560;
the reserve is 669,690,377,440. For the **hypothetical** six-decimal origin budget
and historical eight-byte V1 vault, minimum rent is 946,560 native base units. Minimum
prelocked backing is 330,310,570 original base units, leaving 880 native units of
precision slack. Backed units inside the reserve are 947,440; new-deposit
capacity is 669,689,430,000. These are synthetic rehearsal parameters, not real
SOC supply, source escrow or an approved production budget.

```sh
node --test mainnet/bootstrap.test.mjs mainnet/plan.test.mjs
node mainnet/bootstrap-fixture.mjs
node mainnet/bootstrap.mjs <public-rehearsal-accounting-input.json>
```

Fourteen bootstrap and fourteen planner checks pass. The historical evidence
records its original test counts; it remains unchanged. The fixture generator
does not execute tests or claim test counts. It uses the retained source-build
inventory without rerunning genesis compilation or consensus. See `evidence/mainnet-bootstrap-accounting.json` for source hashes
and both counter projections. Large unit totals remain exact integer strings.

## Counter and replay gate still open

Both initial bridge outstanding counters must match `L`, not zero. Source
bootstrap locks must be finalized and recorded as consumed bootstrap credits
before ordinary native claims open. A reviewed one-time initializer must bind
source events, original/native identities, mint, decimals, genesis inventory,
allocations, protected reserve tranches, epoch and custody/quorum policy. It
must reject a second bootstrap or ordinary release of the same backing events.

The SVM programme initializes outstanding at zero. The new separate V2 build
adds a guarded one-time bootstrap that sets native outstanding and consumes a
source lock without another release. Local compiled-SBF tests pass; this
auditor itself remains offline. Supplying matching numbers here only passes a
**declared counter** comparison. Actual backed-genesis integration, finalized
backing, reserve custody and security review remain false release gates.

The auditor now defaults to the V2 vault's **16 bytes**. Its default rent is
1,002,240 native units. Applied as a hypothetical projection to the retained
inventory, that requires 330,310,625 original base units, leaving 200 native
units of slack. The historical eight-byte fixture/evidence remains explicit
and unchanged; it is not a V2 backing budget. See [the program path and trust
boundaries](../bridge/BOOTSTRAP.md). Never reuse a V1 budget for the V2 vault.

Reserve custody is also unresolved: the retained rehearsal reserve is a plain
system account controlled by a temporary fixture key, not an audited production
bridge vault. A future genesis/reserve design must make the protected tranches
enforceable before activation. Do not reuse the current devnet or the private
bridge fixtures as mainnet, or assign their balances any mainnet rights.


## Account custody is a separate gate

[Genesis custody metadata review](GENESIS_CUSTODY.md) classifies every supplied
account and compares reserve metadata with the selected V2 bridge vault PDA.
The retained249-account budget balances, but its system-owned reserve fails
that vault comparison. Stake and vote withdrawal authorities remain undecoded.
Matching reserve owner/address/length alone never verifies account bytes,
protected floor, upgrade controls, actual custody or funded backing.


[Offline genesis authority decoding](GENESIS_AUTHORITIES.md) now reads the actual
retained genesis and matches its complete published metadata. Its three stake
and three vote accounts reuse each validator identity for withdrawal and voting
roles. This is a fixture finding; no keys are rotated, custody approved or funds
moved. The metadata-only evidence above retains its original narrower scope.
