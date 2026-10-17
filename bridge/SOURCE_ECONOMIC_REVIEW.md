# Selected source-transaction economic review

`source-economic-review.mjs` reviews supplied raw transaction RPC metadata
against a selected current event snapshot. It is pure: no RPC, storage, key
handling, signing, simulation, submission or journal changes. Input signatures,
transaction responses, account details and result hashes remain private.

This is a narrow legacy deposit profile for the reviewed bridge prototype.
It accepts one source lock or native-return instruction and the four expected
inner instructions. It refuses versioned/address-lookup messages, extra
instructions and unsupported account roles rather than interpreting them as
another supported execution path. It does not review destination payouts.

## Pure review inputs and checks

Call `reviewSelectedSourceTransaction` with exactly `raw`, `pins`, `snapshot`,
`signature` and `sourceEvent`. The snapshot is the normalized finalized set
accepted by the existing returned-account verifier. The independently selected
signature must come from the retained original source submission record;
selecting an arbitrary RPC signature does not prove its relationship to an
original request.

The configuration is checked against its selected policy hash. Its origin
precision, source side, bridge identities, event PDA/domain/epoch/amount and
slot bind the selected event. The transaction slot must equal the event slot.
The legacy message is reconstructed and every transaction signature verifies
cryptographically. Its selected first signature, signer/writable account roles,
programme, exact deposit bytes, nonce and recipient must match.

Raw native pre/post balances and the fee retain canonical u64 JSON digits
before floating-point rounding. All message accounts have an exact expected
native delta. Event creation rent is separate from bridge value and payer fees;
the sender can also be the fee payer. Event rent must match the supplied current
event balance, so a later event-account top-up refuses this narrow profile.

The event must be unprefunded. Its first three inner instructions must fund
the exact event rent, allocate297bytes and assign ownership to the selected
programme. This matches the implemented allocation path; a create-account
shortcut or prefunded event refuses this narrow profile. An original-token lock then requires the
Token-2022 checked transfer: exact source/mint/escrow/authority accounts, amount
and precision. Both token balance sets must agree on mint, owners and programme,
with matching sender debit and escrow credit. A native return instead requires
an exact System transfer from sender to reserve and no token movements. The
success/event logs, fee and all unrelated native balances must also reconcile.
These are checks of supplied economic metadata, not proof that the metadata is
true or that this transaction was included in the chain.

## Bounded private lookup

`source-economic-observer.mjs` accepts the same selected inputs, except `raw`
is replaced by `rpc`, plus optional `timeoutMs` and `evidenceDirectory`. Only an explicit numeric
loopback HTTP(S) endpoint and port is accepted. Public/canonical genesi,
credentials, redirects and URL query/path changes refuse.

