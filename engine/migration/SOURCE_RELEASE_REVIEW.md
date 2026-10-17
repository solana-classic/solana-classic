# Individual source-candidate release review

The source-built devnet has completed its replacement full-day test and final
browser regression. Whole-release acceptance remains false. The historical
`evidence/acceptance-gates.json` selects the preceding API commit; its passed
requirements are not transferred to this candidate.

The separate [current review inventory](../../evidence/agave-source-acceptance-gates.json)
binds the exact source candidate, freeze, unchanged checklist and checksum-bound
individual proofs. It currently records 25 of 75 requirements reviewed:
G1.01, G1.02, G1.07, G2.02, G2.03, G2.04, G2.07, G2.08, G3.01, G4.03, G4.04, G5.01, G5.05,
G5.08, G5.09, G5.12, G6.01 through G6.05, G6.07, G6.11, G7.03 and G7.04. The other 50 remain
unreviewed in this inventory, including the derived whole-release check. Missing
attestations do not necessarily mean functionality failed; they mean the
requirement has not been individually accepted for this candidate.

The [browser individual review](../../evidence/agave-source-browser-individual-review.json)
uses the two frozen-origin profiles for candidate acceptance. The two branded
profiles remain separately labelled supplemental coverage. All four raw report
hashes and selected public fields were checked, together with complete runtime
identity before and after, frozen frontend entry hashes and the retained
executed-driver assertions. No new browser session or transaction was started.

The review covers native transfer, fungible and NFT issuance/transfers,
immutable authorities, the actual browser journey, chain-checked gallery
ownership and anonymous HTTPS frontend/deep-link/metadata access. Supply,
balance and authority conclusions rely on the retained successful driver
assertions: these reports do not contain full raw RPC replies or supply an
independent transaction replay. Failed attempts remain failed and retained.

The [operations individual review](../../evidence/agave-source-operations-individual-review.json)
adds eight requirements from the exact selected load, restart and negative-control
reports. All 200 load timings and distinct receipts were recalculated: p95 confirmed
latency was 3.313 seconds, p95 finalization was 15.350 seconds, and all operations
confirmed within 15 seconds. The restart preserved one sampled balance, 50 mint
records, 43 populated owner records and 100 immutable file URL/hash pairs. Separate
bounded controls recorded prohibited RPC rejection and an asset-admission 429.
That response does not identify the exhausted quota bucket or prove client-IP
attribution. These are retained observations; no workload, restart or abuse probe
was repeated.

The [cold-restore individual review](../../evidence/agave-source-recovery-individual-review.json)
adds G5.09 from the selected isolated recovery and its four checksum-bound
supporting reports. The records cover all 2,163 archived accounts, separately
reconciled vote fees, all database table hashes and 1,992 immutable files. Actual
HTTPS verification covered 617 gallery entries, 1,234 associated files and 452
NFT owners. This review does not restore anything or treat the old archive as
a backup of later transactions.

The [deployment individual review](../../evidence/agave-source-deployment-individual-review.json)
adds G5.08 by linking the actual source-runtime migration to the subsequent
restart and exact final freeze. The fresh deployment preserved the complete
recorded bank and application state, with named protocol changes and vote fees
accounted for. Its runtime matches the restart-before identity; restart-after
matches the final frozen identity. The earlier partial G5.08 finding remains
retained and is explicitly superseded by this review. No deployment or restart
was repeated, and hardware-host reboot is not claimed.

The [rollback individual review](../../evidence/agave-source-rollback-individual-review.json)
adds G5.12 by pairing the retained actual rollback/restoration with current
read-only environment and freshness checks. Both public frontend variables are
production-only; no preview/development entries are configured. Five deployed
frontend files match the freeze, and repeated API/status observations return
no-store headers, current timestamps and advancing slots. This is current
project targeting, not an audit of every historical preview or manual override.
No preview deployment, alias mutation or transaction was performed.

The [scheduled browser targeting review](../../evidence/agave-source-soak-targeting-individual-review.json)
adds G6.07 from the exact replacement activation, retained terminal reports and
frozen browser/monitor source. All 45 source files and both configuration hashes
match. The 288 scheduled browser journeys used the recorded production frontend
and API; the monitor separately checked five frontend entry/asset hashes and
runtime identity across 2,880 observations. The same browser session remained
open throughout. Re-evaluating the terminal auditor at its original observation
time is a retrospective evidence check, not a new workload or current snapshot.
This does not accept the separate deadline or machine-specification requirements.

