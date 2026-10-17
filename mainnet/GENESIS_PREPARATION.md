# Fresh synthetic genesis preparation

`prepare-consensus.py` closes the input-preparation gap before a private full
validator rehearsal. It never starts validators, sends a transaction or
activates mainnet or a bridge. The current host remains blocked before keys
or genesis are created. A successful build or local driver cannot supply a
real bank hash.

## Required tools and host

Transfer or reproduce the exact reviewed Linux x86_64 binaries into one private
directory: `agave-validator`, `solana-genesis`, `solana-keygen`,
`classic-genesis-audit-v2`, `agave-ledger-tool` and
`classic-genesis-allocation-bytes`. Their selected digests are in
`host-preflight.py`, `consensus-audit-artifact.json` and
`ledger-tool-artifact.json` and `allocation-decoder-artifact.json`. Keep this repository's mainnet scripts and those
manifests together, including `offline_process.py` and `cgroup_limits.py`. The pinned ledger tool was compiled from the complete
reviewed Agave source tree; existing runtime binaries were unchanged.

The same host admission applies as for the three-validator launcher: Linux
x86_64, hard open-file limit at least 1,000,000, four effective CPU cores,
16 GiB effective memory and 16 GiB available private storage. These are the
private rehearsal profile, not production sizing. No lower host requirement,
check bypass or automatically provisioned server is implemented.

## Default: read-only admission

```sh
python3 mainnet/prepare-consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle-id <fresh-private-bundle-id>
```

Exit 0 with `preparation-host-admitted` means only that host and selected tools
pass these checks. It creates no keys, directories or ledgers. It does not
review an existing bundle or start a rehearsal. Exit 78 is a blocker. Both
modes returned 78 on the existing host, before private preparation, with the
hard-file-limit and declared memory-profile failures recorded.

## Explicit private preparation after admission

Review the host, resource budget and new bundle identifier first. This command
creates disposable private keys and a new valueless synthetic genesis:

```sh
python3 mainnet/prepare-consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle-id <fresh-private-bundle-id> \
  --prepare --ack fresh-private-synthetic-genesis
```

The tool refuses the canonical service, any active validator, unsafe/shared
output directories and a retained identifier. New owner-only attempts live
under `/data/mainnet-consensus-v2/preparations/`; bundles live under its
`bundles/` directory. The generated keys remain there. Never import production,
origin-chain, devnet or earlier rehearsal keys. Retain every failed attempt;
use a separately reviewed fresh identifier for later preparation.

The private policy is fixed: development classification, hashing PoH calibrated
with `--hashes-per-tick auto`, zero inflation and zero selected fee/rent burns.
Three new identities, vote keys and stake keys are bootstrapped. A new disposable
system-owned reserve receives the remainder of exactly 1,000,000,000,000 native
base units. A probe counts all fixed allocations; the final genesis is audited
again and must total that exact budget. These units are synthetic. The reserve
is not a production bridge vault and has no funded origin backing.

The selected archive must match its standalone genesis and include its initial
slot-zero blocks. Two fresh directories receive bounded validated copies. On
each, the pinned ledger tool runs `verify --halt-at-slot 0 --no-snapshot
--print-bank-hash` with normal ledger verification. Its separate `shred-version
--no-snapshot` command internally defaults to slot 0; that subcommand does not
accept `--halt-at-slot`. Neither command skips PoH/transaction verification or
ignores the host file-limit check.

Both copies must report the same valid slot-zero bank hash and shred version.
The bank hash must differ from the genesis hash. The tool writes the exact
launcher manifest only after matching replays, complete inventory/accounting
and final bundle admission. It does not learn trusted launch pins from RPC.
Two replays on one host establish repeatability, not independent verification
or distributed consensus. No such real replay has passed on the current host.

After a real `prepared` result, independently review the retained outputs and
run the separate `consensus.py` admission and explicit private rehearsal from
[the launcher contract](CONSENSUS_REHEARSAL.md). Preparation cannot launch nodes.

