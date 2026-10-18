# Selected finalized block-history diagnostics

The existing selected transaction reader refuses when `getTransaction` returns
null. This diagnostic checks a different retained representation without
lowering commitment, resubmitting a signed request or changing a journal.
It is restricted to numeric loopback RPC on separately admitted private ledger
copies. The canonical devnet and its running stability workload are excluded.

## Bounded read-only protocol

`source-block-history.mjs` captures selected programme pins, a returned-account
snapshot, the original first signature and source event before its first read.
Two current-code/configuration observations bracket six history queries:

- `getTransaction` with finalized commitment and JSON encoding.
- `getSignatureStatuses` with `searchTransactionHistory: true`.
- `getBlock` for the exact event slot, with finalized commitment, full JSON
  transactions, rewards included and maximum supported version0.
- `getBlocks` for only that exact slot at finalized commitment.
- `getFirstAvailableBlock` and `minimumLedgerSlot` as availability diagnostics.

These are at most14 reads in one15second deadline, configurable between100ms
and30seconds. History responses are at most64KiB, code responses at most2MiB,
and total wire bytes at most8MiB. Redirects, public/canonical genesis, URL
credentials/query paths, changed code/counters, unsafe context and oversized or
late responses refuse. Raw responses, including null and RPC errors, are saved
with the existing private exclusive file/directory fsync writer before parsing.
Each query has its own request selection and response record. Used evidence
folders cannot be reused. A completed diagnostic can remain explicitly blocked.

## Selected block extraction

The pure extractor requires one occurrence of the selected first signature in
one supported legacy transaction in a bounded block. It refuses missing or
ambiguous signatures, unsupported layouts and missing metadata. Native number
tokens are re-emitted using Node24 raw JSON support, preserving exact u64 digits
before the existing signed source-economic verifier checks signature, message,
roles, event, token/native movements, fee/rent and four expected inner transfers.
The block request supplies the selected slot; metadata and this slot assignment
are still statements by one RPC, not independent evidence of chain inclusion.

Block-level reward records are bounded and retained, but their economics are
not independently verified by this selected-transaction check. Transaction
rewards must satisfy the existing strict verifier; omitted fields are not
converted to empty values.

The selected block can recover compatible economic metadata when a signature
index cannot return it. A null/error block or rejected economic metadata stays
blocked. First/minimum-slot values describe availability on that private copy;
they do not establish why an original record is missing. Signature status alone,
current event accounts or a journal label cannot authorize settlement.

## Private rehearsal admission

`bridge/rehearsal/source-block-history.mjs` composes the existing guarded
current-account/journal comparison, authenticates the retained original signed
native source request and event without copying fixture keys, then queries
both selected source directions on new copies. It retains each result before
querying the next side. An unavailable or incompatible selected block fails the
attempt, while all raw diagnostics remain private. Owned copy processes must
stop and complete original inventories, selected private records, signed-source
bytes and copied journals must remain unchanged.

This is not a history repair or a full-validator replay. Never use root repair,
ledger reset, weaker commitment, altered host checks, a replacement nonce,
refund, retry or old-operation broadcast to make this check pass. Independent
historical code, source finality, complete history, backing, custody, recovery
permission, settlement and production acceptance remain false.

Twelve focused synthetic and real loopback HTTP groups cover exact number
preservation, signature ambiguity, unsupported versions, unavailable/error
blocks, malformed and oversized inputs, changed code/genesis/counters, unsafe
endpoints, protected response retention, redirects and one global deadline.
These tests do not constitute actual ledger-history acceptance.

Protocol references: [getBlock](https://solana.com/docs/rpc/http/getblock),
[getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses)
and [getBlocks](https://solana.com/docs/rpc/http/getblocks).


## Actual retained native-history investigation

The [scoped private-copy result](../evidence/bridge-source-block-history.json)
remains blocked. Six checks passed: five current-account/journal checks and the
selected original lock's block-level signed economic metadata. The native
return's retained signature reports confirmed success, not finalized success at its selected event
slot, but `getTransaction` returns null, finalized `getBlock` returns RPC error
-32004, and the exact-slot finalized `getBlocks` result is empty. Both current
programme brackets still match. Signature status can come from a bank status
cache; it does not reconstruct missing block or economic metadata. The cause
of the missing detailed history is still unestablished, and no native history
or settlement acceptance is granted.

All28 history requests have protected raw response records with matching
hashes. Both owned copies stopped; a separate audit verifies complete original
cold inventories, selected private inputs, the original signed-source file,
copied journals and36 staged public source files are unchanged. No client
signatures, handoffs, simulations or broadcasts occurred. No canonical service,
frozen frontend, stability workload or disk configuration changed.

The first attempt stopped at the origin positive control because requesting
rewards omission returned null where the existing strict verifier requires
complete reward metadata. That refusal is retained. The corrected reader
requests rewards rather than normalizing omitted values to empty arrays. A
second namespace refused an occupied port before any copy process started;
its original-integrity audit is retained. The final attempt used a fresh
exclusive namespace and disjoint port range. No failed attempt was reset.

The next recovery step is inspection of a new offline copy of the retained
native blockstore and any same-genesis archive on a suitable host. The available
offline ledger tool enforces the standard file-descriptor requirement; this
worker does not meet that previously observed requirement. Do not use its
ignore-limit or force-update switches, repair roots or modify the source
blockstore. Keep tool output private, preserve source inventories and require
actual selected transaction bytes and complete economic metadata. A full
validator host is also still required for the three-validator rehearsal.

The252 bridge regressions pass locally. Twelve block-history groups, the
existing economic/collector/storage groups and nine worker guards passed Linux
pre-admission before the final private attempt. These checks do not accept
independent chain history, funded backing, custody or mainnet launch.


## Offline inspection packet for the next host

Before inspecting data, admit the host and verify the reviewed ledger-tool
binary/source hash and version. Copy the stopped native ledger into a new
owner-only directory, verify its full inventory against the protected source,
and keep all tool outputs private. Use the exact selected slot from the private
selection record, not a guessed recent slot.

The reviewed CLI supports these secondary-read commands on the new copy:

```text
<reviewed-ledger-tool> --ledger <new-copy> --output json blockstore bounds
<reviewed-ledger-tool> --ledger <new-copy> --output json blockstore slot <selected-slot>
```

Secondary access creates auxiliary files, so even these commands must not open
the original retained ledger. Inspect whether the selected slot, root marker,
shreds, selected transaction and complete transaction metadata exist. Compare
against any independently retained same-genesis archive. Recheck original
inventories after inspection. Do not run replay, root repair, purging or force
updates as part of read-only recovery. Missing or unrooted data stays blocked;
a status-cache entry cannot substitute for the original evidence.