The [public disclosure review](../../evidence/agave-source-public-disclosure-individual-review.json)
adds G6.11 and G7.03. Anonymous HTTP reads verified both network-page shells,
the actual genesis and single-operator facts, the frozen dependency manifest,
and the current runtime's full source-built identity. Four selected published
files match the reviewed checkout bytes. The load, terminal report and README
limit the results to one validator and separate them from mainnet acceptance.
These are content/access checks; no new rendering, transaction or benchmark
was performed. Prior browser results retain their own observation times.

The [network identity review](../../evidence/agave-source-network-identity-individual-review.json)
adds G1.01 and G1.07 using fresh read-only genesis responses from the canonical
gateway and public Solana mainnet/devnet RPCs. The configured and actual candidate
genesis agree and differ from both public chains. The public configuration matches
the frozen configuration, including one operator and the experimental reset policy; the
complete runtime identity and all 45 source files still match. No wallet, signed
transaction or new workload was created. These checks establish current identity
and disclosure, not the historical H12 milestone. The 31 passing local identity
tests use mocked inputs; G5.10 remains unreviewed pending complete entry-point
coverage and appropriately bound refusal evidence.

G5.07 remains unreviewed. The [monitoring attribution review](../../evidence/agave-source-monitoring-attribution-review.json)
verifies the deployed monitor source, three saved thresholds, the historical
trigger/recovery record and the account's saved Email & In-App routing. The
controlled fault fixture used a different deployment from the final steady
monitor; its exact deployed source binding remains unresolved. Matching today's
source to the historical final configuration does not close that gap. No new
fault or delivery receipt is claimed. The earlier G5.08 and G5.12 gaps are
explicitly superseded by their later reviews.

The [exact-source loopback review](../../evidence/agave-source-monitoring-loopback-review.json)
now exercises the unchanged current monitor source against a local synthetic
HTTP server. Upstream failure and a real 60.510-second finalized-slot stall
were both detected, followed by recovery. Read-only SSH separately matched the
deployed source checksum. Railway signaling was disabled for this isolated run;
it supplies no fresh hosted alert or delivery receipt and does not exercise the
hosted polling loop's debounce. The historical hosted fixture attribution gap
remains open, and G5.07 stays unreviewed. No canonical fault, restart or duplicate
stability test was initiated.

The [negative-control coverage review](../../evidence/agave-source-negative-control-coverage-review.json)
keeps G4.02 and G5.02 through G5.06 unreviewed. All 36 checks in the selected
retained run still pass within their original scope, and its exact report bytes
and before/after runtime match. Those results do not establish every gallery
forgery class, valid faucet concurrency/timeout recovery, forwarding-header
counter attribution, preflight side-effect absence, or all asset limits from
first exposure. The review records the observed subset, missing evidence and
next isolated review for each requirement. No canonical fault, repeat grant,
quota exhaustion or new workload was introduced; the inventory remains 24/75.

The [isolated faucet review](../../evidence/agave-source-faucet-isolated-review.json)
adds seven new checks against the exact retained candidate route/store source:
concurrent duplicate and distinct requests, persistent daily limits, and original
signature reconciliation across five supplied status outcomes. The fixture uses
real disposable SQLite and in-process HTTP injection, with mocked RPC/grant
methods and maintenance admission. All seven pass; 51 related checks also pass
separately against repository source. Earlier configuration/dependency startup
failures and the candidate's correct maintenance refusal remain recorded.
No protected release files or deployed controls changed. These scoped results
narrow G5.02/G5.03 coverage gaps without accepting either complete requirement;
application reopen is not a host restart and supplied status is not chain proof.

Run the separate offline integrity checker with:

```sh
python3 -B engine/migration/source_inventory_review.py
```

