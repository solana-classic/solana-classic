# Metadata-token archive restore rehearsal

This is a private test-validator recovery check. It cannot activate mainnet,
release SOC, submit a settlement, approve a refund or accept production custody.
The earlier plain-mint V2 archive result remains a separate historical proof.

The worker accepts an explicit private configuration selecting its environment,
a new attempt directory and one stopped, completed metadata-token rehearsal.
Keep that configuration, keys, signed journals, archives and raw results private.
The selected source must contain a finalized native claim followed by a
finalized original-token redemption from the same rehearsal history, with zero
remaining selected escrow/outstanding counters and its recorded reserve floor.
Pending, failed, changed-code or altered-economic baselines refuse admission.
Existing attempt directories cannot run again.

The workflow copies both stopped ledgers and retains their complete inventories
and selected private-input hashes. Only new working copies start. It records
selected finalized accounts, immutable mint metadata, deployed bridge and token
code/authority pins, source events and both consumed receipts. Native account
balances are parsed from raw JSON digits into exact integers, including amounts
above JavaScript Number precision. Streamed snapshots have a 2 MiB ceiling;
noncanonical balances and unsafe contexts refuse comparison.

After both working processes stop, new backup copies are archived. The archive
hash, validated extraction and complete copied inventories must match before
restored copies start. Snapshot links are rebased inside each new ledger. The
restored observations must reach the retained same-genesis finalized contexts
and preserve every selected account's bytes, owner and exact balance.

Two newly constructed simulations invoke the compiled bridge against already
consumed source events. Both must reject with `AccountAlreadyInitialized`.
There are no broadcasts or repeated economic operations. Selected account state
and both original signed journal copies must remain unchanged afterward.

All four owned process starts must stop. Readiness-time file-descriptor and
memory-map samples must exclude the original ledgers; restored processes must
also exclude working, backup and extraction paths. Original ledger inventories,
private inputs and staged public sources must remain unchanged. Sampling does
not prove continuous filesystem isolation. A failed attempt and all its logs
remain retained; a correction needs a separate namespace.

This checks a controlled-stop archive on one host. It does not prove physical
host loss, independent backups, arbitrary unknown landing, competing forks,
full-validator consensus, complete source-event inventory, funded backing,
independent operators, signer custody or production security.
