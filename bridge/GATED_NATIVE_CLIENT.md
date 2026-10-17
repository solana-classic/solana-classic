# Unsigned client for the gated native prototype

`gated-native.mjs` provides three separate builders for the experimental
`native-bootstrap-trailer-v3` contract: native claim, native return and native
pause control. They do not change `sdk.mjs`, existing journal versions, signed
messages or signer handoff. The selected SBF SHA256 and byte length match the
separate compiled prototype's committed artifact pin. This source does not
install that code on a chain.

## Explicit selections

Each call supplies an exact context: ABI, full reviewed programme-pin object
and382 configuration bytes. The builder requires native side, epoch1, the
selected new artifact, canonical private chain identities and the exact policy
hash. It checks identities, all five committee keys, precision, threshold,
limits and relevant pause flags. Three configured distinct members are needed
for committee instructions. Amounts and nonces require u64 BigInts; there is no
floating-point conversion.

Native claim, return and any opening of a pause flag additionally supply120
bootstrap-record bytes, an external expected record hash, an external expected
source event and a declared minimum vault rent. The selected record must have
valid witness arithmetic and a sufficient protected floor. The consumed receipt
PDA comes from that source event, not from the incoming ordinary claim. Ordinary
claims cannot reuse the bootstrap credit or exceed the declared supply capacity.
Returns cannot exceed declared outstanding obligations. Protected account aliases
are rejected for wallet actors and claim recipients.

The caller must retain trusted selections separately. Recomputing a hash from
untrusted bytes does not establish authenticity. The builder does not read a
chain, check account ownership, verify ProgramData contents or observe current
rent, vault balance, finality, source history or custody. A supplied code hash
is a selection, not evidence that the implementation is deployed. Existing
read-only pin/reserve observers remain separate; no observer result or builder
output grants signing or journal-preparation authority.

## Account and wire contract

The native claim preserves the297-byte event following opcode2 and the existing
nine core accounts, then appends three read-only nonsigners: vault, bootstrap
record and consumed bootstrap receipt. The consumed receipt is separate from
the normal incoming claim's new replay receipt.

The native return encodes opcode1, origin amount, nonce and original-chain
recipient in49 bytes. Its five core accounts are sender, config, vault, new
source event and System, followed by the same three gate accounts. Sender is
its only instruction signer. The caller still needs a fee payer/blockhash and
an entirely separate reviewed transaction lifecycle.

Opening either pause flag encodes opcode3 and two exact booleans with config,
three committee signers and the gate accounts. Full pause has only the original
four accounts and requires no bootstrap input. This preserves the ability to
pause even when bootstrap data is unavailable. All builders return an unsigned
`TransactionInstruction` plus explicit false chain/signing/broadcast/production
permissions. The returned instruction is a mutable draft; later edits are not
authenticated by this result and need fresh review.

## Cross-language verification

Thirteen focused client groups cover byte/account order, external pins,
bootstrap records, quorum, consumed backing, capacity, aliasing, pause controls,
u64 precision, input immutability and a bounded four-signature legacy message.
A new Rust runtime group calls a bounded fixture-only JavaScript wire adapter
with public synthetic VM account bytes. Its unsigned output is parsed into an
instruction and executed against the already-selected compiled SBF. Private
keys remain in VM test memory; the adapter has no signing or network method.
The adapter derives fixture policy selections from its known test inputs; this
is not independent production pin selection.

The fresh worker profile runs the13 client groups and selects only the new
cross-language scenario. The five older runtime groups remain filtered. The
SBF implementation, Cargo inputs, artifact checksum and existing V2 source are
unchanged. No SBF rebuild, retained fixture upgrade, private key/ledger copy,
validator process or chain request is needed. CI compiles the new Rust test and
runs the JavaScript and seven worker-admission guards; actual VM execution has
separate aggregate evidence in `evidence/bridge-gated-native-client.json`.

Future production use still requires authenticated current account observations,
source finality/backing, complete activation accounting, reviewed custody and
upgrades, compatible signer/journal integration, independent security review,
capable full-validator hosting and an explicit release decision. The current
soak, native-history refusal and retained unresolved operations are unaffected.


## Retained execution result

The fresh corrected worker attempt passed13 client groups and the one new
JavaScript-to-SBF group; the five older runtime scenarios were filtered. Final
selected original escrow and both outstanding counters reconcile, the native
protected floor remains exact, replay refuses, and full pause closes both flags.
All20 selected public inputs and original V2/runtime artifacts match afterwards;
no validator or chain request was used. Node24.19.0, web3.js1.99.0 and Rust1.89
used the existing compiler cache. No SBF was rebuilt or global tool replaced.

The initial local snapshot assertion compared different clone types, and a
local staging-size guard stopped before remote actions. The first remote attempt
refused an incorrectly selected1.98.4 dependency version before tests; the
repository and worker both pin1.99.0. The corrected version guard and an explicit
repository-pin regression pass in the fresh attempt. All failed records remain
retained. Seven worker-admission groups and302 full bridge/client regressions
pass locally. These checks do not approve a production signer or real backing.
