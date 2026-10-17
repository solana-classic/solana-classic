# Selected reserve bytes and offline compiler input

`reserve-byte-input.mjs` bridges the reserve allocation proposal to an exact
single-account primordial input and a future compiled-output comparison. It does
not invoke the existing preparer, generate keys, compile genesis, run validators
or grant host admission. `prepare-consensus.py` and its normal host gates remain
unchanged. A future preparation integration still needs a suitable Linux host
and a fresh reviewed bundle; retained validator keys are not silently reused.

## Selected binary-genesis reports

The separate pinned Rust package `genesis-allocation-bytes` reads at most 16MiB
from stdin, requires an externally selected exact genesis-byte SHA256 before
bounded bincode decoding, and admits only the selected private Development
genesis. It refuses public/canonical networks, trailing/corrupt bytes, oversized
accounts and u64 total overflow. Its existing stake/vote decoding rules remain
strict. This new executable does not replace the earlier authority decoder or
any runtime binary.

Every `GenesisConfig.accounts` entry includes owner, exact native-unit string,
length, executable flag, data SHA256, exact u64 rent epoch and a SHA256 of the
complete bincode account. The complete account fingerprint includes all account
fields while its address remains a separate map key. The decoder also hashes
all non-account genesis configuration after clearing that accounts map and
zeroing only creation time. The actual creation time remains explicit. This
permits an explicitly selected new compilation timestamp while refusing other
parameter changes. The fingerprints bind the pinned serialization/library
versions; they are not a proof of live bank state, historical inclusion or custody.

## Input and proposed-output comparison

`preparePrefundedReserveByteInput` revalidates the selected allocation plan,
complete baseline metadata and externally selected raw decoder-report digest.
The source reserve must be a funded empty System account with the exact empty
data digest. Its rent epoch must be zero: the pinned primordial loader constructs
an `AccountSharedData::new` account and its input format has no rent-epoch field.
A nonzero reserve epoch therefore refuses before input is emitted or proposed
output is compared; epochs on other unchanged accounts remain exact u64 values.
It emits only the derived vault PDA's empty System allocation,
using the unchanged reserve amount as exact JSON integer digits, including
values above JavaScript Number precision. Existing validator/other allocations
are not synthesized from metadata or copied into the primordial file.

`reviewPrefundedReserveOutputBytes` additionally requires an externally selected
fresh proposed genesis and raw report digest. Its complete metadata must match
the unchanged reserve planner. Every account fingerprint, data digest, rent
epoch, balance, owner and executable flag must remain identical, with only the
reserve map key moved to the derived PDA. Stake/vote authority summaries and
non-account parameters must agree. Missing, extra, edited or stale accounts,
changed parameters, wrong selections and permission-promoting reports refuse.

The Node functions review supplied reports. Computing an expected digest from
the same untrusted report does not authenticate decoder execution. The private
worker wrapper separately executes the selected new binary on selected original
genesis bytes and retains its raw output. Even a matching proposed report cannot
promote these functions into independent verification, actual fresh compilation,
preparer integration, initialized reserve custody, funded backing or activation.
All corresponding permissions remain false. A fresh complete activation-bank
inventory remains required after deployment and later transactions.

## Verification scope

Fourteen Node groups cover exact input, full fingerprints/rent epochs, authority
summaries, header parameters, explicit creation time, stale/public genesi,
selectors, schema/size bounds, u64 precision and input immutability. Six Python
worker guards cover exact service/root, no replay, selected source/input bounds
and retained failures. The new Rust package has eleven compiled groups,
including the pinned constructor default, rent epoch above Number precision,
separate address/account fingerprints and creation-time versus other parameter
changes.

The hardened offline review passed six checks against all 249 retained genesis
accounts and the exact 1,000,000,000,000-unit synthetic total. Its generated reserve
input has one row. The proposed-output positive control is supplied synthetic
JSON derived from that report, not another compiled binary. Controlled changes
to a rent epoch, non-account parameters and the external report selector refuse.
That retained audit used the preceding ten-test decoder source; the later
constructor-compatibility guard and regression have separate local/CI evidence.
At audit completion, all 14 selected public source inputs, the original files
and four runtime executables were unchanged. Those historical source hashes and
completed attempts remain preserved; the later guard does not inherit their
executed-source result.

`reserve_byte_review.py` runs one bounded audit-only attempt on the separate
worker. It preserves the selected existing genesis, metadata, old decoder and
four runtime executables. Compiler outputs and raw decoded/primordial reports
remain in a new private namespace. Its actual baseline review and explicitly
synthetic proposed-output controls are recorded separately in
`evidence/mainnet-reserve-byte-input.json`. It does not use a metadata fixture
as evidence of a newly compiled genesis. No keys, chain requests, signatures,
submissions, validators, ledger replay or monetary activation are part of this
review. Full-validator hosting, actual funded backing, independent operators,
custody/upgrades and external security/release review remain open.
