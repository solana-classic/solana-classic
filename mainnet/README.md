# Native SOC network development

This directory starts the mainnet work with a read-only genesis planner. It
validates exact native-unit budgets, prelocked original-SOC backing, distinct
declared validator identities, stake/balance allocations and RPC ports. It emits
budget data and release blockers. It cannot generate launch commands, deploy a
network or create keys. Input remains schemaVersion1; output is schemaVersion2.
The removed validatorArgumentDrafts field must not be used by consumers.
Execution requires the separately guarded preparation and rehearsal tools below.

Run `node --test mainnet/plan.test.mjs` with the pinned project Node runtime.
Run `node mainnet/plan.mjs <public-rehearsal-input.json>` to inspect a supplied
rehearsal plan. All amounts are base-unit integer strings. Native SVM accounts
use nine decimals. Origin decimals must match the real original SOC mint.

The intended monetary model has no independent inflation. Bootstrap balances,
stakes and system-account funding must be included in the native budget and
backed before they become spendable. The planner's system-account budget is a
declared envelope, not proof of the actual genesis output: generated genesis
must be reconciled account by account. No faucet or upstream distribution may
silently add spendable supply. Operator labels are not proof of independence.

The current devnet is run by one validator operated by the team. A future native SOC network
requires real `agave-validator` nodes, a fresh genesis, independently operated
validators, networking, reviewed economic settings, supply reconciliation,
consensus/restart/recovery evidence and an explicit release decision. The
planner labels its budget as an isolated development rehearsal; that label
does not authorize execution or classify the live devnet as mainnet.

The pinned `solana-genesis` build and complete249-account synthetic inventory
already exist. Three full-validator execution remains blocked by the current
host's hard file limit524288, below Agave's required1000000. The next network
step is a capable Linux host and an actual consensus/recovery rehearsal.

The new read-only `host-preflight.py` validates effective host resources and
three exact reviewed runtime artifacts without generating keys, starting a
process or changing limits. See [the operator handoff](VALIDATOR_HANDOFF.md).
This profile is for a private rehearsal; production sizing, independent operators
and funded genesis/reserve custody require their own acceptance.

See [the implementation sequence](../docs/planning/MAINNET_BRIDGE.md). Existing
devnet balances and NFTs have no mainnet conversion rights.

## Backed bootstrap auditor

`bootstrap.mjs` now reconciles a complete genesis inventory with exact declared
original supply/backing, protected reserve rent, precision slack and initial
bridge counters. Fourteen accounting checks and fourteen planner checks pass.
The planner rejects the existing devnet and known public Solana genesi, zero
account identities and duplicate labels after trimming. Declared labels do not
prove independent operators. See [the scoped verification](../evidence/mainnet-planner-retirement.json).
The retained 249-account genesis projection is in
`evidence/mainnet-bootstrap-accounting.json`.

This is offline accounting with hypothetical original backing, not an on-chain
bootstrap or funded escrow proof. Zero initial counters are flagged; custody,
consumed backing events and actual counter application remain failed gates.
Read [the exact model and remaining implementation](BOOTSTRAP.md).


## Full-validator rehearsal package

`consensus.py` now supplies a check-only default and an explicit private-run
path with normal host/network/PoH checks, pinned genesis/bank/shred values and
a slot-zero stake-supermajority barrier.14 launcher,10 archive and5 host
checks pass; the
separate V2 genesis auditor is compiled and matches the retained249-account
inventory. The archive reader also materializes the selected genesis and
initial slot-zero block data; actual private extraction preserved all eight
retained blockstore files and original hashes. Actual host admission remains blocked; no full validators started.
A fresh hashing genesis and reviewed bank/shred pins are still inputs, not
completed work. Read [the execution contract](CONSENSUS_REHEARSAL.md).

## Fresh hashing genesis preparation

The pinned ledger inspection tool is built. `prepare-consensus.py` supplies a
read-only default and explicit private preparation after full host admission.
It generates a new synthetic genesis, reconciles every allocation and requires
matching startup hashes from two fresh slot-zero replays before writing the
launcher's manifest. Thirteen preparation and ten local process-lifecycle checks pass. Offline tools
have bounded live output and owned-group cleanup on cancellation or timeout;
The complete52-check package and three checksum-verified tool help commands
also passed on Linux, with all selected artifacts unchanged and no validators. The actual current host
refuses both modes before creating keys or ledgers. No new bank hash, genesis
or consensus pass is claimed. See [the procedure](GENESIS_PREPARATION.md) and
[scoped evidence](../evidence/mainnet-genesis-preparation.json).

## All-node vote progression and retained finality

The private launcher now requires every selected validator's vote and rooted
slot to advance in each node's view, and rechecks the unchanged earlier shared
finalized block on all three nodes. Stalled votes, changed stake or missing
history cannot pass simply because network slots advance. Eight new synthetic
regressions bring the offline package to60 local checks; this is preparation,
not actual consensus or fork recovery. See
[the observer contract](CONSENSUS_REHEARSAL.md#voting-and-finalized-history-continuity)
and [scoped evidence](../evidence/mainnet-consensus-progress-local.json).

The rehearsal observer also keeps reads on its three fixed local nodes: no
redirects, environment proxies or global opener substitution. Eight actual
loopback HTTP fixture tests bring the offline package to 68 local checks.
[Transport verification](../evidence/mainnet-rpc-boundary-local.json) remains
separate from actual Agave consensus and host admission.

Host admission now reads the actual unified-cgroup membership and all visible
ancestor RAM/CPU ceilings. Eleven new resource/read-only fixtures pass locally and on the
private Linux worker; the complete offline package has 79 local checks. The
actual worker still fails the unchanged file-limit and RAM requirements, with
no keys, genesis or validators created. See
[resource admission evidence](../evidence/mainnet-cgroup-resource-admission.json).
Visible cgroup observations do not attest hidden host limits or reserved capacity.

The private RPC observer also shares one three-second network deadline across
connection, sending, headers and body reads. Slow trickle responses cannot keep
resetting the socket timeout. Four new local HTTP test groups bring the offline
package to 83 checks; no full validators or actual chain requests are involved.
See [deadline verification](../evidence/mainnet-rpc-network-deadline-local.json).

Both preparation and launch now share a visible Linux process census that
recognizes truncated validator names, executable arguments and kernel links.
Unreadable live process evidence refuses admission; this is not an atomic host
lock or independent-host proof. Ten new regression groups include an actual
Linux kernel-name fixture using an ordinary Python child, with no Agave starts.
See [the process admission contract](CONSENSUS_REHEARSAL.md#visible-process-admission).

The launcher also prepares an optional `--restart-node` stage for a fresh private
run. It requires an observed owned stop, connection-refused endpoint, unchanged
bundle/binary/original ledger and complete vote/finality continuity after the
replacement. Sixteen new synthetic checks include full launcher ownership and
cleanup. Local results are108 passed and one Linux-only skip out of109 checks.
Actual warm restart still awaits an admitted host; no cold restore, quorum
availability, fork or production claim is made. See
[the optional restart procedure](CONSENSUS_REHEARSAL.md#optional-owned-warm-restart).

Startup and warm-restart retries now distinguish temporary readiness from
integrity failures. Wrong network/identity, changed supply/stake or finalized
history, malformed data and unknown errors abort instead of retrying into a
later pass. Six additional regression groups bring local validation to114
passed and one Linux-only skip out of115 checks. See
[the observation policy](CONSENSUS_REHEARSAL.md#readiness-retries-and-integrity-failures).
