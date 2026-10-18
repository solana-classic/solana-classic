# Fresh private three-validator package

`consensus.py` prepares a real full-Agave rehearsal from an explicitly reviewed
private genesis bundle. Its default operation only checks admission. Starting
processes additionally requires `--run --ack fresh-private-three-validators`.
No mainnet, real SOC or bridge activation is implemented by this package.

The host must pass `host-preflight.py` with the exact reviewed binaries before
any bundle keys are opened or a new ledger is created. The separately named
`classic-genesis-audit-v2` verifies actual genesis identity, every allocation
and integer capitalization. Its source, lockfile and compiled artifact hashes
are recorded in `consensus-audit-artifact.json`; the original auditor is retained.

## Required private inputs

Use a fresh package under `/data/mainnet-consensus-v2/bundles/<bundle-id>/`:

```text
manifest.json
genesis/genesis.bin
genesis/genesis.tar.bz2
keys/node-0-identity.json
keys/node-1-identity.json
keys/node-2-identity.json
```

The identity files contain newly generated disposable rehearsal keypairs, owned
by the operator and readable only by that owner. Do not import production keys,
wallets, devnet operators or bridge fixtures. No runtime ledger, accounts DB,
backup, snapshot or symbolic link belongs in the genesis directory. Supply the
three already bootstrapped vote/stake public keys in the manifest; staking and
withdrawal keys are not read by this launcher.

The exact manifest fields are `schemaVersion:1`,
`scope:"fresh-private-consensus-rehearsal"`, the pinned `runtimeSource`,
`genesis`, `bankHash`, `shredVersion`, `genesisBinSHA256`,
`genesisArchiveSHA256`, `inventorySHA256`, `totalNativeUnits` and `validators`.
`validators` contains exactly three objects with distinct `identity`, `vote`
and `stake` public keys. Supply is an exact decimal base-unit string. The
inventory digest uses the auditor's full `accounts` list encoded with sorted
object keys and compact JSON separators, without reordering the list.

The genesis must be newly built with hashing PoH, for example the pinned
`solana-genesis --hashes-per-tick auto`, zero inflation and the explicitly chosen
zero-burn synthetic policy. The previously retained non-hashing `sleep` genesis
is refused. Its successful old accounting audit cannot accept this new run.

**The slot-zero bank hash and shred version are separate reviewed inputs.**
The genesis hash is not a bank hash. The read-only genesis-account auditor does
not derive a bank hash or approve one. Obtain these values from reviewed ledger
initialization tooling on the capable private host; never guess or substitute
the genesis hash. All three validators enforce both values at startup and wait
for a stake supermajority at slot0. No new hashing genesis or slot-zero bank
hash has been prepared on the current blocked host.

## Commands after input review

First perform admission only:

```sh
python3 mainnet/consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle /data/mainnet-consensus-v2/bundles/<bundle-id> \
  --run-id <new-attempt-id>
```

A successful check prints `packet-checked`. This does not start processes and
does not verify consensus. The runtime, rather than this offline checker,
enforces the selected bank hash. To execute the reviewed private attempt:

```sh
python3 mainnet/consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle /data/mainnet-consensus-v2/bundles/<bundle-id> \
  --run-id <new-attempt-id> \
  --run --ack fresh-private-three-validators
```

A new owner-only directory is created under `runs/<new-attempt-id>`. Existing
attempts are refused, never reset or overwritten. The launcher refuses a
canonical service, other active validators, changed genesis bytes and occupied
ports before starting. Before any key is opened, the pinned archive must contain the exact selected
`genesis.bin` and initial `rocksdb` block data. A bounded reader rejects extra
paths, links, special files, duplicates, file/directory collisions, mismatched
genesis bytes and oversized or concatenated compressed streams. Each fresh
ledger receives those verified initial blocks with owner-only permissions.
The executable is rechecked before each start.

Bundle inspection uses bounded stdout, a 64 KiB private stderr ceiling and
owned process-group cleanup on timeout, failure or cancellation. The genesis
auditor has a 20-second budget and 4 MiB stdout ceiling; each identity lookup
has 10 seconds and 128 bytes. Executable hashes and sizes are checked immediately
before each invocation. Check-only inspection discards private stderr in memory
and creates no log files. These limits do not replace host or bundle admission.

## What is checked

Agave's normal network, PoH speed and host checks stay enabled. There is no
`--no-port-check`, `--no-poh-speed-test`, `--no-os-network-limits-test` or
`--no-wait-for-vote-to-start-leader`. Each node waits for a slot-zero stake
supermajority using the selected bank/shred pins. Explicit fresh genesis files
are copied locally; automatic genesis/snapshot fetching is disabled.

All networking is loopback-only. Each node has disjoint RPC/WebSocket, gossip
and dynamic ports, checked for availability. Its RPC must report the expected
identity, version and genesis, all three active rooted vote accounts, exact
synthetic capitalization and zero inflation. The nodes must agree on a common
finalized block and independently advance finalized slots over a bounded
observation. Only read-only RPC methods are permitted by the observer.

