# Fresh gated destination observations on Agave

The separate bootstrap-gated programme now runs on a fresh private source-built
Agave 3.0.14 test-validator ledger. A second fresh origin ledger uses the unchanged
V2 programme and Token-2022 artifact. No retained ledger, key, operation or nonce
is reused, and the running public devnet and stability candidate are unchanged.

Ten actual integration checks pass. A new immutable six-decimal synthetic mint
has 2,000,000 base units. The origin locks 102,000 units to the destination vault;
a committee-attested bootstrap consumes that event, records the two-row witness
and protects 2,000,000 native base units. The gated programme rejects opening
without its bootstrap trailer, then accepts the selected valid opening. A new
50,000-unit ordinary source lock finalizes on the private origin.

The unchanged destination observer completes its 15 bounded read-only calls
against real Agave RPC: current programme/ProgramData/code/authority brackets,
exact configuration, vault, bootstrap and consumed/absent receipts, Rent, Clock,
fee, block height and blockhash validity. Wrong full ProgramData selection and
an expired message selection each refuse actual chain observations without
economic changes. The exact new gated claim simulates successfully, without
broadcast or state changes. Nine setup/source transactions finalize once; two
are source locks. No ordinary claim is submitted and no operational journal
handoff is enabled.

The ordinary source liability deliberately remains unsubmitted: origin escrow
and counter 152,000, destination counter 102,000, reserve 1,900,000,000 and recipient
balance 100,000,000 native base units. Keys, signed setup bytes, raw reports and
ledgers remain private. Both new processes stop, the private validator census
is clear, and all 18 selected public inputs plus four runtime executables remain
unchanged. Stopping is a bounded SIGINT process exit, not application-level flush,
cold-restore or physical-host-loss evidence.

Six local worker admission groups cover wrong service, existing attempts and
ledgers, aliases/open directories, altered source and exact loopback commands.
Thirty-five observer/message and 30 roadmap regressions also pass. CI runs the
existing 352 bridge regressions and new worker guards; it does not start Agave or
execute the separately selected SBF artifacts. The actual private rehearsal
uses existing selected artifacts without rebuilding them.

These are two processes on one worker with disposable synthetic committee keys.
The two-row budget is hypothetical and does not enumerate or back the complete
test-validator supply. Same-endpoint finalized observations are not independent
source inclusion/economic-history verification. The new result does not resolve
the older missing native history or expired redemption, establish full-validator
consensus, authorize signing/submission or accept production custody and security.
Complete funded backing, a reviewed durable active lifecycle, independent
operators and a capable three-validator rehearsal host remain required.

See evidence/bridge-gated-destination-agave.json for aggregate results and exact
public source/artifact hashes. Preserve the completed private attempt; never
rerun its setup or replay its finalized transactions.