## Preserve the probe calibration

The budget probe alone uses `--hashes-per-tick auto`. The pinned Development
compiler measures the host and selects half its measured peak hash rate;
running that calibration twice can produce different genesis parameters.
Preparation now reads the probe auditor's positive u64 hash count and supplies
that exact numeric value to the final compiler. It checks the final audited
count and full PoH configuration against the probe before copying genesis into
the launch bundle or starting either slot-zero replay. A mismatch retains the
failed attempt and partial outputs. Host and validator PoH speed checks remain
unchanged; no sleep mode or performance-check bypass is introduced.

Three additional offline groups cover numeric bounds/types, the final command,
and changed final PoH reports. The synthetic orchestration driver verifies one
calibration followed by numeric selection, retained refusal before bundle copy
or replay, and the successful two-replay path. All 20 focused checks pass; the
full package runs 149 checks locally with 148 passing and one Linux-only check
skipped. These are supplied tool responses and disposable files, not compiled
genesis or real replay evidence. See [the local calibration review](../evidence/mainnet-preparation-poh-binding-local.json).

This removes one source of parameter drift within the existing preparer. It
does not integrate the reserve-byte adapter, prove that every other account or
non-account parameter is unchanged, or reuse a retained genesis/key set. Fresh
compiled genesis, complete byte comparison and actual strict replays still need
an admitted Linux host and a new reviewed attempt.

## Empty synthetic reserve admission

Before copying the final genesis or invoking either replay, preparation now
requires the selected reserve to have an integer data length of zero and an
explicit false executable flag, in addition to its exact address, System owner
and balance. Previously the latter three fields alone admitted a nonempty or
executable reserve in a supplied audit report.

One new orchestration regression covers nine invalid data-length/flag variants.
All nine reproduced the previous acceptance; each now retains a failed attempt
before bundle genesis, manifest or ledger-tool invocation. The normal empty
reserve still completes the existing synthetic two-replay driver. All 21 focused
checks pass; the offline package runs 150 checks locally, with 149 passing and
one existing Linux-only skip. These tests use supplied tool responses and
disposable files, not compiled genesis or real ledger replay. Full account-byte
comparison, reserve-byte adapter integration and an admitted Linux host remain
separate requirements. See [the reserve admission review](../evidence/mainnet-preparation-reserve-shape-local.json).

## Bounded offline tools and cancellation

Each pinned tool now runs in its own process group with a fixed timeout,
4 MiB stdout limit and 8 MiB private stderr limit. Both streams are drained
while it runs. A timeout, output overflow, cancellation or other exceptional
exit kills that owned group and reaps its direct child before the failed
preparation result is saved. A descendant retaining a pipe cannot silently
outlive the timeout. Cleanup never targets an unrelated process or service.
The attempt, partial keys, ledgers and private diagnostic files remain retained.

The default admission path still starts no process. Ten local lifecycle checks
use disposable Python processes, including actual timeouts, overflow and
inherited-pipe descendants. They do not execute the compiled genesis or ledger
tools. The current package also passed all52checks on the private Linux compiler
host. The helper executed checksum-verified keygen, genesis and ledger-tool
help commands, with all six selected artifacts unchanged and zero validators
before/after. Earlier provider DNS dispatch failures remain retained. This
verifies process control, not genesis compilation, replay or host admission.
See [the initial local evidence](../evidence/mainnet-offline-process.json) and
[the completed Linux verification](../evidence/mainnet-offline-process-linux.json).

## Tool identity checks during preparation

Initial artifact admission and every later offline invocation use the same
bounded regular-file fingerprint as host admission. Each read checks the exact
reviewed length, digest and executable permission, refuses symlinks and special
files, and rejects file identity or metadata changes observed during hashing.
Failures retain the preparation attempt and report a path-free failure code.
The caller does not launch the tool after a failed check.

