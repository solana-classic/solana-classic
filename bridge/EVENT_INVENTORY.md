# Returned source-event and receipt accounting

`event-inventory.mjs` derives obligations from supplied programme accounts,
without trusting a selected journal's state label. It is an offline verifier:
no RPC collection, keys, signing, journal access, storage, retry or settlement.
Keep returned event/receipt identities and snapshot digests private.

Call `reconcileEventInventory` with:

- `pins:{origin,native}`: independently selected programme-pin objects accepted
  by the existing pin policy. Both sides must select one isolated bridge,
  matching remote chains/programmes, mint and orientation.
- `originSnapshot` and `nativeSnapshot`: exact objects containing `genesis`,
  `program`, `commitment:'finalized'`, `contextSlot` and `accounts`.
- Each account has exactly `address`, `owner`, `executable`, `lamports` as a
  canonical u64 decimal string and `dataBase64` as canonical base64.
- `originEscrowUnits`: the separately supplied exact original-token escrow.
  The programme-owned account set does not include the Token-2022 escrow.
- `minimumContextSlots`: two explicit positive safe integer checkpoints.

Each supplied set contains two to 256 accounts from one selected programme and
bridge instance. The derived configuration and V2 vault must be present. Static
configuration bytes match their selected policy hash and identities, precision,
committee, quorum, epoch and limits. Accounts must have the selected owner and
be non-executable. Duplicate addresses, unsupported layouts, extra fields,
noncanonical encoding, unsafe slots and stale labelled contexts refuse.

Source events must have the exact direction/domain/epoch and derived PDA,
nonzero sender, representable native amount and source slot within the supplied
context. Each consumed receipt has its derived PDA and stores an exact source
event from the opposite supplied set. Orphan/conflicting receipts refuse.

For this zero-bootstrap model, exact integer arithmetic derives:

```text
origin outstanding = original lock events - consumed original redemptions
native outstanding = consumed native claims - native return events
pending native claims = original locks without native receipts
pending original redemptions = native returns without original receipts
origin outstanding = native outstanding + both pending directions
```

The derived outstanding counters must match both supplied configurations.
Escrow must cover origin outstanding; any surplus stays separate. The returned
native vault must cover its stored floor plus pending native payouts. Lifetime
recycled gross flows may exceed u64; each event conversion and current liability
must fit u64. Amounts never pass through floating point.

Bootstrap records refuse explicitly. Applying this model to a preloaded native
allocation requires the separate funded genesis/bootstrap inventory and a
reviewed extension. Unknown account types and other bridge instances also
refuse rather than silently disappearing from the calculation.

Account ordering is canonical. The output includes domain-separated input/result
hashes, both flow totals and pending obligations. These hashes bind the supplied
bytes, not their origin or completeness. No RPC endpoint, signature, signed
transaction or private key is returned.

## Limits and verification

Eleven synthetic offline test groups cover both directions, omission against
unchanged counters, orphan/altered receipts, domain/epoch/PDA/slot/policy errors,
reserve and escrow coverage, exact large and recycled amounts, bounded schemas
and deterministic ordering. They also demonstrate the unresolved limitation:
omitting an event while coordinating the supplied counters can still satisfy
the model. An RPC returning a selected subset is not independent history proof.

`rpcResponseCompletenessVerified`, `completeSourceEventInventoryVerified`,
`sameLedgerHistoryVerified`, `simultaneousSnapshotVerified`,
`finalizedCommitmentIndependentlyVerified`, `freshChainStateVerified`,
`deployedCodeAndCustodyVerified`, `sourceEconomicMovementsIndependentlyVerified`
and `backingVerified` remain false. All retry/refund/reset/sign/broadcast/
settlement/production permissions remain false.

The optional collector below adds bounded observations. Actual private-ledger
compatibility, independent history coverage and economic movement verification
remain required. Neither module accepts a live bridge, removes an existing
obligation or resolves any expired attempt. See [selected-journal accounting](PENDING_INVENTORY.md) and
[the production recovery draft](FINALITY_RECOVERY.md).


## Bounded private RPC collector

`program-account-collector.mjs` exports `collectReturnedProgramAccounts` and
`parseReturnedProgramAccounts`. The collector accepts exactly `rpc`, `pins`,
`minimumContextSlot` and optional `timeoutMs`. Use an explicit numeric loopback
HTTP(S) endpoint and port, separately reviewed programme pins, and a positive
finalized checkpoint from the selected isolated ledger. Known public and
canonical devnet genesi, zero identities, credentials and redirects refuse.
The checkpoint and pin selection remain the operator's responsibility.

Before collection, the existing code observer reads the selected genesis,
Loader-v3 programme, complete ProgrammeData and configuration twice. The
collector then requests two unfiltered `getProgramAccounts` sets with base64,
`withContext:true`, finalized commitment and nondecreasing `minContextSlot`.
The full normalized account sets must match, including native balances, data,
owners and addresses. Context slots may advance. A second code observer then
rechecks the same selected programme and policy, and its outstanding counter
must still match the returned configuration.

