# Separate bootstrap-gated bridge prototype

`gated-program` is a separate experimental SBF entrypoint, package version0.3.0.
It links the existing V2 implementation as a library with its entrypoint
suppressed. V2 source and artifacts are unchanged. This is new executable code
with a new native account contract, not an installed upgrade or an automatic
migration of any old fixture, client, journal or authority selection.

The V2 initializer starts paused, but a quorum can unpause it before bootstrap.
The separate entrypoint adds a mandatory gate for native unpause, native claims
and native returns. It requires the selected program-owned configuration PDA,
then a trailing vault, bootstrap record and consumed bootstrap-claim receipt.
The gate checks their exact PDAs, owners, nonexecutable state and layouts, the
record's witness arithmetic and protected floor, its nonzero source event, the
consumed receipt bytes and the current vault floor/balance. It strips the three
trailing accounts before calling the unchanged V2 handler. The core retains
its quorum, authority, domain, amount, pause, replay and accounting guards.

## Account contract

For native `SetPause` where either pause flag becomes false, `Claim` and
`Deposit`, append these three accounts after all existing core accounts and
committee signers:

1. The native vault PDA for the selected configuration.
2. The immutable bootstrap record PDA for that configuration.
3. The consumed claim PDA for the record's exact source event.

The account metadata requests these as read-only; the vault may already be
writable through its core role. Missing, substituted or invalid trailers
refuse. Existing native transactions without a trailer cannot silently inherit
this version. Any future SDK, signer or journal integration needs separate
reviewed code/artifact/policy pins and the changed instruction accounts.

Initialization and the one-time native bootstrap retain all V2 checks. Native
full pause (`new_locks=true`, `settlement=true`) remains available without the
trailer, so a missing/corrupt marker cannot prevent emergency pausing. Escrow
locks, redemption and pause controls retain their existing account contract;
source locks must be possible before the native bootstrap can consume one.
The current policy epoch is1. Later epoch/migration support is not implemented.

## Trust and release limits

The bootstrap witness is still a committee attestation. Matching programme-owned
records and arithmetic cannot independently prove source finality, complete
genesis contents or original-token backing. A malicious upgrade can replace
the entire gate; actual upgrade custody and external security review remain
required. The gate does not authenticate a manually injected synthetic VM
account or accept old missing transaction history. Account ownership is enforced
by the SVM on a real chain; test corruption is a deliberately injected fixture.

This source is not deployed to devnet, any retained rehearsal ledger or a
production chain. No real SOC, native mainnet, signer or real-value bridge is
activated. Genuine new genesis and complete activation inventory, capable Linux
hosting/full-validator consensus, independent operators, funded backing,
recovery and explicit release review remain separate gates.

## Verification

The runtime scenarios execute only in fresh in-memory VMs with synthetic
balances and disposable keys. The new SBF artifact is selected by its committed
SHA256; Token-2022 retains its reviewed checksum. The scenarios cover refusal
before bootstrap, the unchanged ability to pause, actual one-time bootstrap
followed by lock/claim/return/redemption, preserved protected floor and consumed
backing, invalid marker/receipt/floor cases, missing or substituted trailer and
insufficient/duplicate quorum. An injected unpaused native configuration still
cannot bypass the gate for a claim or return.

CI compiles these scenario sources with Rust1.89 and the committed lockfile.
It does not claim SBF execution without the selected artifact. Actual build and
runtime results, including retained failed attempts, are recorded separately in
`evidence/bridge-gated-bootstrap.json`. All five groups passed on the separate
Linux worker. Six worker-admission/source-integrity guards passed locally. The
first local build stopped because cached tools were not mounted in the SDK; a
fresh private SDK copy used the existing cache without changing global tools.
The first remote staging transfer interrupted before dispatch and remains
retained. A fresh namespace executed the completed runtime scenarios. Selected
sources, the original runtime binaries and original V2 artifacts remain unchanged.


[The separate unsigned client](GATED_NATIVE_CLIENT.md) constructs the new native
account contract with explicit code/policy/bootstrap selections. It neither
changes existing signed journals nor verifies live chain state or grants
production signing permission.