Four additional local regression groups cover artifact replacement during a
read, a FIFO without a writer, invalid file types and permissions, and runtime
changes after host admission but before the first tool invocation. The complete
synthetic preparation driver still exercises both replay steps. These checks
are not compiled-tool or consensus evidence. The binary directory must remain
under trusted operator control: fingerprinting does not atomically bind the
later path-based process execution to the checked descriptor.

## Final bundle inspection tool admission

The bundle checker also uses the bounded executable fingerprint before running
its selected genesis auditor or keygen public-key inspection. Previously this
helper hashed the full file before checking its length, and could accept a
same-byte replacement during that read. Wrong lengths now refuse before opening;
changed file identity, permissions or bytes refuse before the process helper.
Read failures use a path-free error. Existing output limits, timeouts and
check-only behavior are unchanged.

Four new fixture groups cover read ordering, same-byte replacement,
non-executable files and sanitized I/O failure. All ten focused checks pass;
the complete offline preparation package runs 146 checks locally, with 145
passing and the existing Linux-only process check skipped. These are disposable
file/process tests, not compiled-tool execution or a newly admitted host. The
later path-based execution still requires trusted control of the binary
directory. See [the scoped result](../evidence/mainnet-bundle-tool-fingerprint-local.json).

## Evidence and limits

The original thirteen preparation checks cover blocked/canonical hosts, read-only default,
commands, strict output parsing, exact budgets, disagreement, retained attempts
and redacted failures. A synthetic tool driver exercises the full orchestration
and real archive materialization; its simulated bank outputs are not real
replay evidence. Together with the ten process lifecycle checks and existing
launcher/archive/host checks, 52 local checks passed at that initial review. Historical preparation
evidence retains its original counts and source hashes. Actual compiled-tool CLI discovery and blocked-host admissions are
recorded in [the scoped evidence](../evidence/mainnet-genesis-preparation.json).

An initial private CLI assertion incorrectly required a flag on `shred-version`
and is retained as failed. The source and assertion were corrected against the
pinned tool's actual help. It created no private genesis namespace or validator.

Real hashing genesis, bank replay, full-validator consensus/recovery, independent
operators/hosts, actual funded backing, custody and external security review
remain required before production. The canonical devnet and its fresh stability
run are separate and unchanged.


## Bind the audited policy to the probe

The final genesis must preserve all five policy objects exposed by the pinned
v2 auditor: inflation, fee-rate governor, rent, epoch schedule and PoH
configuration. Preparation requires each object in both reports and compares
canonical JSON before copying the genesis into its bundle or invoking either
replay. JSON booleans cannot substitute for numeric zero. Missing objects,
non-finite values and policy drift retain a failed attempt. The existing
single-calibration, supply, reserve, binary and host checks remain in force.

The [offline policy-binding review](../evidence/mainnet-preparation-policy-binding-local.json)
records 24 focused checks and 153 package checks (152 passing locally, one
Linux-only skip). Fifteen final-report mutation cases refuse before bundle copy
or replay; the unchanged synthetic fixture still prepares successfully. These
are supplied tool responses and disposable files, not compiled genesis or
actual ledger replay. The v2 auditor does not expose every GenesisConfig field
or full account bytes. This comparison therefore does not establish complete
non-account equivalence, account-data identity or reserve-adapter integration.


## Bounded decoder input transport

The offline process runner now accepts optional immutable `input_bytes`, bounded
to 16 MiB for selected genesis input. It writes through a nonblocking pipe while
draining both output streams under the existing deadline and output bounds.
Empty or absent input delivers EOF; tools never inherit an interactive terminal.
An early input-pipe closure or timeout fails and reaps the owned process group.
The runner does not copy input into logs or command arguments; callers still
select and validate the executable, input file, digest and returned report.

The [input transport review](../evidence/mainnet-offline-input-transport-local.json)
records real local child-process tests for exact maximum-size binary delivery,
simultaneous pipe pressure, EOF, invalid input, early closure and a nonreading
child. Six new groups pass alongside the ten existing process groups. The full
local package has 158 passes and one Linux-only skip. No genesis decoder,
compiler or validator ran. This supplies the bounded transport needed for the
allocation-byte decoder; integrating that decoder and reserve input into fresh
preparation, checking every account/parameter and running strict ledger replays
remain separate work requiring reviewed tools and an admitted Linux host.