Owned child processes are stopped at the end, including partial-start failures.
A forced stop, cleanup error or unexpected child exit prevents success. Raw
keys, genesis/accounts and private logs remain in the selected host package;
`public-result.json` omits supplied paths and raw errors. Retain every failure.

## Voting and finalized-history continuity

An advancing network slot alone cannot prove every selected validator is still
voting. The observer now requests finalized vote-account state explicitly and
retains all three selected vote accounts from each of the three RPC nodes.
Unknown, duplicate, missing or malformed vote records refuse admission.

Across the bounded observation, every one of those nine views must show both
its last vote and rooted slot advancing, with the same activated stake. A
stalled vote or root cannot be hidden by the other validators' progress.
Immediately before passing, each node must also return the unchanged block
hash at the first shared finalized slot. Missing history or a changed earlier
block refuses admission. Genesis and node identity bracket each continuity
read; child exit or failed cleanup also prevents success.

Eight additional synthetic regressions reproduce stale-vote and replaced-block
false passes and cover the positive path, altered stake, missing readers,
malformed votes, missing history and changed identity. All60 offline mainnet
package checks pass locally. These checks use synthetic RPC responses and
mocked validator processes; they do not start full validators or establish a
real fork/recovery result. Historical evidence keeps its original source hashes
and scope. The prepared launcher still requires the suitable host and actual
private execution described below. See
[the scoped local verification](../evidence/mainnet-consensus-progress-local.json).

## Direct private RPC boundary

The observer creates a fresh direct HTTP opener for each read. It ignores
process proxy settings and any globally installed opener, rejects every HTTP
redirect, and accepts only the three fixed loopback RPC ports and eight listed
read methods. No caller URL, external endpoint or mutation method is accepted.
Non-200 responses and invalid JSON-RPC envelopes refuse admission. Rejected
HTTP responses are closed; the existing 2 MiB body bound and socket timeout
remain enforced.

Two actual local HTTP fixtures reproduced the previous redirect and environment
proxy escapes before the fix. Eight new transport tests now cover direct POST
reads on all three ports, every redirect status, proxy/global-opener isolation,
HTTP/RPC envelope rejection, exact response-size boundaries and method/port
admission. All 68 offline package checks pass locally with resource warnings
treated as errors. These are local synthetic HTTP servers, not Agave nodes,
actual chain requests, host admission or consensus evidence. See
[the scoped transport verification](../evidence/mainnet-rpc-boundary-local.json).

## One network deadline per private RPC read

The private observer now uses a single three-second monotonic network budget
for connection, request send, response headers and response body. Each socket
read or send uses only the remaining budget. Sending small pieces repeatedly
cannot reset that budget. A completed buffered response is checked again before
it can supply an observation. Redirect, proxy, read-method, port, HTTP/RPC and
2 MiB response checks remain unchanged.

Four new local HTTP test groups reproduce slow headers, ordinary bodies and
chunked bodies; verify a shared header/body budget, closed sockets after normal
completion, invalid JSON and a silent peer; and accept a complete chunked reply.
The timing fixtures use a shortened 180 ms budget. All 83 offline package checks
pass locally with resource warnings treated as errors. The deadline bounds
network I/O; it is not a real-time scheduling guarantee, a JSON processing
budget or a deadline for the whole rehearsal. These fixtures start no Agave
validators and make no actual chain requests. Actual consensus and recovery
still require the suitable host. See
[the scoped deadline verification](../evidence/mainnet-rpc-network-deadline-local.json).

## Acceptance still required

Fourteen local launcher checks, ten archive checks and five host admission
checks pass. Actual bounded extraction of the retained synthetic archive
reproduced its genesis and eight initial blockstore files without changing
the originals or starting validators. See
[the archive verification](../evidence/mainnet-genesis-archive.json). The
separate auditor reproduced the actual retained249-account inventory without
changing it. An actual check-only invocation refused the existing host before
opening the nonexistent bundle, creating the run namespace or starting nodes.
This is preparation evidence, not successful full-validator execution.

A capable host, fresh hashing genesis and separately verified bank/shred pins
remain required. After actual consensus: execution journeys, quorum-loss and
recovery/cold-restore tests, independent hosts/operators, actual funded genesis
and reserve custody, economics, bridge recovery and external security review.
Three processes on one host cannot establish operator independence.

## Why the initial blocks matter

Pinned Agave `create_new_ledger` writes the genesis configuration and fills
slot0 with ticks linked to that configuration, then puts both `genesis.bin`
and the initial RocksDB in `genesis.tar.bz2`. Its `open_genesis_config` returns
immediately when a standalone `genesis.bin` already loads; it only unpacks the
archive after that load fails. Merely copying both files does not materialize
the initial blockstore. The launcher therefore validates and unpacks the
selected archive explicitly into each new ledger. It never copies a runtime
ledger or snapshot from another network.

