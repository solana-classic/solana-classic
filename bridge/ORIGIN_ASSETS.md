# Read-only original mint and escrow observation

`origin-assets.mjs` exports `observeOriginAssets`. It accepts an explicit private
loopback RPC, reviewed origin-side programme pins, independently selected mint
supply and precision, and a retained minimum finalized slot. It never accepts
keys, signs, submits, simulates, writes a journal or retries a transfer. Public
Solana networks and the live Classic devnet are rejected before any RPC read.

The observer checks the programme code, complete ProgramData, upgrade authority
and static bridge policy before and after two asset snapshots. `origin-asset-pins.mjs` selects complete
previously reviewed source and remote identities from the stopped pinned-journal
rehearsal, retaining its finalized checkpoint. Earlier partial observation
records are rejected; identities are never filled in from a fresh RPC. Each snapshot
reads the derived bridge config, pinned mint, derived escrow and V2 vault in one
finalized RPC context. Contexts cannot regress. Asset bytes must stay identical
between snapshots, and recorded obligations must still agree with the final
code observation. Movement or an unavailable read requires a new observation;
there is no cached successful fallback.

The default `mintPolicy: "plain"` accepts an unextended82-byte Token-2022 mint and an
unextended 165-byte escrow. It verifies mint initialization, exact expected
supply/precision and absent mint/freeze authorities. Escrow must hold that mint,
be controlled by the derived vault PDA, be initialized and unfrozen, and have
no delegate, native-wrapper or close authority. Its V2 authority account must
be owned by the pinned bridge programme. Balances and counters are decoded as
u64 integers and returned as exact decimal strings.

```text
recorded origin obligations <= actual escrow tokens <= original mint supply
unallocated escrow surplus = actual escrow tokens - recorded origin obligations
```

A direct token donation to escrow is reported as surplus. It does not increase
bridge obligations or authorize another native release. This module does not
compare the native-chain counter or prove a complete pending-event inventory.

An explicit `mintPolicy: "immutable-self-metadata-v1"` additionally admits only
the immutable self-pointing MetadataPointer and TokenMetadata pair described in
[MINT_METADATA.md](MINT_METADATA.md). It bounds mint data to4096bytes and includes
all metadata bytes in snapshot equality. The token-code wrapper forwards this
selection while retaining its outer code observations. Unknown policies reject
before RPC access. Escrow remains exactly165bytes under both policies.

This is a deliberately narrow observation boundary. The on-chain prototype
permits selected metadata and immutable-owner extensions; the observer refuses
all extensions except the explicitly selected immutable mint metadata pair.
The claim journal continues to reject extended mints. The new option has local
synthetic-response coverage and a separate fresh private Agave origin result
linked in MINT_METADATA.md. Settlement admission and independent review remain
pending.
The original module checks only the Token-2022 owner address. The separate
[`observeTokenPinnedOriginAssets` wrapper](TOKEN_CODE.md) additionally requires
selected token ELF, complete ProgramData and authority pins before and after
these asset observations. Existing callers do not gain that guarantee unless
they use the wrapper. It trusts the selected RPC's finalized view and
cannot prove independent consensus, historical economic movement, full genesis
backing, permanent custody, or a safe recovery. All signing, retry, broadcast
and production-ready flags remain false.

Run the local adversarial checks with pinned Node24:

```sh
node --test bridge/origin-assets.test.mjs bridge/program-pins.test.mjs
```

The separate `rehearsal/origin-assets.mjs` runner exercises actual reads on a
new stopped-ledger copy. It requires reviewed historical pins, rejects wrong
expected supply/precision, rereads unchanged asset bytes and permits only
`getGenesisHash` and `getMultipleAccounts`. Worker evidence must record its
single copied validator stopped and both original ledger inventories plus the
original fixture/journal unchanged. Local tests alone do not prove execution.


The earlier default plain-mint policy passed five actual checks on a fresh private copy, using30 read-only RPC calls
and zero simulations or broadcasts. The synthetic mint supply is2000000origin
units; escrow and recorded obligations are1950000, with zero unallocated
surplus. Wrong selected supply and precision reject; a fresh observation retains
exact asset hashes. The copied validator stopped and both original ledger,
fixture and finalized journal hashes match. See
[the completed result](../evidence/bridge-origin-assets-agave.json).

The first attempt selected an older partial programme-observation record and
refused admission before asset reads. It stopped its copied validator without
transactions. That failure and its original sources remain retained; the fresh
attempt selects the complete previously reviewed pinned-journal record without
lowering its checkpoint. See
[the retained failure](../evidence/bridge-origin-assets-first-attempt.json).