## Selected authority-review input snapshot

The separate offline authority reviewer now sends its admitted genesis bytes
directly through bounded stdin. It no longer opens the genesis path again in
a shell. Its initial reader uses nonblocking open so a named pipe cannot wait
for a writer before file-type admission, and rejects empty inputs and malformed
digest selectors. Existing post-review selection checks still reject changed
inputs and preserve the failed attempt and decoded output.

Nine local authority-review checks pass, including three new groups for pipe
refusal, empty/malformed input and snapshot handoff with later mutation. The
full offline suite has 161 passes and one existing Linux-only skip locally.
Decoder invocation is mocked in the handoff checks; no actual genesis decoder,
worker rehearsal or canonical service was run. Existing retained attempts are
unchanged. This integrates bounded input into the authority reviewer only; the
allocation-byte rehearsal and fresh compiler integration remain open. See
`evidence/mainnet-authority-input-snapshot-local.json`.


## Bind audited allocations to the budget probe

Preparation validates both complete metadata inventories and compares all
account addresses, owners, balances, data lengths and executable flags before
copying the final genesis or starting either replay. Only the selected empty
System reserve balance may change, from one unit to the exact remaining budget.
Balanced redistribution among other accounts is rejected even when the final
total is correct. Duplicate rows, malformed values and inconsistent totals
fail; inventory order is immaterial.

The local supplied-response driver now rejects eight final inventory changes
before bundle copy or replay. Fourteen malformed-inventory controls also pass.
The focused preparation suite has 27 passes; the full offline suite has 164
passes and one existing Linux-only skip locally. Failed preparation outputs
remain retained. See `evidence/mainnet-preparation-allocation-binding-local.json`.

This binds the five metadata fields emitted by the pinned v2 auditor. It does
not compare account data contents, rent epochs or complete account fingerprints.
The complete byte decoder, reserve adapter and fresh real compilation/replays
remain separate requirements; no acceptance gate is promoted by these tests.


## Current allocation decoder artifact

A fresh isolated Linux build of the current allocation-byte decoder completed
with all 11 Rust tests passing under Rust 1.86.0, offline locked dependencies
and two build jobs. The selected debug executable is pinned in
`allocation-decoder-artifact.json`, with its exact size, SHA256 and current
manifest, lockfile and source hashes. The older decoder artifact and all retained
attempts remain unchanged. Canonical runtime identity and all 45 frozen files
matched before and after this build.

This establishes a current executable/source pair for the next integration
step. It does not admit the compiler worker as a three-validator host, run the
new executable against a fresh genesis or enable it in the preparer. Unit tests
use constructed data. Reserve-adapter integration, complete byte comparisons,
real compilation/replay and consensus remain open. See
`evidence/mainnet-allocation-decoder-current-build.json`.


## Complete allocation decoding in preparation

Preparation now requires the current pinned allocation decoder at admission and
revalidates its executable alongside the other tools before every invocation.
After each compiler/auditor pair, it admits a nonempty bounded regular-file
snapshot and sends those exact bytes through bounded stdin. It retains private
decoder output even when review fails and checks that the input remains unchanged.

Both reports must agree with their independent metadata audits. Complete account
fingerprints, data digests, rent epochs and decoded authority summaries must
match between probe and final output. The sole account exception is the selected
empty, non-executable System reserve: its exact budgeted balance changes, so its
balance-dependent full fingerprint is excluded from equality. Its address,
owner, empty-data digest, zero rent epoch and every other field remain fixed.
No other account fingerprint is omitted. The decoder's complete non-account
parameter digest must match; creation times may differ and are recorded
explicitly. The copied final genesis must still match the admitted digest before
any ledger replay.

