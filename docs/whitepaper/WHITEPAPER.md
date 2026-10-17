# Solana Classic Whitepaper

## Shared roots. A focused future for art, NFTs and memes.

**Solana Classic / SOC**  
**Public edition | Version 0.15 | 15 October 2026**

**Bring back the fun. Build what comes next.**

Solana Classic is an open-source blockchain bringing together developers, artists and communities who care deeply about digital art, NFTs and memes. Our goal is sustained development in this category: a place where builders understand the people they are building for, share what they learn and give promising ideas time to grow. The products should emerge from the people who show up and do the work.

We remember mint nights, new profile pictures and group chats that became communities. Solana Monkey Business, Okay Bears, BONK and WIF are part of the history that inspires us. Solana's engineering gave artists and meme makers room to experiment. We respect that work and build on its open-source foundations.

Solana pursues a broad future across finance and many other categories. We want a development community whose attention stays on the culture we came for. Scams, concealed incentives and abandoned projects give that work urgency, but no single tool or launch standard is the mission. Our ambition is an open, focused home where creative work continues beyond the first burst of attention. A token price is not evidence that this ambition is working.

Devnet is live on a fresh, independent Agave ledger. The Solana Classic team runs its single validator - the computer that checks and records transactions. Participants can create a disposable wallet, receive valueless test units, issue demo meme assets and NFTs, transfer them and inspect chain receipts. **SOC is intended to be the network token of Solana Classic, with a planned one-to-one bridge between original SOC on Solana and native SOC on Classic in display units.** Mainnet and the bridge are not live. The official mint and token terms have not yet been published here. TEST, also displayed as tSOC, has no monetary value or right to conversion.

### Where the project stands

