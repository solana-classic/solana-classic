# Finality and recovery policy draft

This is a reviewable production policy draft, not an activated bridge. The
prototype relies on a 3-of-5 transaction-signing committee. Three dishonest
members can authorize a false event; a committee outage can stop redemption.
RPC checks and replay receipts do not remove those trust assumptions.

## What a verifier must bind before signing

Each independent verifier needs its own source-chain observation and a pinned
release manifest: both genesi, both programme IDs and code hashes, upgrade
authorities, bridge/configuration epoch, mint, decimals, allowed extensions,
committee identities, caps and pause/custody policy. The current observer
checks an event's owner, PDA and fields; it does not yet implement every one
of these production manifest checks.

A verifier must independently check:

1. The source RPC still identifies the expected chain before and after the
   read. A changed chain or old recovery context stops the observation.
2. The event is available at finalized commitment, with a context at least as
   new as the retained same-genesis checkpoint and the event's source slot.
3. The event belongs to the approved source programme and has the derived PDA,
   exact sender/nonce, direction, recipient, amount, epoch and destination.
   Independently verify the successful source transaction and economic escrow
   or reserve movement; an RPC's event response alone is insufficient.
4. Approved programme code and authorities have not changed. A programme owner
   check alone cannot rule out malicious code installed at the same address.
5. The destination receipt is absent for a new settlement. If it already
   exists, verify its contents and economic effect and reconcile the existing
   operation rather than submit a replacement.

Configured members must be separate operators, with reviewed keys and recovery
procedures. Five keys held by one project are not five independent verifiers.
The two-chain rehearsal's keys remain synthetic local co-signers.

## Operation states

| State | Allowed next action | Required retained evidence |
| --- | --- | --- |
| Source submitted | Poll the same signature | Original signed bytes, signature, blockhash/expiry and intended event |
| Source uncertain | Reconcile that signature and event; stop settlement | No new nonce or replacement deposit while ambiguous |
| Source finalized | Independent observers validate the exact event | Source identity, finalized context, event bytes and transaction |
| Attestation prepared | Review destination and required authorities | Exact message hash, epoch, recipient and amount |
| Destination submitted | Poll the same signature and receipt | Signed bytes written privately before first broadcast |
| Destination uncertain | Reconcile receipt, transaction and balances | No second economic operation or fresh signatures on an altered message |
| Destination finalized | Check counters and actual escrow/reserve movement | Receipt, transfer and exact integer-unit reconciliation |

Private signer records must never be uploaded into the frontend or public
evidence. Public evidence contains only addresses, hashes, contexts and receipts.
The existing prototype integration harness is not a production relayer.
The private native-release journal now implements durable signed bytes, a
single attempt handoff and same-receipt/economic reconciliation. Original-token
redemption now has the same journal path and a separate private six-check
result; the full production signer/custody workflow remains open.

## Failure handling

**RPC outage or lag:** return no settlement observation. Keep the operation
pending; recover against the same genesis and retained checkpoint. Do not
lower the checkpoint simply because a restarted RPC is behind. Do not accept
an old cached event as fresh signing approval. The observer implements these
admission guards; independent verification and signer orchestration remain work.

**Process restart:** check genesis, approved code, event accounts, claim receipts,
balances and counters before resuming. Existing finalized claims must still
reject replay. Controlled SIGINT recovery on private test-validator ledgers is
a narrower result than a full-validator crash, machine outage or cold restore.

**Pre-finalized source fork:** do not attest an unfinalized event. A processed
or confirmed event disappearing is not a finalized deposit. The required test
must use an actual competing private fork; fixtures cannot pass this gate.

**Conflict involving supposedly finalized state:** stop new attestations and
invoke the reviewed committee emergency pause procedure. Preserve observations
from independent nodes and compare the escrow/reserve backing before recovery.
Do not silently rewind a checkpoint, change genesis, clear consumed receipts,
mint replacement units or unlock source escrow after native units were released.
Resolve any backing shortfall explicitly with reviewed governance and published
accounting; a client retry cannot repair an economic inconsistency.

**Committee/upgrade-key compromise:** use the separately reviewed custody and
pause process. Caps bound some exposure; they do not make compromised quorum
signatures trustworthy. Verifier replacement, epoch changes, upgrade timelocks,
emergency authority and independent review remain production decisions.

## Still required before production

- Durable signer custody; both-direction pending recovery has separate private
  six-check results, not production acceptance.
