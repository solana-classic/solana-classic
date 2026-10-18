# Final browser regression after the original soak

Two fresh Chromium sessions completed actual valueless journeys on 14 October
2026. The original frozen website and the current .net overlay have separate
reports and entry-bundle hashes. They are not interchangeable release candidates.

| Site | Actual journey | Evidence |
| --- | --- | --- |
| Original frozen website | One faucet grant, native transfer, preset meme/NFT issuance and transfer, finalized balances, NFT owner and Explorer receipt | `evidence/browser-final-frozen-20261014T180654050Z.json` |
| Current .net overlay | Same bounded journey, with an uploaded PNG NFT instead of the preset NFT | `evidence/browser-final-custom-20261014T181203133Z.json` |

Each run created two browser-memory wallets, requested one logical public faucet
grant, created two demo assets and finalized six distinct receipts. No keys were
imported, exported or retained; no transaction payloads or browser traces were
published. The recipient's native balance increased by exactly 10,000,000 test
base units. Meme transfers delivered 5,000,000 base units, and each NFT transfer
delivered exactly one unit. Supply, precision, token programme, metadata pointer,
mint/freeze/update authorities, immutable files and finalized owners were checked.

The full mint/transfer journeys ran at 1440 pixels. Explorer deep links and a
keyboard-focus smoke check ran at 360 pixels. This is not full mobile signing,
accessibility compliance, Safari/Firefox testing or human usability research.
Root-operated automated QA is not two new independent agent pilots. The original
two earlier agent pilots remain separately recorded.

Both runs found no page errors, unexpected API destinations, sensitive field
names in JSON requests or local/session storage writes. Those checks do not
establish a complete traffic/log privacy audit. Existing browser source still
requires independent review before any real-money signing use.

## Reproduce only when a new regression is needed

```sh
node --test engine/migration/final-browser-regression.test.mjs
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers \
  node engine/migration/final-browser-regression.mjs \
  --target frozen --ack valueless-devnet
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers \
  node engine/migration/final-browser-regression.mjs \
  --target custom --ack valueless-devnet
```

Use pinned Node 24 and installed project Playwright. Browser plugin was not
available, so regular Playwright was used. The driver accepts only the two
fixed targets. It requires the original completed soak, original runtime boots,
known valueless genesis and all frozen source hashes before testing. It never
restarts a process, replaces a ledger, bypasses an admission limit, activates a
bridge or makes a purchase. If a faucet limit blocks the journey, retain that
failed report and do not bypass or reset the quota.

Each result is written exclusively to a dated public evidence filename. Failed
attempts are preserved. Browser keys disappear when the test contexts close.
Screenshots remain outside source and deployments in `/tmp`. The exact executed
driver is retained as non-executable text in
`evidence/browser-final-executed-driver.mjs.txt`; its hash and both report hashes
are in `evidence/browser-final-regression-review.json`.

The current driver adds an exact metadata/artwork-origin guard and rejects
credential-bearing metadata URLs. Seven unit checks pass, and all four observed
asset URLs match the stronger guard. The actual browser runs used the preceding
recorded driver; no extra live mint run is claimed for the subsequent guard.

## Release and migration scope

G7.01 and G7.04 are individually reviewed for the original frozen candidate,
with the earlier pilot records and actual anonymous final receipts. The .net
report supports its separate current overlay; it does not certify it through
the original soak. Full mobile acceptance, all other individual requirements,
operator handover and full release remain pending.

The canonical validator, genesis, boots, frozen source and original deadline
remain unchanged. These normal devnet transactions add new ledger state, so
the eventual approved migration must capture a fresh consistent backup after
them. Never use the old archive as the current migration baseline. The source
runtime switch and its new full-day test still need the concrete maintenance
decision and the reviewed migration sequence.


## Full360px phone journeys

Two later full360x844 Chromium touch-emulated journeys now pass. Original
frozen report `evidence/browser-final-frozen-mobile-20261014T194330408Z.json`
and current.net report `evidence/browser-final-custom-mobile-20261014T194714085Z.json`
each verify one faucet grant, native transfer, meme/NFT mint and transfer, six
distinct finalized receipts and exact balances/owners. Current.net also uses
uploaded PNG artwork. All inspected journey layouts fit360px, with meaningful
main content, matching page identity and no framework overlay/page/console
errors. Entry, wallet, completed transfer and Explorer screenshots remain in
`/tmp/soc-final-*-mobile-*.png`, outside source/deployments.

The driver accepts a fixed `--viewport mobile` profile; defaultdesktop behavior
remains available. Nine unit guards pass. Independent driver reads now allow
up to three transport-only attempts; HTTP errors including429, JSON/RPC errors
and identity/metadata mismatch remain terminal. Browser transaction submission
and faucet behavior are unchanged. Both passing phone runs used zero read
transport retries. No validator or frontend source was changed.

Two earlier failed driver attempts are preserved in
`evidence/browser-mobile-failed-attempts-review.json`, with their exact executed
driver sources. One stopped at NFT transfer with five verified receipts; its
exception detail was not retained and a later read found the NFT still owned
by its sender. The second stopped during NFT mint with a driver fetch failure,
four verified receipts and one recorded asset. Exact unrecorded outcomes are
not inferred. Neither failure is relabelled as a pass or silently overwritten.

`evidence/browser-mobile-original-review.json` combines the passing original
phone journey with prior1440px desktop and independent agent keyboard/label/
focus evidence. G7.02 is individually reviewed within that original candidate
scope. Its existing horizontally scrolling navigation still partly clips the
Token label initially; no body overflow or signed-flow failure occurred in
the passing journey. The separate.net review is
`evidence/browser-mobile-custom-review.json`. Physical devices, Safari/Firefox,
exhaustive accessibility/privacy review and operator handover remain outside
this verification. The full release remains unaccepted.

To reproduce only when needed, add `--viewport mobile` to the bounded CLI
commands above. All normal test transactions require the eventual migration
backup to be captured after these later receipts.

## Source-runtime final review and panel preference

The separately admitted source-built replacement completed its full-day run on
17 October; see [the exact terminal audit](../../evidence/agave-source-stability-replacement-completed.json).
Its final browser runs use the retained source-candidate context and verify all
45 frozen files and current runtime before transactions. Historical root-context
commands above must not be used against the newer candidate.

The current branded site persists one UI preference, `classic.wallet.panel`,
with the value `open` or `closed`. A fresh unsigned browser session confirmed
that exact entry and empty session storage. The older final driver required
empty local storage and rejected the first branded desktop run after its six
transactions finalized. That failed report and its executed driver remain
retained; it is not relabelled as passed.

The corrected final assertion permits only that exact key and those two values
on the branded target. It still requires empty session storage, rejects every
additional local key, and requires empty local storage on the frozen target.
Two new refusal groups cover unknown values, extra keys, session entries,
malformed snapshots and invalid targets; all 11 driver checks pass. The
assertion reads only storage key names and the known panel preference, never
wallet contents. This is a test-driver correction; no website or validator code
is changed. The storage check does not establish a complete privacy audit.

The four passing source-runtime runs are now recorded in
[the scoped final review](../../evidence/agave-source-final-browser-review.json):
eight demo assets and 24 distinct finalized receipts across desktop and mobile
journeys on both sites. The separate failed attempt adds two assets and six
finalized receipts; those are not omitted from the total activity or retried.
All 45 frozen files, runtime identities and each run's frontend entry bytes
remained unchanged. Existing mobile navigation clipping on the frozen site is
recorded; physical devices, other browsers, complete accessibility/security
review, operator handoff and full release remain outside this acceptance.