The 35 focused preparation tests pass. Eight new groups cover report drift,
malformed probe/final reports, the reserve exception, changed input, special-file
and replacement refusal, and required decoder artifact admission. The full
local offline suite has 172 passes and one existing Linux-only skip. All compiler,
decoder, key-generation and replay responses in the orchestration fixtures are
supplied test data; no actual genesis or replay ran in this review. See
`evidence/mainnet-preparation-decoder-integration-local.json`.

This completes the preparer's decoder wiring and comparison logic under local
fixtures. It supersedes earlier statements that the decoder is not integrated.
The reserve-address adapter remains separate, and the integrated flow still
needs fresh real compilation and two strict replays on an admitted Linux host.
The current worker has not passed that admission. No release acceptance,
custody, backing, independent operators or consensus is established here.


## Current executable on retained genesis bytes

A separate bounded audit now runs the exact current decoder executable on the
selected retained synthetic genesis. Its complete output matches the previous
retained report byte-for-byte: all 249 accounts and exactly 1,000,000,000,000
native units. The current preparer comparison helper accepts that actual report
against the separately selected metadata. Six controlled changes to copied
reports either refuse admission or produce a different comparison: nonreserve
account fingerprint, data digest, rent epoch, non-account parameters, reserve
rent epoch and permission promotion.

The audit preserves the selected original files, previous reports/attempts,
current decoder and six runtime executables. Canonical runtime and all 45 frozen
files still match. It creates a fresh private audit namespace only: no compiler,
private-key access, genesis creation, bank replay, chain request or validator.
The worker still has no rehearsal host admission. This is actual retained-byte
compatibility evidence for the current executable/helper pair, not a fresh
compiler-to-replay result. See
`evidence/mainnet-allocation-current-baseline-review.json`.


## Bounded reserve-adapter transport

`reserve-byte-stdio.mjs` exposes the existing offline reserve adapter as a Node 24
subprocess. Its sole argument is `prepare` or `review`; the selected input object
arrives on stdin, with a 32 MiB limit, strict UTF-8 decoding and a 30-second input
deadline. A successful result is one JSON document of at most 1 MiB on stdout.
Refusal exits 78 with a fixed diagnostic that does not echo selected reports,
assertion details or private paths. Exact u64 compiler-input digits and all
disabled execution/activation flags are preserved.

The caller must bound the complete subprocess lifetime, drain output and discard
stdout on every nonzero exit. The input timer does not bound a stalled output
consumer, and a pipe failure can leave incomplete output. Inputs and successful
reports remain private operational material. This interface opens no input or
output files and invokes no compiler, key generator, validator or RPC.

Eight transport tests plus the existing adapter and related planning checks pass
(73 total). They use supplied reports and actual local child processes, not new
genesis compilation. The preparer still does not invoke this interface. Node and
dependency artifact admission, externally selected planning input, integration
with fresh compilation and output verification remain required before any
replay. Existing host/security checks and production restrictions are unchanged.
See [the local transport evidence](../evidence/mainnet-reserve-stdio-local.json).


## Pure accounting import boundary

The reserve adapter now imports `bootstrap-core.mjs`, which holds the unchanged
accounting function. `bootstrap.mjs` retains its existing file CLI and export for
compatibility. This separates the adapter's library dependency graph from a CLI
entrypoint that could otherwise run when a bundler collapses module URLs.
The bootstrap fixture's provenance list includes the new core.

The entrypoint-collision regression failed before the split and passes afterward.
All 75 related offline Node checks pass, including byte-for-byte CLI report
compatibility and refusal of a missing input file. The accounting function body
is unchanged. See [the scoped evidence](../evidence/mainnet-bootstrap-import-isolation-local.json).

An exploratory bundle excludes the file CLI, but is **not admitted**: its strict
diagnostic check fails on a dependency warning and its graph retains an optional
non-builtin import. Runtime/dependency artifact admission and preparer integration
remain open. No fresh genesis, replay, validator or production operation was run.
