# Offline gated-native message compatibility

`gated-message-review.mjs` adds a separate offline description and signature
verifier for `native-bootstrap-trailer-v3`. It reconstructs the claim, return
or pause instruction through the reviewed unsigned client. It does not change
journal versions1–3, the legacy SDK, the compiled programme or a deployment.

`describeGatedNativeMessage(intent)` requires exact kind/parameter schemas,
a canonical on-curve fee payer, blockhash and positive safe-integer expiry
height. Claim payer, recipient and quorum roles stay distinct; return uses its
sender as the sole fee payer; pause uses a separate fee payer. Signers cannot
alias protected nonsigner accounts. Full pause explicitly selects a null
bootstrap input and preserves the emergency path without a record.

The description binds the complete normalized programme pins, configuration
bytes hash, bootstrap-record hash/source event, declared minimum rent, exact
compiled message and expiry height into a domain-separated review SHA256.
This includes code, full ProgramData and upgrade-authority selections. Changing
a declared value that leaves instruction bytes identical still changes the
review digest. The caller must retain an independently selected digest outside
the supplied intent; recomputing it from untrusted inputs is not authentication.

`reviewGatedNativeSignedTransaction({intent, expectedReviewSHA256,
transactionBytes})` reconstructs that selection and requires the external digest.
It accepts only a canonical single-instruction legacy transaction up to1232
bytes, the exact compiled message and signer set, and every valid signature.
Versioned messages, altered instructions/accounts/privileges, missing or invalid
signatures, extra instructions and trailing bytes refuse. Returned transaction
hashes and unsigned message bytes are local review material, not public evidence.

Solana compilation merges account permissions across repeated occurrences.
The gated vault is writable in the core and declared read-only in the trailer;
decoding the transaction presents both occurrences as writable. Comparing raw
instruction-meta flags to decoded flags would falsely refuse a correct claim.
The verifier instead compares the complete independently reconstructed compiled
message, including its header, ordered keys, instruction indices/data and hash.
Changing another gate account's privileges still refuses.

Nineteen synthetic offline groups verify positive claim/return/all pause paths,
selection and signature tampering, exact byte/schema bounds, role separation,
compiled duplicate-account behavior and legacy incompatibility. An old journal
preparation call refuses a new gated transaction before creating a record; an
existing version1 synthetic journal remains byte-for-byte unchanged after an
incompatible review. Test keys exist only in disposable fixture memory. Tests
make no chain requests and create no validator or external transaction.

This is signature compatibility, not signer handoff or a new journal lifecycle.
All chain-state, source-finality, expiry, journal-preparation, signing, broadcast
and production permissions remain false. Expiry height and snapshots are
selected declarations; no live height, blockhash validity, ownership, current
rent, vault balance, deployed code, backing or finality is observed. New journal
integration still needs fresh authenticated observations, durable exclusive
persistence and exactly-once handoff/recovery review. Retained signed requests,
expired unresolved obligations and missing native history are not converted,
retried or resolved by this module. No SBF execution or rebuild occurs in this
review; the earlier client-to-SBF result is separately retained.
