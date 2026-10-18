"""Offline integrity review of individual source-candidate attestations.

No network, chain operations, test activation or release approval. Integrity of
recorded claims is distinct from independently proving those claims.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat

ROOT = Path(__file__).resolve().parents[2]
FREEZE_SHA = '55b668e56a946ec94f0195b03530aba23593bd71d7fd52493d5403b21882757f'
CHECKLIST_SHA = 'e2fb4b2f53e9aa10f21ec5ffcf708cc2749b456a39703c9228a7fce7fc574f73'
HISTORICAL_SHA = '9161c1e4644b20939ab122c227970604e3f15c8121430ce71f125e9c9d3f2597'
# Stable IDs from the separately reviewed checklist with CHECKLIST_SHA.
REQUIRED = tuple(f'G{gate}.{n:02d}' for gate, count in enumerate((10, 7, 9, 9, 8, 12, 11, 9)) for n in range(1, count + 1))
MAX_BYTES = 1_048_576


def require(condition, code):
    if not condition:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def public_bytes(root, name):
    require(isinstance(name, str) and re.fullmatch(r'evidence/[A-Za-z0-9_./-]+[.]json', name) is not None, 'INVALID_PROOF_PATH')
    parts = PurePosixPath(name).parts
    require('..' not in parts and str(PurePosixPath(name)) == name, 'INVALID_PROOF_PATH')
    require(not root.is_symlink(), 'LINKED_ROOT')
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        try:
            before = os.fstat(descriptor)
            require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= MAX_BYTES, 'UNBOUNDED_OR_NONREGULAR_PROOF')
            with os.fdopen(descriptor, 'rb', closefd=False) as source:
                raw = source.read(MAX_BYTES + 1)
            after = os.fstat(descriptor)
            linked = os.stat(parts[-1], dir_fd=directory, follow_symlinks=False)
            fingerprint = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_mode, s.st_nlink)
            require(len(raw) == before.st_size and fingerprint(before) == fingerprint(after) == fingerprint(linked), 'PROOF_CHANGED_DURING_READ')
            return raw
        finally:
            os.close(descriptor)
    finally:
        os.close(directory)


def document(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    def invalid(_):
        raise ValueError('NONFINITE_JSON_VALUE')
    value = json.loads(raw, object_pairs_hook=unique, parse_constant=invalid)
    require(type(value) is dict, 'OBJECT_REQUIRED')
    return value


def instant(value):
    require(isinstance(value, str), 'INVALID_TIMESTAMP')
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(date.tzinfo is not None, 'UNZONED_TIMESTAMP')
    return date


def review(root, now=None):
    root = Path(root)
    now = now or dt.datetime.now(dt.timezone.utc)
    freeze_raw = public_bytes(root, 'evidence/agave-source-candidate-freeze.json')
    require(digest(freeze_raw) == FREEZE_SHA, 'EXACT_SOURCE_FREEZE_REQUIRED')
    freeze = document(freeze_raw)
    raw = public_bytes(root, 'evidence/agave-source-acceptance-gates.json')
    inventory = document(raw)
    require(type(inventory.get('schemaVersion')) is int and inventory['schemaVersion'] == 1, 'INVENTORY_SCHEMA_DIFFERS')
    require(inventory.get('candidate') == freeze['candidate'] and inventory.get('genesis') == freeze['genesis'], 'INVENTORY_CANDIDATE_DIFFERS')
    require(inventory.get('freezeSha256') == FREEZE_SHA and inventory.get('checklistSha256') == CHECKLIST_SHA, 'INVENTORY_PINS_DIFFER')
    require(all(inventory.get(k) is False for k in ('releaseAccepted', 'mainnetAccepted', 'bridgeAccepted', 'legacyReleaseEvaluatorConsumesThisInventory')), 'INVENTORY_CANNOT_GRANT_RELEASE')
    require(inventory.get('historicalManifest') == {'path': 'evidence/acceptance-gates.json', 'sha256': HISTORICAL_SHA, 'carriedOverRequirements': 0}, 'HISTORICAL_CARRYOVER_FORBIDDEN')
    require(digest(public_bytes(root, 'evidence/acceptance-gates.json')) == HISTORICAL_SHA, 'HISTORICAL_MANIFEST_CHANGED')
    observed = instant(inventory['at'])
    require(instant(freeze['frozenAt']) <= observed <= now, 'INVENTORY_TIME_INVALID')
    entries = inventory.get('requirements')
    require(type(entries) is dict and set(entries) <= set(REQUIRED), 'UNKNOWN_REQUIREMENT')
    require('G7.05' not in entries, 'DERIVED_RELEASE_ATTESTATION_FORBIDDEN')
    unreviewed = inventory.get('unreviewedRequirements')
    require(type(unreviewed) is list and all(type(x) is str for x in unreviewed) and len(set(unreviewed)) == len(unreviewed) and set(unreviewed) == set(REQUIRED) - set(entries), 'UNREVIEWED_COMPLEMENT_DIFFERS')
    require(type(inventory.get('reviewedRequirementCount')) is int and inventory['reviewedRequirementCount'] == len(entries) and type(inventory.get('requiredRequirementCount')) is int and inventory['requiredRequirementCount'] == len(REQUIRED), 'INVENTORY_COUNTS_DIFFER')
    verified = {}
    individual = set()

    def reference(ref):
        require(type(ref) is dict and set(ref) == {'path', 'sha256'} and isinstance(ref['sha256'], str) and re.fullmatch('[0-9a-f]{64}', ref['sha256']) is not None, 'INVALID_PROOF_REFERENCE')
        name = ref['path']
        data = public_bytes(root, name)
        require(digest(data) == ref['sha256'], 'PROOF_DIGEST_DIFFERS')
        require(name not in verified or verified[name] == ref['sha256'], 'CONFLICTING_PROOF_REFERENCE')
        verified[name] = ref['sha256']
        return document(data)

    for requirement, entry in entries.items():
        require(type(entry) is dict and entry.get('passed') is True and entry.get('scope') in ('remote', 'repository', 'operator'), 'INVALID_ATTESTATION')
        verified_at = instant(entry['verifiedAt'])
        require(instant(freeze['frozenAt']) <= verified_at <= observed, 'ATTESTATION_TIME_INVALID')
        refs = entry.get('proofs')
        require(type(refs) is list and 0 < len(refs) <= 16, 'INDIVIDUAL_PROOF_REQUIRED')
        names = []
        for ref in refs:
            proof = reference(ref)
            names.append(ref['path'])
            individual.add(ref['path'])
            require(proof.get('passed') is True and type(proof.get('schemaVersion')) is int and proof['schemaVersion'] == 1, 'INDIVIDUAL_PROOF_NOT_PASSED')
            require(proof.get('candidate') == freeze['candidate'] and proof.get('genesis') == freeze['genesis'] and proof.get('freezeSha256') == FREEZE_SHA and proof.get('checklistSha256') == CHECKLIST_SHA, 'PROOF_CANDIDATE_OR_PINS_DIFFER')
            require(all(proof.get(k) is False for k in ('releaseAccepted', 'mainnetAccepted', 'bridgeAccepted')), 'AGGREGATE_RELEASE_PROOF_FORBIDDEN')
            require(isinstance(proof.get('scope'), str) and proof['scope'].startswith(entry['scope']), 'PROOF_SCOPE_DIFFERS')
            require(instant(freeze['frozenAt']) <= instant(proof['at']) <= verified_at, 'PROOF_TIME_INVALID')
            claims = proof.get('requirements')
            require(type(claims) is dict and requirement in claims and type(claims[requirement]) is dict and isinstance(claims[requirement].get('claim'), str) and bool(claims[requirement]['claim'].strip()), 'REQUIREMENT_NOT_ESTABLISHED_BY_PROOF')
            require(requirement not in proof.get('unacceptedRequirements', {}), 'PROOF_EXPLICITLY_LEAVES_REQUIREMENT_OPEN')
            support = proof.get('proofs')
            require(type(support) is list and 0 < len(support) <= 64, 'SUPPORTING_REFERENCES_REQUIRED')
            support_names = []
            for item in support:
                reference(item)
                support_names.append(item['path'])
            require(len(support_names) == len(set(support_names)) and ref['path'] not in support_names, 'REPEATED_OR_SELF_REFERENCING_PROOF')
        require(len(names) == len(set(names)), 'DUPLICATE_INDIVIDUAL_PROOF')
    return {'schemaVersion': 1, 'at': now.isoformat(), 'scope': 'offline inventory integrity only; recorded attestations are not independent chain or behavioral proof', 'integrityAccepted': True, 'inventorySha256': digest(raw), 'freezeSha256': FREEZE_SHA, 'checklistSha256': CHECKLIST_SHA, 'reviewedRequirementCount': len(entries), 'requiredRequirementCount': len(REQUIRED), 'unreviewedRequirements': sorted(unreviewed), 'individualProofCount': len(individual), 'verifiedProofFiles': verified, 'supportingReferenceDepth': 1, 'releaseAccepted': False, 'mainnetAccepted': False, 'bridgeAccepted': False, 'limitations': ['Validates individual proof declarations and their immediate supporting byte references, not arbitrary nested evidence semantics.', 'Pinned checklist IDs and digest come from the reviewed contract; this does not reread the ignored checklist text.', 'Does not verify live runtime, frozen source files, operator truthfulness, deadlines or any missing requirement.', 'Exit zero means inventory integrity only. G7.05 and overall release acceptance cannot be supplied by this checker.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        result = review(args.root)
    except Exception as error:
        result = {'schemaVersion': 1, 'integrityAccepted': False, 'scope': 'offline inventory integrity refusal', 'failureType': type(error).__name__, 'releaseAccepted': False, 'mainnetAccepted': False, 'bridgeAccepted': False}
        if type(error) is ValueError and re.fullmatch('[A-Z_]+', str(error)):
            result['failureCode'] = str(error)
    print(json.dumps(result, indent=2))
    return 0 if result['integrityAccepted'] else 78


if __name__ == '__main__':
    raise SystemExit(main())