- Actual pre-finalized fork and unknown-landing/expiry/pruning recovery drills.
- Cold restore, SIGKILL/machine outage and full-validator recovery checks.
- Independently operated verifiers/RPCs, code/authority pinning and monitoring.
- Exact backed bootstrap, custody/emergency policy and independent review.

See [the implementation and gate matrix](../docs/planning/MAINNET_BRIDGE.md),
[bridge code](program/src/lib.rs), [event/domain validation](program/src/state.rs)
and [the local observer](sdk.mjs). No monetary activation is authorized here.

## Observed pending-redemption expiry

The V2 redemption crash drill exercised an actual unknown-confirmation case:
one withdrawal broadcast, no signature status visible before the copied origin
validator was killed, then EXPIRED_UNRESOLVED after restart. The client checks
finalized block height against the signed transaction's last-valid height; its
wall-clock polling limit cannot finalize a withdrawal or authorize a retry.
The original tokens were not paid out, the native return remained in its
reserve, and signed journal/attempt count remained intact. This is a passed
expiry guard, not completed redemption or production recovery.

See [the expired-operation review policy](EXPIRED_RECOVERY.md) and
[sanitized evidence](../evidence/bridge-v2-redemption-crash-expiry.json).
The current journal cannot perform replacement signing or broadcast.

## Read-only programme and policy pins

`program-pins.mjs` supplies `observePinnedProgram({rpc, pins,
minimumContextSlot})` for explicitly isolated loopback chains. Callers must
select trusted pins from a reviewed release packet, not learn them from the
endpoint being tested. The observer checks Loader-v3 executable ownership,
the derived ProgramData pointer, full ProgramData bytes hash, exact ELF length
and hash, unused zero-filled capacity and the pinned upgrade authority.

It also pins the first358bytes of the382-byte bridge configuration: both
network identities, programme/mint identities, five distinct committee
members, precision, side, quorum, epoch, pause flags and transfer/daily limits.
The final24bytes hold changing day/settled/outstanding counters. Those remain
observable as exact decimal strings, without changing the static policy pin.
They do not prove reserve backing or a complete pending-event inventory.

Two finalized account reads require nondecreasing contexts, followed by a
second genesis check. A detected upgrade or policy change rejects without
cached success. RPC responses are streamed with a2MiB wire limit and1MiB
per-account decoded limit; noncanonical base64, wrong owners/layouts, public
or soaking genesi, missing accounts and bad contexts fail closed.

The observer is read-only. Version2 and version3 prepared journals now enforce
retained code and policy pins in every handoff entry point; version3 also
requires its reviewed mint observations. A separate observer result alone
cannot approve a withdrawal. A returned observation is a snapshot, not a
continuous monitor or proof that an upgrade cannot happen immediately afterward.
Production signer custody, upgrade controls, fresh source finality and
independently operated verifiers remain required.

Offline authenticated expiry review also requires a caller-selected code-policy
hash to equal the retained version2/version3 journal hash. Legacy version1
supplied pins remain explicitly unbound. This does not authorize recovery or
replace independent code/history observations. See
[expiry review scope](EXPIRED_RECOVERY.md). No production roster or endpoint has
been appointed by this implementation.


## Metadata-token archive restore

Eight actual checks now pass on new private copies of a completed metadata-token
native claim and original redemption. After controlled stops, an archive was
hashed, extracted and copied into separate restored ledgers. Complete stopped
inventories match before restart. Nineteen selected finalized account records
retain exact native balances, bytes and owners, immutable mint metadata, code
and authority pins, both original events and consumed receipts. Both settlement
replay simulations reject after restore, with zero broadcasts. All four owned
copy processes stopped; original ledgers and private records are unchanged.

The initial attempt refused an unsafe Number balance before archive creation.
Its two copy processes stopped and artifacts remain retained. The corrected
attempt parses raw account JSON digits exactly; it does not round the balance
or remove the selected account. See [the procedure](METADATA_COLD_RESTORE.md)
and [aggregate evidence](../evidence/bridge-metadata-cold-restore-agave.json).

This extends controlled-stop test-validator recovery to metadata tokens. It
cannot establish physical-host recovery, independent backup custody, arbitrary
unknown landing, competing forks, full-validator consensus, complete funded
backing or production acceptance.

## Declared committee concentration

The [committee control analyzer](COMMITTEE_CONTROL.md) now measures declared
operator, signing/recovery and outage concentration against an externally
selected five-key roster. This is offline declaration review; it does not
appoint operators or establish identities, custody enforcement or independent
observations. Passing supplied criteria never grants signing permission.