It binds the exact source freeze and the reviewed checklist ID contract, checks
all individual proof candidates, declarations and immediate supporting hashes,
and requires the unreviewed list and counts to agree. Unknown IDs, duplicate
JSON keys, altered evidence, linked/special files and historical-candidate
substitution refuse. G7.05 cannot be supplied as an attestation. Exit zero means
inventory integrity only; every output keeps release, mainnet and bridge
acceptance false. The checker performs no network reads, test activation or
writes and does not independently validate behavioral claims or recursively
interpret nested proof semantics. The ignored checklist text is not reread;
its reviewed digest and stable IDs are pinned in the checker.

Twenty-five adversarial tests cover the new checker, and all 87 offline review
regressions pass. The [local validation record](../../evidence/source-inventory-review-local.json)
records the checker/test hashes and current inventory result. This adds no
accepted requirement and leaves the 45 frozen source files unchanged.

This inventory is not consumed by the frozen legacy release evaluator and
cannot turn its result into a current-candidate pass. Preserve that evaluator,
its original manifest and all 45 frozen files. A future source-specific release
evaluation must bind this exact freeze/checklist, reject old-candidate proofs,
validate every selected proof and individually review all remaining requirements
before it can evaluate overall acceptance. An inventory count alone cannot do so.

Next review remaining recovery, monitoring, rollback and negative-control
proofs against the complete wording of each requirement. Do not replay finalized
operations or rerun the completed soak merely to obtain another checkbox.
Privacy/log coverage, adverse UI paths, historical deadline claims and operator
access acknowledgment must not be inferred from a successful happy-path journey.
Mainnet additionally requires suitable Linux hosting, actual full-validator
consensus/recovery, funded backing, custody, independent operators and security
review. No mainnet, bridge or overall release approval is supplied here.


The [isolated faucet transport-loss review](../../evidence/agave-source-faucet-transport-loss-review.json)
adds three exact-source checks using real loopback HTTP. Disconnecting after
receiving a synthetic grant request, or withholding its response until the
unchanged ten-second deadline, retains one uncertain reservation. Eight retries
after application reopen return that receipt without a second upstream grant
request. A lost status response also preserves the recorded signature; a later
lookup reconciles that same signature from a supplied finalized result. The
clock, fetch and connection methods are not mocked; maintenance admission and
the upstream chain responses remain fixture-only. These are local transport and
persistence checks, not real airdrop, finality or container-crash evidence.
G5.02 and G5.03 remain unreviewed as complete requirements.


The [CORS individual review](../../evidence/agave-source-cors-individual-review.json)
adds G5.05. Nine public preflights cover faucet, assets and RPC: the sole approved
production origin succeeds, while unknown and null origins are rejected.
Authenticated read-only snapshots show all four business tables and the asset
file stat inventory unchanged across those requests. No preview origin is
approved. Four existing checks pass against frozen source without an upstream
call or faucet reservation; the retained negative-control report separately
proves forbidden no-Origin RPC admission. Asset stats are not a fresh full-byte
audit, and volatile request-rate counters are outside the business-state claim.
No POST, grant, transaction, configuration change or restart was repeated.


The [faucet process review](../../evidence/agave-source-faucet-process-review.json)
adds four isolated checks against both retained candidate and current source.
Two Store processes share a disposable SQLite database while concurrent batches
exercise wallet, IP and global caps. After both processes exit cleanly, a fresh
process denies excess reservations and reuses prior request IDs with unchanged
counters and receipt fingerprints. A duplicate-request case creates one
reservation across eight submissions and rejects a conflicting wallet after
process replacement. Workers attest the Store and configuration checksums.
These checks exercise actual database process boundaries, but no API restart,
abrupt crash, grant submission or chain finality. G5.02 and G5.03 remain
unreviewed; the inventory stays at 25 of 75.


The [isolated gallery review](../../evidence/agave-source-gallery-isolated-review.json)
adds 17 checks against both retained candidate and current source. Correct NFT
and meme controls pass the real route, verifier and Token-2022 decoders. Encoded
metadata/pointer mismatches, wrong account owner or issuance program, wrong
genesis, wrong mint and unknown signature all refuse with unchanged database
rows and no gallery insertion. Chain observations are supplied; no issuance,
finality or deployed rejection is claimed. The first retained fixture failed
collection because a dependency path was absent; that failure remains retained,
and a fresh identical fixture passed after verified dependency linking.
G4.02 remains unreviewed pending the complete individual remote gate review.
