# Offline genesis stake and vote authorities

`genesis-authorities` decodes the actual accounts in an explicitly selected
synthetic development genesis. It extends the earlier metadata-only review:
owner names and balance totals cannot identify stake/vote withdrawal keys.
This tool reads binary genesis bytes through stdin and outputs private JSON.
It has no key loading, network, signing, submission or validator functionality.
Existing genesis compilers, auditors and artifact pins remain unchanged.

## Exact inputs and decoder

Build with Rust1.86.0 and the committed lockfile. The decoder uses the same
pinned interfaces as the reviewed Agave tree: genesis-config3.0.0,
stake-interface2.0.1 and vote-interface3.0.0. It uses their serializers rather
than guessing authority offsets. Tests construct only in-memory synthetic configurations; no genesis ledger file is created.

```sh
cargo +1.86.0 test --locked --manifest-path mainnet/genesis-authorities/Cargo.toml
cargo +1.86.0 build --locked --manifest-path mainnet/genesis-authorities/Cargo.toml
```

The executable requires `--isolated-genesis-stdin`, an externally selected
genesis identifier and exact binary SHA256. The whole input is bounded at16MiB;
the raw digest must match before bincode decoding. Trailing bytes refuse.
Known public/canonical identities and nondevelopment genesis refuse. The
complete supplied genesis has1..4096 accounts, at most10MiB data per account,
and a checked u64 total. Account bytes are hashed in the private output.

Every stake-owned account must have the pinned200-byte initialized/delegated
StakeStateV2 layout and nonzero staker/withdrawer. The decoder reports each role,
rent reserve, exact signed timestamp, u64 lockup epoch, custodian and delegation.
Uninitialized/rewards-pool/unknown layouts refuse in this narrow review scope.
Every vote-owned account must have the pinned VoteStateV3 size/version, nonzero
node and withdrawal keys, and1..64 authorized voter records. Older versions
refuse rather than being silently promoted by the library's compatibility path.
Commission must be at most100. Executable stake/vote accounts refuse.

All numeric amounts, epochs and signed lockup timestamps are decimal strings.
The output distinguishes decoded authority keys from custody, effective lockup
enforcement, backing, independent operators, consensus and production review.
Those latter gates remain false. A decoded key is not an identified operator,
proof of possession, a hardware custody review or permission to move funds.
A nondefault lockup field is not proof a lockup is currently enforceable.

## Guarded private review

`genesis_authority_review.py` requires the exact separate compiler-worker
identity, no active private validator and a new owner-only output namespace.
It hashes and bounds the selected decoder executable, original genesis and
published metadata input, refuses symlinks/writable inputs, then launches only
the offline executable under the existing bounded process-group helper.
The30-second command has8MiB stdout and8MiB stderr limits. The selected genesis
is opened read-only on stdin; outputs remain private. No ledger-tool, validator,
keygen or signing command runs. Host/consensus checks are not bypassed.

The complete decoded metadata must match every previously selected published
account row, total, genesis identifier and count. Stake/vote results must cover
exactly those owner sets, with matching balances and account-data hashes.
Promoted permissions or missing decode proofs refuse. All selected inputs and
process census are rechecked after success. Failed attempts remain retained.
The driver prints aggregate counts only; decoded JSON, keys and hashes remain
private. This does not establish an independent source for the selected genesis.

## Actual retained result

One fresh read-only review of the retained genesis completed successfully.
All249 accounts and1,000,000,000,000 synthetic native base units match the
published inventory. There are three stake accounts and three vote accounts.
The three distinct withdrawal keys are the corresponding validator identities:
all three stake staker/withdrawer pairs match, all three stake withdrawal keys
match the delegated vote account's node identity, and all three vote withdrawal
and authorized voter keys match their node identities. All three stake lockups
have default fields. This is the fixture's actual key-role coupling, not evidence
of three independent people or accepted production custody.

The source genesis, selected metadata, public tools, decoder and four pre-existing
runtime binaries remain unchanged. No private keys were read, and no validators,
chain requests, signatures or submissions were created. The original blocked
full-validator attempt is preserved; its host requirements remain unresolved.

Seven compiled Rust groups and six Python review groups pass on the separate
Linux worker. They cover distinct authority roles, exact lockup integers,
unsupported state/version/length, selected hash and genesis, corrupt/trailing
and oversized input, cluster/executable/overflow refusal, full inventory/authority
coverage, unsafe selected files, permission promotion and wrong-worker refusal.
The scoped public result omits authority addresses, account data and private
input/output digests: [aggregate evidence](../evidence/mainnet-genesis-authorities.json).

Next gates: reviewed separation or protection of authority roles, independently
controlled operators, an enforceable reserve design, funded origin backing,
full-validator consensus/recovery on a capable Linux host and security review.
Do not rotate these retained fixture keys or treat these accounts as production.