Devnet is live at [solanaclassic.net](https://solanaclassic.net). The Solana Classic team currently runs the validator that checks and records its transactions. It supports disposable test wallets, artwork and meme-asset creation, transfers, a verified gallery and transaction receipts. Test units have no monetary value. SOC, native mainnet and the proposed bridge are not live.

The network now runs our verified source build of **Agave v3.0.14**, with the official **Token-2022 v10.0.0** programme. Migration preserved the existing genesis, accounts, programmes and application data. The source runtime passed its controlled restart and both original-frontend browser checks. The earlier upstream-binary candidate passed a bounded 200-operation load test and its uninterrupted 24-hour stability test. Those historical results do not certify the new executable: a fresh load, isolated recovery and full 24-hour stability run remain required. These tests are not claims about chain-wide capacity.

This paper sets out the purpose, current network, intended SOC model and conditions for later releases. Current behaviour, proposed work and release requirements are identified separately. The [live roadmap](https://solanaclassic.net/roadmap) carries dated updates; detailed technical records remain in the project repository.

## 1 A focused home for memes and NFTs

For us, Solana's appeal has always included the people around it. [Solana Monkey Business](https://solanamonkey.business/) [15], [Okay Bears](https://www.okaybears.com/) [16], [BONK](https://www.bonkcoin.com/about) [17] and [dogwifhat (WIF)](https://dogwifcoin.org/) [18] bring back a timeline, a mint night, a profile picture or a joke a group chat suddenly understood. We remember discovering art, finding our people and staying in a community after the chart stopped being interesting. The projects named here inspire us; they are not affiliated with Solana Classic.

Fast transactions and accessible fees gave that experimentation room to happen. Artists, collectors, meme makers and communities gave it a personality. We respect the engineers and builders who made that world possible. Solana's December 2021 community update records NFT projects and fan communities alongside financial applications: culture was important, and the network was always broader than one category. [Solana Foundation community update](https://solana.com/news/december-2021-community-update) [1]

### Why focus matters

Millions of tokens have been launched. A September 2026 study collected information on 15 million Pump.fun coins launched over two years and identified manipulation strategies, including obscured creator addresses, coordinated selling and wash trading. This supports the scale of launches and the presence of manipulation; it does not establish that every launch is abusive or that one institution caused those abuses. [Meme Coin Factories](https://arxiv.org/abs/2609.10246) [19]

Our frustration is with scams, concealed incentives, extraction and work that disappears after launch. Too often, participation feels like competing for the next ticker instead of helping something grow. That is our experience and founding view. Solana also publishes guidance on scams and transaction safety, and builders continue to innovate across its ecosystem. Our concern is about sustained development priorities. [Staying Safe on Solana](https://solana.com/learn/staying-safe-on-solana) [20]

Solana's public agenda includes tokenized capital markets, from equities and debt to institutional infrastructure. We want art, NFTs and memes to have a development community that keeps working on their future. [Solana tokenization](https://solana.com/solutions/tokenization) [2]

### A public cultural disagreement

On 27 July 2025, Solana co-founder Anatoly Yakovenko posted the following during a public exchange with Base creator Jesse Pollak:

> "I’ve said this for years. Memecoins and NFTs are digital slop and have no intrinsic value."

In the same post, Yakovenko compared them with mobile-game loot boxes. Pollak defended the value of content and creators. [Yakovenko's 27 July 2025 post](https://x.com/toly/status/1949548737208181137) [13]

For us, that language makes a cultural disagreement visible. We see imagination, shared identity and people making things together. We want developers who see those possibilities too. That belief does not make every token valuable or excuse manipulation. It gives us a reason to take creative participation seriously.

This is our view of a cultural gap, not a claim that every Solana founder or the Foundation opposes memes and NFTs. The exchange is one person's public view, not a poll of leadership or the community. It helps explain our choice to gather builders who care about this category and want to keep working on it.

### Shared roots. Two directions.

The same open-source engineering can support different priorities. Solana is a broad ecosystem pursuing many categories. Solana Classic brings together developers focused on art, NFTs, memes and the communities around them.

| Shared engineering roots | Development direction |
| --- | --- |
| Solana / SVM | Solana: a broad ecosystem, including finance and digital culture |
| Solana / SVM | Solana Classic: sustained development around art, NFTs, memes and their communities |

A developer exploring NFT experiences should have peers who understand artists and collectors. A builder exploring meme culture should have a community that takes the work seriously. When people stay with the same category, knowledge compounds, tools connect and ideas can develop beyond a single launch. Artists can reveal possibilities developers had not considered, and communities can help decide what is useful.

That is the ambition: sustained, open development around a culture we care about. It describes the people and priorities we want to bring together. It leaves room for contributors to shape the products.

### Cultural focus and general purpose execution

The focus applies to project-owned products, curation and development effort. Agave's SVM remains general purpose; no runtime rule classifies and bans financial or other transactions. Product focus is a roadmap choice, not an enforcement guarantee.

The public gateway still enforces method, size and rate limits, and the app only exposes its supported playground actions. Those controls protect the service and keep the pilot bounded; they are not a claim that the runtime can determine an application's cultural meaning. The founder also controls the website, gallery registry and access infrastructure. A curated interface must not be described as a decentralized guarantee of inclusion. "Open to everyone" states the intended invitation, subject to disclosed service limits and availability.

## 2 A place for builders who get it

### What the community can build

Some developers care deeply about digital art. Others understand the humour, experimentation and social energy behind memes. Some want to build the places where those communities meet, create and grow. Solana Classic is an invitation to bring those interests together.

Contributions could explore new ways to make and experience art, tools for collections, community spaces, games, discovery or experiments we cannot yet name. A useful idea should begin with a participant's need, become a working prototype and improve through feedback. The founding goal is to keep that process focused on this category, with enough continuity for work to outlast a launch.

The playground is a first place to experiment. Its frozen stability candidate supports four geometric presets, asset creation, transfers, a verified gallery and receipts. The separate .net frontend adds checked PNG/JPEG artwork uploads and its own persistent metadata service. These are valueless test experiences, not a production market or evidence that people need an independent chain.

### Contributor ideas, not prescribed solutions

The frustrations that brought us here also suggest ideas worth exploring. Contributors may propose readable launch records, declared developer-wallet groups, supply and fee views, clear unlock labels or ways to fund and follow creative work. These are ideas for discussion and testing. This whitepaper does not commit the ecosystem to disclosure dashboards, a creator-funding programme or any other prescribed answer.

Any contributor pursuing those ideas must state their limits. A signed wallet declaration can show control of a declared address, but cannot prove that no other wallets exist. Observable concentration is not proof of common ownership. An unlock enforced by a reviewed programme differs from a person's promise. Public spending records do not establish that work was worthwhile or completed.

A proposed funding initiative would need a funded budget, a disclosed decision process and evidence of delivery. Buying SOC or an NFT does not grant ownership, a payout or a legally binding vote through this document. Focus, opt-in standards and better interfaces cannot guarantee a scam-free ecosystem.

### Development direction and release conditions

| Work | Outcome or decision | Evidence to seek |
| --- | --- | --- |
| Devnet | Disposable wallet, faucet, demo assets, transfers, verified gallery and receipts | Real chain journeys, persistence and recovery, automated browser checks and the frozen candidate's full soak |
| Focused development community | Builders, artists and collectors propose and test work in this category | Contributions maintained, useful prototypes, participant feedback and continuing creative work |
| Contributor proposals | Adopt, revise or stop individual ideas after testing | Named owners, achievable scope, reviewed claims and evidence that the idea serves participants |
| Native mainnet and redemption | Protected SOC reserve, one-to-one bridge, reviewed wallets and defined market infrastructure | Monetary conservation, security review, two-way settlement and funded operation |

Community proposals have no promised delivery date or fixed sequence. The intended economic network has separate technical and security conditions. An official token announcement is a separate economic decision; it cannot substitute for useful products, a sustainable community or bridge readiness.

### Founding community roles and outcomes

Developers bring ideas and skills, build prototypes and maintain useful work. Artists bring original work and help shape what the tools make possible. Collectors and meme communities try the experiences, explain what matters and challenge assumptions. Reviewers test claims and controls. The founder operates the experiment and remains accountable for its availability, costs and releases.

Progress should become visible through maintained contributions, completed creative journeys, useful work delivered and participants who choose to return. Reports must separate people from automated tests and verified chain facts from self-reported claims. These are outcomes to learn about, not results already achieved.

Bring your ideas. Bring your skills. Help give art, NFTs and memes a future worth being part of. The invitation is open, and the expectation is continuing work.

## 3 What Classic means

Bitcoin Cash and Ethereum Classic show that people can organize around a different view of what a blockchain should prioritize. Bitcoin Cash's history describes a split on 1 August 2017 after a disagreement over scaling, with an emphasis on everyday electronic cash. [Bitcoin Cash history](https://bitcoincash.org/) [3]

Ethereum's DAO fork occurred on 20 July 2016 at block 1,920,000. Some participants rejected that intervention and continued the chain that became Ethereum Classic. Ethereum's historical account and the Ethereum Classic community's account describe that divergence from their respective perspectives. [Ethereum fork history](https://ethereum.org/ethereum-forks/#dao-fork) [4], [Ethereum Classic genesis account](https://ethereumclassic.org/why-classic/genesis/) [5]

The useful analogy is the ability to gather a community around a durable priority. The technical histories are different. Bitcoin Cash and Ethereum Classic arose through divergence from existing ledgers. Solana Classic's experiment begins with a fresh genesis and no copied Solana ledger. The word "Classic" expresses a cultural aspiration; it does not establish continuity with an earlier Solana chain.

| Project | Defining disagreement or purpose | Relationship to an earlier ledger |
| --- | --- | --- |
| Bitcoin Cash | Scaling priorities and electronic cash | A historical Bitcoin chain split |
| Ethereum Classic | Continuation without the DAO state intervention | A historical Ethereum chain split |
| Solana Classic | Focused development for art, NFTs, memes and their communities | A fresh independent devnet ledger |

Solana Classic is an independent project. Its name and use of open-source technology do not imply endorsement, partnership or affiliation with the Solana Foundation, Solana Labs or Anza. It does not call itself the original Solana, allocate assets to SOL holders, or promise that existing Solana NFTs can be used on its network.

## 4 TEST and the intended SOC lifecycle

SOC is intended to be the network token of Solana Classic. A planned one-to-one redemption bridge would connect original SOC on Solana with native SOC on Classic. The original Solana token is the proposed bridge's canonical backing asset. Native Classic SOC is a distinct ledger representation backed under the proposed model. The experiment uses valueless TEST as its protocol denomination. **tSOC is a frontend display name for those same TEST units**, with unchanged genesis and balances; it is not a new token or a claim on future SOC. A working playground is not a launched SOC economic network.

| Scope | Current state | Meaning |
| --- | --- | --- |
| Devnet | SDK/browser journeys, restart, recovery and bounded load passed; original 24-hour soak passed; full release pending | The Solana Classic team runs one validator; tSOC test units have no monetary value |
| Playground meme assets and NFTs | Remote script/browser issuance and transfer proof passed; full release pending | Token-2022 demo assets on the experiment; no monetary value |
| Original SOC on Solana | Official mint and token terms not published here | Canonical original token for the proposed redemption model |
| Solana Classic mainnet and native SOC | Planned and unimplemented; no mainnet genesis | Native currency released from a protected reserve against original SOC escrow |
| Redemption bridge | Planned and unimplemented; no deployed addresses | Intended 1 original SOC to 1 native SOC in display units, with separate fees |
| SOC markets | Verified venues and pool addresses not published here | Trading infrastructure and liquidity remain separate from the bridge |

The TEST experiment grants no conversion right, airdrop entitlement or allocation in mainnet SOC. Its founding devnet art is participation in a technical and cultural pilot. Test units are not sold, redeemable or represented as an investment. The validator's bootstrap balances are development configuration, not a proposed SOC supply. The planned mainnet bridge does not make TEST redeemable.

The original SOC token requires actual venue creation and mint verification. Native SOC requires a mainnet genesis, protected reserve and monetary policy consistent with one-to-one redemption. No total supply, developer allocation, reserve quantity or production fee schedule is invented here. Original mint state and native balances are verified from their respective chains. The proposed model excludes independent native inflation; adding issuance would require an explicitly revised backing model before adoption. No original mint, mainnet genesis, bridge escrow, reserve or pool address is published at this checkpoint.

## 5 The devnet

### Runtime selection and independent identity

The initial runtime selection was upstream **Agave v4.3.0**, which Anza labels stable. Its official binaries were verified, but startup on the devnet host failed on unavailable mandatory `io_uring` support. There is no active, accepted v4.3.0 validator. An upstream release label does not establish compatibility with a particular environment or production readiness for this project. [Agave v4.3.0 release](https://github.com/anza-xyz/agave/releases/tag/v4.3.0) [6]

The current devnet runs our source-built **Agave v3.0.14**, compiled from the pinned upstream source. Its account-storage directory-removal code can fall back to standard filesystem operations when `io_uring` is unsupported or remover initialization fails. The original upstream-binary candidate passed its recorded browser, restart, qualified recovery, bounded load and full stability checks. The new source runtime passed migration continuity, controlled restart and both original-frontend browser checks; its fresh load, isolated recovery and full 24-hour run remain separate requirements. No custom runtime patch or relaxation of kernel protections is part of this approach. [Agave v3.0.14 account-storage source](https://raw.githubusercontent.com/anza-xyz/agave/v3.0.14/accounts-db/src/utils.rs) [12]

The earlier Agave candidate's bundled Token-2022 programme failed variable metadata reallocation. The official Token-2022 v10.0.0 release fixes compatibility with `stricter_abi_and_runtime_constraints`. Its verified official artifact was loaded under the existing standard Token-2022 programme identity on the fresh candidate. This is an upstream programme update, not a bespoke token contract or a new asset standard. [Official Token-2022 v10.0.0 release](https://github.com/solana-program/token-2022/releases/tag/program@v10.0.0) [14]

| Devnet fact | Recorded value |
| --- | --- |
| Public network gateway | [solanaclassic.net/_network](https://solanaclassic.net/_network) |
| Remote genesis | `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon` |
| Pinned upstream runtime commit | `f516a8927c76c07f0ebc54ca7a4ce8b2046eee86` |
| Original upstream binary archive SHA256 | `65614325423316a48f57f1ceeaa91ca78f4516e165e305b38c01873cf8c6b8b4` |
| Token-2022 v10.0.0 commit | `3350a3ba856f5997c4ade91fd1e5c8b515e5df33` |
| Token-2022 artifact SHA256 | `a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68` |
| Current source-runtime proof scope | Migration continuity, source artifact identity, restart and original-frontend browser checks; fresh load, isolated recovery and stability acceptance pending |

The service uses `solana-test-validator` with persistent storage. Anza describes this tool as a full-featured single-node development cluster. The devnet has its own genesis and does not clone Solana accounts or programmes from a public cluster. Required built-in and token programmes are checked on the deployed runtime. This development tool, with its validator run by the project team, does not establish production consensus security. [Anza test validator documentation](https://docs.anza.xyz/cli/examples/test-validator) [7]

The full Agave v3.0.14 source is included in `engine/agave`, with its exact upstream commit, tree and Apache 2.0 provenance recorded. It currently has no project-specific engine changes. Source compilation and isolated tests passed before the controlled devnet migration. The live devnet now uses the reviewed source-built executable. Its migration continuity and restart evidence are recorded separately from the still-pending new stability run.

The genesis hash is the project's network identity. Local development and the remote public experiment must have separate records. The canonical remote hash is recorded only after the remote node exists, is compared against known public Solana networks and has passed the required proofs. A local hash cannot stand in for it.

The browser and gateway must both check the expected genesis before mutations. An unset or mismatching identity disables those actions. This reduces the risk of submitting test transactions to the wrong endpoint. It is a routing and verification control, not a cryptographic guarantee against a compromised frontend or RPC controlled by the project team. Release evidence must therefore also bind the frontend deployment, API configuration and validator software to their recorded versions.

### Devnet architecture

| Component | Selected responsibility |
| --- | --- |
| Web application | Public interface; browser transaction construction and signing; separately versioned stability candidate |
| Linux API | Fastify gateway; admission controls; immutable asset generation; faucet and gallery |
| SQLite | Durable faucet reservations, quotas, asset documents and gallery discovery records |
| Linux storage | Persistent validator ledger, database, artwork and immutable metadata |
| Agave validator | Actual SVM execution, account state and transaction receipts |
| HTTPS ingress and process supervision | Encrypted public gateway, restricted service exposure and supervised processes |
| Separate artwork service and volume | Validated image uploads, immutable files and verified uploaded-asset discovery; no validator or signing authority |

The public application communicates with a bounded gateway at the project's own domain. The gateway forwards only allowed RPC methods to the validator's private endpoint. Raw RPC, WebSocket and native faucet ports remain private. The devnet runtime uses supervised processes and persistent storage for the ledger, database and immutable assets; uploaded artwork is handled by a separate service. The current experiment is operated by one project-controlled validator. Its limited workload measurements do not establish production capacity or decentralized security. Hosting choices are operational details recorded in the repository, not features of the protocol. Production infrastructure and independent validator participation require a separate release.

Remote asset URIs use their recorded stable API or artwork-service hostname. Frontend availability, API availability, artwork availability and ledger continuity are separate conditions. The artwork service has its own volume and no access to the validator's volume or signing keys. Its deployment does not change the frozen candidate, and its own backup, restore and security acceptance remain separate work.

### The test wallet

The app creates an Ed25519 keypair in browser memory. It provides no import, export, persistent browser storage or third-party wallet connection. Refreshing or closing the page loses access to that keypair and its test assets. This consequence must appear before wallet creation. A second tab can create a recipient for transfer testing.

Memory-only storage limits persistence of the secret; it does not protect against malicious frontend code, cross-site scripting, compromised dependencies, browser extensions or an already compromised device. No founder mainnet key belongs in the app, API, build environment, log or repository. Any future mainnet, bridge or pool interface needs a separately reviewed wallet and signing design. The disposable test-wallet flow is unsuitable for real funds.

## 6 Asset creation and verification

### The supported asset model

The playground uses Token-2022 for both asset types and adds no new on-chain program. Metadata is stored on the mint using the metadata pointer and token metadata extensions. Solana's documentation explains these extensions and the separate authority required to update metadata. [Token-2022 metadata documentation](https://solana.com/docs/tokens/extensions/metadata) [8]

The selected demo meme asset has six decimals and a fixed initial supply of 1,000,000 display units. The demo NFT has zero decimals and supply exactly one. These values describe playground fixtures only. They do not describe mainnet native SOC or its supply.

The four presets are **Circle Face, Stepped Geometry, Grid Face and Orbit**. They are original, deterministic geometric SVG designs. Presets may recur across mints; a unique mint address does not make its image visually unique. Holding a token does not establish copyright ownership or confer rights beyond the disclosed test asset. The project promises support in its own app, not compatibility with outside marketplaces, wallet collections or indexers.

The separate .net frontend also accepts still PNG or JPEG artwork, bounded to 1 MiB and 4,194,304 decoded pixels. The artwork service decodes and re-encodes accepted files to PNG, removes embedded metadata and fits them within 1024 by 1024 pixels without enlargement. It rejects SVG, other formats, malformed files and oversized inputs. Uploading an image alone does not create a mint or place it in the gallery.

### Issuance and immutable authorities

The verified atomic issuance path creates the mint and inline metadata, creates the token account, mints the fixed supply and removes mint and metadata update authorities in one transaction. It funds rent for the complete metadata while initially allocating the fixed extension space. The pointer has no authority, and the freeze authority is absent.

Both meme and NFT paths passed actual remote atomic issuance, authority verification, same-receipt retry and transfer checks on the restored TEST node. The verified transaction sizes were 813 and 812 bytes, below the 1,232-byte limit. These two checks are not a capacity benchmark. The Token Program's authority instruction and the token-metadata interface's update-authority instruction are distinct operations; clearing one does not prove that the other was cleared. [Token authority documentation](https://solana.com/docs/tokens/basics/set-authority) [9], [Token metadata documentation](https://solana.com/docs/tokens/extensions/metadata) [8]

If submission or finalization is uncertain, the interface retains the anticipated receipt and offers Resume on the same in-memory mint. It must reconcile that receipt rather than quietly create another mint. Existing incomplete mints from the earlier two-transaction path remain resumable. The app serializes and simulates each transaction, checks its size and records submission, confirmation and finalization as separate states. A signature returned by RPC is not evidence of successful issuance.

The gallery accepts an asset only after finalized chain verification establishes the expected Token-2022 program, mint and issuance transaction, fixed supply, decimals, metadata URI, and absent mint, freeze, pointer and metadata update authorities. Its database is a discovery registry, not ownership truth. Current NFT ownership is derived from the actual token account; the mint's program owner is not the holder. If an NFT is burned, the interface shows no current holder. If the chain cannot be read, ownership is unavailable rather than asserted from a stale registry row.

### Immutable files and their limits

The frozen API generates image and metadata files from validated text and a fixed preset. The separate artwork service handles the checked image-upload path. Both use content-hashed paths and fixed metadata origins; neither accepts caller-provided remote metadata or uploaded SVG. Repeated identical inputs are handled idempotently. Uploaded assets enter the combined gallery only after finalized chain verification.

Revoking update authority and using content-hashed files makes the selected asset state verifiable under the recorded chain and software. It does not force the operator to keep a server online, prevent deletion of a file, or make the whole network immutable against an operator who replaces the ledger or software. Metadata integrity, file availability and the experiment's operational continuity must be assessed separately.

## 7 Admission controls and operational ownership

### Selected public limits

| Service | Configured devnet limits |
| --- | --- |
| Faucet | 1 TEST per grant; 3 grants per wallet per day; 10 per IP per day; 1,000 TEST globally per day |
| RPC | 32 KB request; 2 MB response; 10 second timeout; 32 concurrent upstream requests; 100 admitted requests per second globally |
| RPC per IP | 1,200 reads per minute; 60 submissions per minute |
| Generated assets | 4 KB request; 24 KB combined files per asset; 150 new assets per IP per hour; 1,000 globally per day |
| Asset storage | 512 MB total generated-asset quota |
| Gallery | At most 50 records per paginated response; bounded on-chain lookups |
| Uploaded artwork service | 512 MiB storage; 200 new images per day; 30 per upstream IP per day; uploads processed serially |

These are admission settings, not measured capacity or performance promises. The custom-domain adapter shares gateway IP quotas, which can limit several participants together. Persistent accounting must survive API restarts. A faucet request reserves a grant atomically using a request identifier. An uncertain timeout is reconciled against its chain signature before another payment is attempted. Browser preflight requests must never reserve funds. Public RPC rejects arbitrary upstream destinations, batches, unknown methods and direct `requestAirdrop` calls.

The service permits the exact production frontend origin and explicitly listed previews. CORS is a browser access control, not authentication: clients outside a browser can omit the Origin header. Validation, quotas and rate limits therefore apply independently. IP limits can affect users behind a shared connection and can be evaded by distributed clients. The operator must publish degraded state and reduce admission when the actual host cannot safely meet the pilot workload.

### Founder responsibility and concentrated control

The founder currently runs the devnet on behalf of the Solana Classic team. Its single validator is the computer that checks and records transactions. The same team controls the validator and server, so it can stop the service, control gateway access, change software and deliberately reset the devnet ledger. Persistent storage and backups reduce accidental loss; they do not create independent consensus security.

The normal service command must not reset the ledger. Restarts must preserve the genesis, balances and issued assets. Any deliberate reset requires disclosure and a new network identity record. Nothing in this experiment guarantees perpetual availability or preservation of valueless assets.

Before public release, the operator must have a working monitoring and recovery procedure. The selected monitoring cadence is 30 seconds, with alerts for repeated RPC failure, no slot progress for 60 seconds, memory use at 80 percent (12.8 GB of the 16 decimal GB cap) and persistent-volume use at 85 percent (42,500 MB of 50,000 MB). Identity failure stops the faucet and new mint admission. Provider-native memory and volume alerts are configured. The founder attested receipt of actual failure, monitor and recovery emails on 13 October; final operator handover remains a release requirement. Continuous hosting and operations require dedicated infrastructure and accountable operators.

The first recovery drill was required by H36 and passed within its recorded isolated scope. Its candidate reconfirmation preserved known genesis, balances, mint data, ownership, files and database rows, with the historical-transaction qualification described above. A recovery procedure must stop writers, create a consistent backup, restore separately and verify known state. The original backup covers the runtime ledger, SQLite, preset artwork and configuration; it does not certify the later upload service. Protected operator files stay undisclosed. Frontend rollback is tested separately from restoring Linux state.

The principal security limits are control concentrated in the project team, wrong-network configuration, frontend compromise, dependency defects, faulty issuance finalization, inconsistent backup, metadata unavailability and service abuse. Passing the specified controls can make the pilot reviewable and recoverable. It cannot justify handling production economic value or claiming Solana-scale security.

## 8 SOC launch and redeemable native currency

### The original SOC token on Solana

Original **SOC** on Solana is the proposed canonical backing asset for native Classic SOC. Any official recognition will identify the exact mint, supply, decimals, mint and freeze authorities, distribution, team involvement and fee recipients. A token name or ticker alone does not establish official status.

Team holdings must be explained by their actual acquisition method and funding. Any purchased or otherwise acquired team balance, its source, custody, restrictions and public addresses require disclosure. Creation does not establish an arbitrary free developer allocation. A token announcement does not itself activate mainnet or redemption.

**Team wallet and supply disclosure, updated 15 October 2026.** The disclosed team wallet on Solana is `7TGgKppPDB3B8riBz763UKw971LnzhgQUShVAPUFY4HU`.

**Approximately 70% of SOC is allocated to the native-chain migration.** On 15 October 2026, the [public Streamflow record](https://app.streamflow.finance/contract/solana/mainnet/BcKXq8svKSR8A8kR44zJ25xhR7mj7TsWPWy74zB6gRxQ) displays **698.6725 million SOC** in the team's lock; Streamflow's search displays this as **70.88% of the current supply**. These are the displayed, rounded figures, rather than a new allocation or a claim that all other tokens are freely tradable. The disclosed team wallet is both sender and recipient.

| Public lock term | Streamflow record |
| --- | --- |
| Contract | `BcKXq8svKSR8A8kR44zJ25xhR7mj7TsWPWy74zB6gRxQ` |
| Lock type | Price-based |
| Unlock price | USD 0.02029 |
| Expiry | 21 October 2026 at 23:00 UTC, shown as 22 October at 00:00 BST |

This is **not an unconditional seven-day time lock**. The price condition can release the tokens before expiry; Streamflow's [price-based lock documentation](https://docs.streamflow.finance/en/articles/10750946-price-based-lock) also describes release when the configured maximum duration expires. The lock does not wait for mainnet readiness. Readers can inspect the live record above for current status and terms.

**Our migration target is 22 October 2026.** The intended use of this allocation is to support native Classic SOC and its tokenomics through the proposed reserve-backed bridge. Migration remains conditional on mainnet, funded backing, custody, bridge security and release checks passing. Unlocking the Streamflow contract does not itself bridge any tokens or activate mainnet. The full native tokenomics and migration instructions will be published before activation.

Acquisition details, fee recipients and any holdings outside this lock still require their own disclosure. No other address is a disclosed team wallet. Nothing sent to this wallet creates an entitlement.

If the team receives creator or trading fees, publish who receives them, how the rights were obtained and how the proceeds are used with the official announcement. Fee revenue is not guaranteed and cannot be the sole validator operating budget. Published token terms must cover both team allocations and fee rights.

### Native Classic SOC

The intended mainnet currency is also **SOC**, native to Solana Classic. It would denominate native balances and transaction costs there. Native balances occupy the account model's lamport field; they are distinct from a Token-2022 mint. Moving or locking a Solana token does not itself turn that token into a native account balance on an independent chain. The destination needs its own genesis, native reserve and verified bridge logic. [Solana account documentation](https://solana.com/docs/core/accounts) [10]

The selected economic direction is **1 original Solana SOC redeemable for 1 native Classic SOC in display units**, and the reverse. Native SOC is intended as a bridge-backed representation of the original asset rather than an independent inflationary supply. The proposed implementation uses a protected native reserve allocated at mainnet genesis. Its quantity, custody, upgrade powers and release rules are not yet specified. Reserve units must not be freely spendable by developers or validators while simultaneously presented as collateral-controlled capacity.

The pilot's TEST balances do not become mainnet SOC. The devnet is currently run by one project team. It does not establish a production network run by independent validator teams, an economic security model or support for real-money custody. SOC does not confer an ownership interest, guaranteed income, return or governance right through this whitepaper.

### Proposed escrow and reserve bridge

A bridge connects separate networks through an explicit verification mechanism. General bridge approaches differ in their custody and trust assumptions; sharing the SVM does not supply cross-chain verification. [Ethereum.org bridge documentation](https://ethereum.org/developers/docs/bridges/) [11]

The **candidate mechanism** is to escrow original SOC on Solana and, after verifying a final deposit, release an equal display-unit quantity of native SOC from the protected reserve on Solana Classic. The reverse path first returns native SOC to that reserve; only after verifying that finalized return can the bridge unlock the corresponding original SOC on Solana. This describes intended backing and redemption. No escrow, reserve, verifier, relayer or redemption service is deployed.

The bridge releases existing native reserve balances. It does not assume that an ordinary SPL mint instruction can create native currency. A native burn-and-reissue design would require different monetary and authority rules and is not the selected model. Native issuance, bridge settlement and developer holdings cannot be conflated.

Every deposit and return needs an identity bound to its source chain, asset, recipient, amount and message identifier. Finality verification and persistent replay protection must prevent one event from triggering two releases or unlocks. Incomplete transfers remain pending and recoverable through an explicit procedure; a timeout must not trigger a second payout. The verifier model, keys, threshold, upgrades and emergency powers remain to be selected and disclosed.

### Supply conservation and fees

Let **S** be the original token supply, **E** the original SOC held in verified bridge escrow and **N** the native SOC outside the protected reserve, all expressed in the same display units. The design must maintain **N <= E** and prevent release beyond the protected native reserve. Original SOC outside escrow plus native claims must satisfy **S - E + N <= S**. Escrowed originals and the unreleased protected native reserve are not counted again as independently circulating SOC.

Every native SOC balance outside the protected reserve counts toward N, including any genesis bootstrap balance and amounts held by developers, validators or programmes. Such balances require corresponding original SOC in verified escrow before they become spendable. Mainnet bootstrap funding must satisfy this same backing requirement; a fixed but unbacked initial allocation would violate the selected model.

These conditions require coherent finalized accounting of deposits, native releases, native returns and original unlocks, including pending messages. They are design requirements, not measured facts about a live bridge. The eventual specification must explain how reserve balances, developer holdings, fees and any burned units affect those records.

One-to-one applies to display units, not identical raw integer balances. If the original mint and native ledger use different decimal scales, the bridge must convert exactly between their base units, reject amounts that cannot be represented and test boundary values. The actual original decimals are read from the mint; the native unit scale is approved in the mainnet specification. Rounding must not create an extra claim or silently consume a redeemable amount.

Fees are charged and quoted separately from the nominal one-to-one exchange. A round trip deducts the spent network and bridge fees from the user's balances; one-to-one does not make transfers free. Native transaction fees transferred to validators remain outstanding native claims; fee burning reduces outstanding native units and needs an explicit collateral-accounting policy. Neither action authorizes extra original-token withdrawal. **Independent native inflation is excluded from this model.** Introducing it would require a revised, explicit backing model and new review before adoption.

One-to-one redemption is not a price peg guarantee or instant access to a market. It depends on available reserve capacity, escrow integrity, both networks, bridge controls and successful transaction settlement. The bridge is unavailable until implemented, reviewed and released. TEST, demo memes and founding devnet NFTs receive no bridge or conversion entitlement.

### Markets and later pools

Trading venues and official pool addresses will be published when verified. Future Solana Classic pools or additional Solana venues remain unresolved. A native-chain pool would need a supported trading programme and a defined counterpart asset. An existing Solana venue must not be assumed to operate on the independent chain.

Any additional pool needs a chosen venue and pair, authorized funding, verified asset identities, review of its trading programme, and a published liquidity-ownership and fee policy. No deposit amount, initial ratio, lock arrangement or pool address is adopted. A bridge and a market are separate systems. Neither a deployment nor a deposit establishes buyers, market depth, execution price, returns or permanent liquidity.

### Gates before real funds

Bridge failures can expose collateral or prevent redemption. Risks include programme defects, verifier collusion, key compromise and failures during reorganizations or outages. First-party bridge guidance describes these categories; it does not establish that this future design has solved them. [Ethereum.org bridge documentation](https://ethereum.org/developers/docs/bridges/) [11]

The original token launch and later native mainnet need separate release evidence:

| Area | Required evidence and decisions |
| --- | --- |
| Original SOC launch | Official recognition decision; verified mint facts; disclosed team involvement, acquisition and holdings; authorized spending and fee recipients |
| Native monetary design | Protected genesis reserve; no independent inflation; approved decimal mapping, fee accounting and validator incentives; verified native configuration |
| Chain security and operation | Independent validator plan; consensus and recovery testing; secure operator keys; funded monitoring and incident response |
| Bridge specification | Defined trust model; escrow/reserve conservation; finality policy; replay protection; pending-transfer and recovery rules |
| Bridge review and testing | Independent security review; two-way test journeys; forged/replayed-message rejection; decimal boundaries; outage, reorganization and recovery tests |
| Controls and disclosure | Public upgrade, pause and withdrawal powers; bounded initial exposure; response owners; verifiable escrow and reserve accounting |
| Further pool readiness | Selected network, venue and pair; reviewed trading programme; authorized liquidity funding; ownership and fee policy; verified addresses |

These are entry conditions for their respective releases. A passing TEST soak does not pass native-mainnet or bridge security gates. Publishing this whitepaper does not authorize token purchases, mainnet launch, bridge deployment or liquidity deposits.

## 9 Evidence and falsifiable milestones

### Release through evidence

The devnet release depends on working journeys, recoverable state and an uninterrupted stability test of the final candidate. A polished interface or a target date cannot replace those results. Each milestone is accepted against retained evidence, with unresolved failures visible on the roadmap.

### Acceptance gates

| Gate | Evidence required before it passes |
| --- | --- |
| G0 | Recorded executable and dependency manifest; working selected remote infrastructure and origins |
| G1 | Independent remote genesis; native transfer; token and NFT proofs with reachable metadata |
| G2 | Actual production browser journey through the Linux API; durable faucet, receipts, restart and deep-link refresh |
| G3 | Complete usable journey, verified discovery and first successful recovery drill |
| G4 | Two separate automated clean-browser checks cover the supported journeys; findings are recorded and failures repaired and checked again |
| G5 | Negative, bounded-load and recovery controls pass; operator review and candidate freeze |
| G6 | Uninterrupted 24 hour soak of the final core candidate |
| G7 | Final regression, release evidence, reachable anonymous HTTPS and operator handover |

The browser checks cover wallet creation, faucet use, meme and NFT issuance, gallery discovery, receipts and transfers. Each report identifies the paths it covered and its limitations. Automated checks provide technical and interface evidence; they do not establish human usability or demand. G4 still requires consolidated review before formal acceptance.

The soak covers its recorded validator, gateway, frontend, faucet, signing and issuance logic, storage and recovery configuration. A core change restarts the full 24 hour requirement. Static copy or artwork selection changes use targeted checks; changes to transaction logic, metadata origin or executable asset content do not receive that exception. The later .net frontend and upload service were deployed separately without changing the frozen candidate; the original soak does not certify them. A repaired core candidate must complete a new uninterrupted run.

If controls fail, the permitted outcome is an invite-only alpha or a reproducible local package with deployment instructions. The evidence must say which. No remote host means no public network claim. A failed gate means the release is incomplete, even if the interface looks finished.

### Measurement method

Every technical report must identify its scope as local or remote, UTC test window, genesis, source commit, runtime versions and hashes, frontend deployment, API origin and candidate configuration. It records transaction signatures, slots, actual results, error classifications, workload and resource conditions. Explorer links are supporting views; the chain response and retained evidence establish the reported result.

| Question | Measurement and interpretation |
| --- | --- |
| Does the journey work | Attempts and finalized successes for each action; end-to-end completion rate; no success from submission alone |
| Is the service stable | Slot progress and health samples; outages and duration; CPU, memory and disk during a stated workload |
| How fast is the pilot | Logical-operation start to confirmation/finalization, including API asset preparation and finalized issuance verification where relevant; report retries, reconciliation, sample count, median and p95 |
| Is state recoverable | Before/after genesis, balances, supply, authorities and ownership for named test assets after restart and restore |
| Does focus matter to people | Later human task completion and feedback; opt-in return visits and repeat creation, reported separately from automated test traffic |

Latency comparisons must include hardware, concurrency, action type, network path, admission settings and failures. Admission caps are not throughput measurements. A small sample cannot establish tail behavior or broad capacity. No benchmark result is published before measurement, and upstream performance claims are not transferred to this one-host experiment.

Cultural evaluation also has limits. A wallet address is not a person; refreshing this app changes its disposable wallet. Faucet requests and mints can be automated. Human pilot results, technical QA and organic participation therefore stay separate. Any later retention study must use a disclosed, consent-based method that respects the wallet's memory-only design. No analytics result or minimum community size is assumed.

## 10 Conditions for a later mainnet programme

After release, operate the pilot, invite contributions and learn from artists, developers and communities about continued use. Proposed products need their own owners, scope and evidence. A multi-validator experiment and supported-wallet evaluation need named operators, funding and separate tests. No later mainnet date is promised.

Native Classic SOC requires evidence that independent infrastructure serves creators better than an existing-chain application, alongside independent validators, economic security analysis, reserve and fee design, wallet and infrastructure readiness, security review, recovery plans and funded operation. A market listing or single-validator soak does not meet these conditions.

The redemption bridge and any later pools require their own specification, budget, security work and acceptance evidence. The original token's creation does not establish their launch date. TEST and demo assets have no conversion entitlement to mainnet SOC. Any additional migration or asset support needs an explicit design before it is offered.

The thesis is weakened if developers do not sustain useful work, participants find the focus unhelpful, or independent infrastructure adds no benefit. Those outcomes should change the roadmap. The reason to continue is a productive creative community and sustainable operation. Nostalgia can bring people together; continuing work must give them a reason to stay.

## 11 Decisions before release

The original frozen candidate completed its 24-hour browser soak on 14 October 2026, with 288 journeys and 2,880 observer checks. The retained report covers a bounded workload on one validator. Final browser regression and individual release attestations remain separate requirements. A controlled migration to the source-built runtime preserved the ledger and passed continuity and restart checks. Its new full stability run remains pending. Bounded load, qualified isolated recovery, SDK/browser journeys, provider container/process restart and automated browser checks passed within their recorded scopes; the founder confirmed actual alert emails. Separate frontend/upload checks and isolated source-build tests retain their own scope and unresolved gates. Complete G0 through G7 acceptance remains pending.

Before any official token announcement, resolve final metadata, the exact mint, verified supply and authorities, team involvement, holdings and their acquisition, custody, public addresses and creator-fee recipients. The official announcement must describe these relationships accurately. No free developer allocation is assumed.

For mainnet native SOC, the founder must approve the reserve quantity and protections, decimal mapping, native fee and burn treatment, validator incentives, governance, upgrade powers and operating funding within the selected one-to-one model. Independent native inflation is excluded unless a revised model is explicitly adopted. These decisions must be checked against the deployed genesis and ledger.

For the bridge and later pools, the founder must choose the verifier/trust model, security-review scope, escrow and reserve control, recovery and emergency powers, and any additional venue, pair, liquidity funding and LP-ownership arrangements. Those decisions remain unresolved. No deployed address or security guarantee is invented here.

Every release must disclose genesis, software and hashes, operator count, reset policy, supported actions, measured limits, deployment and evidence, known defects and operator contact. Report frontend, TEST-devnet, original SOC, native-mainnet, bridge and pool states separately.

## References

Primary and first-party sources consulted on 13–14 October 2026. The Bitcoin Cash and Ethereum Classic materials express their communities' perspectives. They support the historical comparison, not a claim of technical equivalence or endorsement. The July 2025 post records Yakovenko's view and the public exchange, not a poll of Solana leadership or participants. Project websites support the named cultural examples; none is presented as endorsing Solana Classic.

1. Solana Foundation. **Monthly community update December 2021**. Published 12 January 2022. https://solana.com/news/december-2021-community-update
2. Solana. **Internet capital markets**. https://solana.com/solutions/tokenization
3. Bitcoin Cash community. **The History of Bitcoin Cash**. https://bitcoincash.org/
4. Ethereum.org. **Timeline of all Ethereum forks**, DAO fork entry. https://ethereum.org/ethereum-forks/#dao-fork
5. Ethereum Classic community. **Genesis**. Published 22 February 2022; page labels its account opinionated. https://ethereumclassic.org/why-classic/genesis/
6. Anza. **Agave release v4.3.0**. https://github.com/anza-xyz/agave/releases/tag/v4.3.0
7. Anza. **Solana Test Validator**. https://docs.anza.xyz/cli/examples/test-validator
8. Solana documentation. **Metadata Pointer and Token Metadata**. https://solana.com/docs/tokens/extensions/metadata
9. Solana documentation. **Set Authority**. https://solana.com/docs/tokens/basics/set-authority
10. Solana documentation. **Accounts**. https://solana.com/docs/core/accounts
11. Ethereum.org. **Bridges**. https://ethereum.org/developers/docs/bridges/
12. Anza. **Agave v3.0.14 account-storage source**, directory-operation fallback. https://raw.githubusercontent.com/anza-xyz/agave/v3.0.14/accounts-db/src/utils.rs
13. Anatoly Yakovenko (toly). **Post on meme coins and NFTs**. Published 27 July 2025. https://x.com/toly/status/1949548737208181137
14. Solana Program maintainers. **Token-2022 programme v10.0.0 release**. https://github.com/solana-program/token-2022/releases/tag/program@v10.0.0
15. Solana Monkey Business. **Official project and collections**. https://solanamonkey.business/
16. Okay Bears. **Official website**, now redirects to We Are Okay. https://www.okaybears.com/
17. BONK. **About BONK**. https://www.bonkcoin.com/about
18. dogwifhat. **Official WIF website**. https://dogwifcoin.org/
19. Nicolas Szwajcok and co-authors. **Meme Coin Factories: Uncovering Large-Scale Manipulations on pump.fun**. Submitted 9 September 2026; arXiv:2609.10246. https://arxiv.org/abs/2609.10246
20. Solana. **Staying Safe on Solana**. https://solana.com/learn/staying-safe-on-solana

### Project sources

The open-source [repository](https://github.com/solana-classic/solana-classic) contains source pins, launch settings and dated test evidence. The [live roadmap](https://solanaclassic.net/roadmap) publishes current checks; the [About page](https://solanaclassic.net/about) records the founding narrative. Later founder decisions supersede older planning prose where their scope is explicit. This whitepaper does not replace release acceptance records.
