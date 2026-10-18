# Declared committee control and custody review

The prototype requires three signatures from five configured keys. Five keys
alone do not establish independent operators, signing custody, recovery access
or outage dependencies. `committee-control.mjs` makes these declaration gaps
visible without appointing operators or granting signing permission.

`reviewCommitteeControl({expectedCommittee, declaration, requirements})` is pure
offline analysis. `expectedCommittee` is an externally selected list of the five
ordinary signing public keys. Every declared member must match it exactly.
The declaration fixes the existing three-of-five prototype threshold; it cannot
change the deployed programme or claim journal.

Each member supplies an opaque operator identifier, a list of controller domains
and a list of availability domains. A controller domain means an entity or
access path declared able to use or recover that key independently. Include
shared recovery material and administrative access. Alternatives within one
list are modeled as OR access. Joint custody thresholds, hardware policy,
timelocks and conditional access need their own enforcement review; this model
does not prove them.

An availability domain means a declared failure that would disable that member.
Redundant hosting does not mean every provider failure disables the signer;
model the actual dependency, rather than treating replica locations as loss
conditions. The code cannot verify that these declarations are complete.

The analyzer finds the smallest declared:

- Operator coalition able to assemble three members.
- Controller coalition able to control three signing keys, including overlapping
  direct and recovery paths.
- Outage coalition able to disable three members and leave fewer than three
  available signers.

A bounded dynamic program examines at most32 signer-coverage states per domain.
Each member has at most eight controller and eight outage domains. Ordering and
hashes use canonical ASCII comparisons, independent of the host locale. The
private declaration digest binds the selected roster and supplied requirements.

Requirements are explicit proposed criteria, each from one to three domains;
there are no default production values. The private demonstration uses three
operators for quorum, three controllers for quorum and two outage domains for
loss of quorum. These are demonstration criteria, not an approved mainnet
custody policy. Relaxing them never enables a signing or release permission.

| Supplied declaration | Result under the demonstration criteria |
| --- | --- |
| Five operator and control labels with separate outage dependencies | Declared criteria met; identities and enforcement still unverified |
| Five keys assigned to one operator | Operator concentration flagged |
| Five operators sharing recovery access to all keys | Signing or recovery concentration flagged |
| Two overlapping controllers together cover three keys | Two-controller quorum detected and flagged |
| One hosting failure disables three or more members | Availability concentration flagged |

A positive declaration result is not custody acceptance. Operator identities,
control coverage, key ownership, signing enforcement, recovery controls,
independent source observations, upgrade controls, security review and release
authority remain unverified. `canPrepareProductionClaim`, `canSign`, `canBroadcast`
and `productionReady` are always false. No existing handoff API is changed.

## Retained fixture check

The read-only runner in `rehearsal/committee-control.mjs` uses a new private
attempt. It rechecks the two retained source captures against selections stored
before their earlier archive. Both supplied programme policies must contain the
same five-key roster. It then analyzes that synthetic fixture under an explicit
same-owner, shared-recovery and shared-host declaration. No private keys are
read and no operators are appointed.

Four checks completed: capture binding, shared roster, concentration detection
and unchanged capture/source files. The declared criteria correctly fail in all
three dimensions: one operator, one controller and one outage domain suffice.
This is a demonstration of declared concentration, not an independent discovery
of real operator identities. The [aggregate evidence](../evidence/bridge-committee-control.json)
excludes actual keys, controller labels and private declaration hashes. Actual
validator starts, chain RPC requests, new keys and submissions are zero.

Ten tests include normalization and external-roster binding, invalid declarations,
shared recovery, overlapping control, outage concentration and explicit relaxed
criteria that still cannot grant signing permission. The coalition calculation
also matches an exhaustive subset reference across80 small synthetic models.
The complete bridge suite passes289 checks.

Before mainnet, real operators must supply reviewed assignments and demonstrate
key custody, recovery procedures and independent source observations. Upgrade
authority and reserve custody need separate enforcement evidence. The Linux
validator rehearsal, missing historical native transaction, funded bootstrap and
independent security review remain open. Keep actual operator mappings and
private review records out of source and deployment inputs.