The existing current-programme observer brackets one
[getTransaction request](https://solana.com/docs/rpc/http/gettransaction) using
finalized commitment, JSON encoding and maximum supported transaction version0.
The result must still be a supported legacy message. Current code, authority,
configuration and outstanding counters remain pinned across those observations.
The [RPC JSON structures](https://solana.com/docs/rpc/json-structures) define
message account indices and the pre/post balance metadata used by this review.

At most nine read-only RPC requests share one deadline: 15seconds by default,
configurable from100milliseconds to30seconds. The transaction response is at
most64KiB, each code response at most2MiB, and total wire bytes at most8MiB.
The monotonic deadline is checked after synchronous work as well as transport
and streaming. Missing, pruned, failed, malformed or incompatible history
refuses; it cannot authorize a replacement deposit or withdrawal.

When `evidenceDirectory` is supplied, it must be a new empty, real, owned
mode0700 directory. The selected pins, snapshot, signature and event are
reserved exclusively before any RPC. `source-economic-evidence.mjs` writes the
bounded raw transaction JSON text before pure verification or later code reads,
including null or rejected metadata. Files use exclusive creation, no symbolic
link following, mode0600, file fsync and directory fsync. Directory identity,
ownership and permissions are rechecked; an I/O failure refuses further review.

A separate response record binds the raw-text hash and first current-code
context, with review/settlement/production acceptance false. Only successful
selected verification and both current-code brackets produce `observation.json`.
That record still grants no independent-history or recovery permissions. A
failed or killed process can leave a selection, raw response or response record
without a completed observation; none is a passed overall attempt. No prior
file is replaced, and a used directory cannot be resumed. Storage assumes the
owner account is trusted; it is not an encrypted store or a defense against a
compromised host. Keep it outside source, frontend inputs and deployment files.

The returned raw transaction response and hashes are private audit material.
The observer does not publish them, accept a settlement or alter any journal.
Current code matching cannot prove which historical code executed the deposit.
A finalized RPC query and valid signatures do not independently verify chain
inclusion, metadata, finalized consensus, fee policy, complete event coverage,
bootstrap backing or custody. All such acceptance/recovery flags remain false.

## Checks and private rehearsal

Fifteen synthetic signed-transaction groups cover both source directions,
same-payer fee/rent handling, exact large balances, validly re-signed altered
instructions, signature/role tampering, unsupported formats, failed or missing
metadata, token movements, inner transfers and schema bounds. Thirteen observer
groups cover the bounded protocol, changed current pins/counters, captured
inputs, pruned history, actual local HTTP, redirects and streaming/deadline
refusals, per-lookup retention, a later lookup or code failure, unsafe endpoints
and storage failure. Eight storage groups check exact raw digits, owner-only
permissions, exclusive lifecycle, planted files/symlinks, directory changes,
bounds and evidence surviving an actual killed local review process. These
local HTTP and storage tests use synthetic RPC data.

`bridge/rehearsal/source-economic-history.mjs` composes the existing copied-ledger
account check with two selected original transaction signatures from protected
retained rehearsal reports. It uses a new owner-only attempt, preflight
selection and two fresh test-validator copies through the existing guarded
worker. The historical report is copied; fixture input keys are not copied.
Its result is compatible source-account/transaction metadata, not independent
operators or complete chain-history acceptance. Never reuse a passed or failed
attempt directory or resubmit an old signed operation for this check.


## Actual retained-history refusal

The [private history evidence](../evidence/bridge-source-economic-history.json)
records the actual outcome. On two fresh private copies, current programme
accounts and selected journal accounting matched, and the original-token lock
transaction matched its signed message, exact token debit/escrow credit,
event allocation, rent and fee metadata. The selected native-return lookup then
returned null at finalized commitment. Its signature was separately checked
against the retained original signed source transaction and event. Signed bytes
alone do not establish that transaction's landing or recover missing metadata.
The cause of unavailability has not been established; pruning is not assumed.

The attempt remains failed and history acceptance remains blocked. Both copies
stopped; complete original cold inventories, selected private inputs, copied
journals and the original signed-source file remain unchanged. Zero client
signatures, handoffs, simulations or broadcasts occurred. The first attempt's
incorrect create-account allocation model is also retained as a failed refusal;
the corrected verifier matches the actual rent-transfer/allocate/assign flow.
No failed attempt was reset or accepted.

The next evidence requirement is same-genesis retained transaction-status or
block history for that exact native signature. Future source observations also
need protected durable storage of complete finalized transaction metadata at
initial confirmation. The copied-ledger reviewer now reserves a separate
private evidence directory for each lookup and saves each successful result
before starting the next. This closes future partial-failure loss in that
reviewer; it does not recover responses lost by either retained failed attempt.
Integration into initial source confirmation remains required. Repeating a deposit, changing a nonce, accepting a journal
label, lowering commitment or presenting an event account as a transaction
proof cannot fill this gap. The 240 bridge checks and nine worker guards pass
locally. Retention checks are synthetic local tests, not a new Agave history pass.