This validates archive identity and safe materialization, not block replay,
a reviewed slot-zero bank hash, PoH speed or consensus. The separate pinned `agave-ledger-tool` build is complete and recorded in
`ledger-tool-artifact.json`. Its version and relevant CLI flags were verified
without opening a ledger. Its build alone cannot satisfy host admission or
accept a new genesis.

`prepare-consensus.py` now prepares the required fresh synthetic bundle after
host admission. It defaults to read-only admission; actual private preparation
requires an explicit acknowledgment. It generates disposable keys, compiles
hashing genesis with an exact synthetic budget, replays slot0 on two fresh
copies with normal verification, and requires matching bank/shred outputs.
The current host refuses before private preparation. Read
[the preparation procedure](GENESIS_PREPARATION.md).

## Visible process admission

Preparation and launch share the read-only `process_admission.py` census before
creating a new rehearsal attempt. Linux truncates `comm` names to15 bytes, so
matching only the full test-validator name can miss a running process. The
shared guard recognizes both full and truncated names, executable `argv[0]`
and the kernel executable link, including a removed executable still running.
Mentions in unrelated arguments do not count as validator execution.

State parsing handles spaces and parentheses in process names. Zombie and
exited records are excluded; disappearing PIDs are tolerated. A missing Linux
process filesystem, unreadable live record, unknown state or incomplete live
identity refuses execution with a redacted error. Run with sufficient authorized
visibility; do not bypass the check.

The census observes visible processes at admission time. It is not an atomic
lock against later starts, proof of hidden host processes or a security boundary
against a malicious host. A dedicated host and serialized operator workflow
remain required. No live validator or host limit is changed by this check.

Ten regression groups cover these boundaries. The Linux-only fixture names an
ordinary bounded Python child like a test validator and verifies the kernel's
actual truncated name; it starts no Agave process. Synthetic lifecycle fixtures
explicitly model an admitted process census, separately from refusal tests.

## Optional owned warm restart

On an admitted host, append `--restart-node 0` (or1/2) to a new private
`--run --ack fresh-private-three-validators` attempt. It first creates the three
fresh ledgers and completes the normal all-node consensus/progress checks.
It never attaches to an earlier retained run. The default and read-only modes
do not perform a restart; reports explicitly distinguish requested and verified
warm restart. Invalid node selection refuses before bundle access.

The optional stage stops exactly one owned process and requires its exit to
be observed with code0 or SIGINT, without a forced kill. Its selected RPC must
then refuse the connection; a timeout, malformed reply, other transport error
or continuing listener does not prove absence. The other two processes must
remain alive and report the original genesis/identities.

Before replacement, the launcher rechecks the selected bundle, validator bytes
and original ledger genesis. It uses the identical normal startup command on
that original ledger, with no reset, copy, changed identity, new genesis or
host/PoH bypass. The replacement is registered immediately in the outer
launcher's owned process list, so failure/cancellation retains cleanup ownership.
A successful warm-restart attempt has four process starts in total, while all
three current children must stop in the outer cleanup. Earlier ledgers and
attempts remain untouched.

Within a180-second progress-poll budget, all three nodes must recover advancing
finality, all nine vote/root views with unchanged stake and the same earlier
finalized block. The budget is checked between already-bounded RPC observation
sequences; it is not a hard real-time bound on the entire restart, preparation
or process shutdown. Missing progression, a child exit, changed artifact/ledger
or cleanup failure prevents an overall pass.

This is a warm process restart, not cold restoration, hard crash, competing
fork, physical-host loss, independent operators or a quorum-outage policy test.
Three equally staked nodes leave only two-thirds when one stops; this stage
does not promise continued finality during that outage. No transaction workload
is generated by the restart helper. Actual execution remains blocked on the
current host, and no real recovery acceptance is claimed by synthetic checks.

## Readiness retries and integrity failures

Initial startup and the optional warm restart share a narrow observation retry
policy. Failed connection reads, resets and network deadlines may be retried
inside their existing budgets. Explicitly incomplete startup progress may also
retry: a low finalized slot, selected votes not rooted yet, a partial set of
otherwise correctly identified selected votes, or votes/finality not yet
advancing beyond the retained checkpoint.

Wrong genesis, identity or version, changed supply/inflation/stake, unexpected
or duplicate vote identities, malformed fields, changed finalized blocks and
unavailable retained history stop the attempt. Redirects, unexpected HTTP/RPC
replies and unknown exceptions cannot become readiness simply because a later
request succeeds. Supply and vote identity are checked before returning the
low-slot readiness classification. Initial and restart failure paths retain
the failed attempt and clean up the owned current children.

A synthetic wrong-genesis episode previously retried into a later pass. Six
new regression groups reproduce that case and cover permanent observation and
continuity failures, explicit readiness, typed runtime policy and complete
launcher cleanup. These are synthetic observations/processes; actual network
consensus and restart still require suitable hosting and separate execution.