The [official RPC method](https://solana.com/docs/rpc/http/getprogramaccounts)
returns accounts owned by the selected programme. The collector sends neither
filters nor data slicing. It still cannot prove the server returned every
account. A malicious or incomplete server can return matching subsets; two
matching reads and code pins do not provide independent history or finality.
The explicit coordinated-omission regression demonstrates this limitation.

There are at most ten read-only requests per collection. One overall deadline
covers transport, streaming and parsing: default 15 seconds, configurable from
100 milliseconds to 30 seconds. The caller receives a timeout even if an
injected transport ignores cancellation. Actual HTTP streams are cancelled on
timeout. Responses require JSON content type; programme account replies are
bounded to 256 KiB each, code replies to 2 MiB each, and total wire bytes to
8 MiB. Larger sets refuse, so this is a small private-rehearsal collector, not
an unrestricted production indexer. Node24 raw JSON number tokens preserve
native u64 balances above floating-point precision before normalization.

The returned `snapshot` is private input to `reconcileEventInventory`; collect
both sides separately and obtain the original-token escrow through the reviewed
mint/asset observer. The collector does not read token escrow or journals and
does not prove simultaneous cross-chain snapshots. It writes no files and has
no keys, signing, submission, retry or refund interface. Keep account sets,
addresses, policies, balances and returned digests in protected rehearsal
storage rather than public evidence or frontend inputs.

Seventeen local test groups cover integration with both pending directions,
large raw balances, changed code/authority/policy/counters, malformed and stale
responses, schema and size bounds, a shared deadline, real loopback HTTP,
redirect refusal and slow streaming cancellation. All 197 related bridge
checks pass locally. The collector tests use synthetic RPC data. The separate copied-ledger
rehearsal below now has actual scoped compatibility evidence.
Every completeness, independent-history, backing, custody, settlement and
production permission remains false in the result.


## Comparison on fresh private ledger copies

`engine/rehearsal/event_collection.py` and
`bridge/rehearsal/event-collection.mjs` prepare a read-only compatibility check
from one retained, stopped metadata-token rehearsal branch. The initial
supported profile has one claim labelled finalized and one expired unresolved
redemption. It is a narrow fixture admission, not a general migration tool.

A protected private configuration selects the separate worker identities,
source and fresh attempt directories, and disjoint loopback RPC/gossip ports.
Canonical service, environment mismatches, reused attempts, active validators,
changed source/binary hashes, incomplete source records and occupied ports
refuse before copied validator startup. Source ledgers are inventoried and
copied using the existing internal-link checks; no validator opens them.
Keys from the historical fixture input are not copied into the new runner.
Signed journals remain protected on the private worker and are never submitted.

An offline preflight authenticates the copied journals, selected metadata review
and both programme policies. Only then do two owned test-validator copies start
with the pinned binary and original genesi. Readiness uses the retained
checkpoints; a wrong genesis aborts. Process command, file descriptor and mapping
samples exclude original and opposite-copy ledger paths. These are startup
samples, not a continuous host-isolation audit.

The asset observer checks selected Token-2022/bridge code, complete reviewed
mint bytes and escrow before and after the bounded programme collections.
Current event/receipt accounting is compared with both actual returned counters,
escrow and native floor, then with the selected journal records. A locally
finalized journal must have its matching returned consumed receipt; an expired
unresolved redemption remains an unconsumed obligation. Matching pending totals
never erase that obligation or authorize another handoff, retry or refund.
The pure `event-collection-comparison.mjs` boundary has seven refusal groups;
nine worker groups cover admission, retained failures and owned-copy cleanup.

After collection both copies stop. Complete original cold inventories, selected
private files, copied journal bytes and uploaded public source hashes must stay
unchanged. Public evidence contains scoped aggregate counts and public source
hashes only. No account/policy/inventory digests, journal IDs, signed bytes,
private keys, raw ledgers or private logs belong in the public report.

Current-account compatibility does not prove complete source history,
independent finality, simultaneous cross-chain state, economic movements,
funded genesis/bootstrap supply, production custody or recovery permission.
This runner does not sign, simulate, broadcast, settle or alter the old attempt.
A controlled same-host copy start/stop is not full-validator consensus, an
independent backup or a physical-host-loss drill.


The [actual rehearsal evidence](../evidence/bridge-event-collection-agave.json)
records seven passed checks on two fresh private Agave copies: 11 returned
programme accounts, four source events and three consumed receipts. The two
selected journals reconcile with current pending amounts while the expired
redemption remains unresolved. There were 56 collection/asset-observer RPC
calls, zero client signatures, handoffs, simulations or broadcasts, and both
copies stopped. Validator readiness reads are separate from that RPC count.
All original cold inventories and seven selected private files remain unchanged.

An initial attempt passed four checks, then refused a report assertion that
read an absent amount field from the raw journal. Both copies stopped and a
follow-up integrity audit preserved originals and copied journals. It remains
retained as failed. The corrected runner reads the authenticated inspected
event amount and executed only in a new attempt directory. Separately, an
initial local negative fixture sometimes assigned the journal's existing state;
it now always changes that state. All 204 bridge regressions and nine worker
guards pass locally; the nine worker, seven comparison and 17 collector groups
also passed Linux pre-admission. No failed attempt was reset or reused.


The subsequent [selected transaction-history review](SOURCE_ECONOMIC_REVIEW.md)
adds signed-message and exact source movement checks. Its actual private attempt
matched the original lock metadata but refused an unavailable finalized native
return transaction. Current account compatibility above remains a separate
narrow result; it does not clear the retained history gap or accept settlement.
