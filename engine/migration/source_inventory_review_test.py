"""Tampering and bounded-read regressions for the offline inventory checker."""
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('source_inventory_review', Path(__file__).with_name('source_inventory_review.py'))
reviewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewer)
NOW = dt.datetime(2030, 1, 1, tzinfo=dt.timezone.utc)
INVENTORY = 'evidence/agave-source-acceptance-gates.json'


class InventoryReview(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'evidence').mkdir()
        self.inventory = json.loads((reviewer.ROOT / INVENTORY).read_text())
        names = {INVENTORY, 'evidence/agave-source-candidate-freeze.json', 'evidence/acceptance-gates.json'}
        for entry in self.inventory['requirements'].values():
            for ref in entry['proofs']:
                names.add(ref['path'])
                proof = json.loads((reviewer.ROOT / ref['path']).read_text())
                names.update(p['path'] for p in proof['proofs'])
        for name in names:
            (self.root / name).write_bytes((reviewer.ROOT / name).read_bytes())
        self.requirement = next(iter(self.inventory['requirements']))
        self.proof_name = self.inventory['requirements'][self.requirement]['proofs'][0]['path']

    def write_inventory(self):
        (self.root / INVENTORY).write_text(json.dumps(self.inventory))

    def mutate_proof(self, change):
        path = self.root / self.proof_name
        proof = json.loads(path.read_text())
        change(proof)
        path.write_text(json.dumps(proof))
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        for entry in self.inventory['requirements'].values():
            for ref in entry['proofs']:
                if ref['path'] == self.proof_name:
                    ref['sha256'] = sha
        self.write_inventory()

    def rejects(self):
        with self.assertRaises((ValueError, OSError, KeyError, TypeError)):
            reviewer.review(self.root, NOW)

    def test_real_inventory_integrity_is_not_release_acceptance(self):
        before = {p.name: p.read_bytes() for p in (self.root / 'evidence').iterdir()}
        report = reviewer.review(self.root, NOW)
        self.assertTrue(report['integrityAccepted'])
        self.assertEqual(report['reviewedRequirementCount'], len(self.inventory['requirements']))
        self.assertEqual(report['requiredRequirementCount'], 75)
        self.assertIn('G7.05', report['unreviewedRequirements'])
        self.assertFalse(report['releaseAccepted'])
        self.assertFalse(report['mainnetAccepted'])
        self.assertFalse(report['bridgeAccepted'])
        self.assertEqual(before, {p.name: p.read_bytes() for p in (self.root / 'evidence').iterdir()})

    def test_changed_freeze(self):
        with (self.root / 'evidence/agave-source-candidate-freeze.json').open('ab') as f:
            f.write(b' ')
        self.rejects()

    def test_old_inventory_candidate(self):
        self.inventory['candidate']['apiCommit'] = 'c1a7f15839d6fbed5b04fe7ea773d61cf273bdb2'
        self.write_inventory()
        self.rejects()

    def test_wrong_candidate_proof_even_with_updated_digest(self):
        self.mutate_proof(lambda p: p['candidate'].update(apiCommit='c1a7f15839d6fbed5b04fe7ea773d61cf273bdb2'))
        self.rejects()

    def test_proof_does_not_cover_named_requirement(self):
        self.mutate_proof(lambda p: p['requirements'].pop(self.requirement))
        self.rejects()

    def test_explicit_unaccepted_requirement(self):
        self.mutate_proof(lambda p: p.update(unacceptedRequirements={self.requirement: {'status': 'partial'}}))
        self.rejects()

    def test_fixture_scope_is_not_remote(self):
        self.mutate_proof(lambda p: p.update(scope='local fixture'))
        self.rejects()

    def test_failed_proof_and_string_boolean(self):
        for bad in [False, 'true', 1]:
            with self.subTest(bad=bad):
                self.mutate_proof(lambda p: p.update(passed=bad))
                self.rejects()

    def test_aggregate_release_claims_rejected(self):
        original = copy.deepcopy(self.inventory)
        for key in ['releaseAccepted', 'mainnetAccepted', 'bridgeAccepted', 'legacyReleaseEvaluatorConsumesThisInventory']:
            with self.subTest(key=key):
                self.inventory = copy.deepcopy(original)
                self.inventory[key] = True
                self.write_inventory()
                self.rejects()

    def test_proof_cannot_grant_aggregate_release(self):
        self.mutate_proof(lambda p: p.update(releaseAccepted=True))
        self.rejects()

    def test_counts_must_match_not_bool(self):
        for bad in [True, 75, -1]:
            with self.subTest(bad=bad):
                self.inventory['reviewedRequirementCount'] = bad
                self.write_inventory()
                self.rejects()

    def test_unreviewed_complement_and_duplicates(self):
        original = list(self.inventory['unreviewedRequirements'])
        for bad in [original[:-1], original + [original[0]], original + [self.requirement]]:
            self.inventory['unreviewedRequirements'] = bad
            self.write_inventory()
            self.rejects()

    def test_unknown_requirement(self):
        self.inventory['requirements']['G8.01'] = self.inventory['requirements'].pop(self.requirement)
        self.write_inventory()
        self.rejects()

    def test_circular_release_check_cannot_be_attested(self):
        self.inventory['requirements']['G7.05'] = copy.deepcopy(self.inventory['requirements'][self.requirement])
        self.inventory['unreviewedRequirements'].remove('G7.05')
        self.inventory['reviewedRequirementCount'] += 1
        self.write_inventory()
        self.rejects()

    def test_historical_carryover_and_bytes_rejected(self):
        self.inventory['historicalManifest']['carriedOverRequirements'] = 1
        self.write_inventory()
        self.rejects()
        self.inventory['historicalManifest']['carriedOverRequirements'] = 0
        self.write_inventory()
        (self.root / 'evidence/acceptance-gates.json').write_text('{}')
        self.rejects()

    def test_changed_supporting_bytes_rejected(self):
        proof = json.loads((self.root / self.proof_name).read_text())
        target = self.root / proof['proofs'][0]['path']
        target.write_text('{}')
        self.rejects()

    def test_future_proof_even_with_updated_digest(self):
        self.mutate_proof(lambda p: p.update(at='2099-01-01T00:00:00Z'))
        self.rejects()

    def test_path_escape_rejected(self):
        self.inventory['requirements'][self.requirement]['proofs'][0]['path'] = 'evidence/../../private.json'
        self.write_inventory()
        self.rejects()

    def test_duplicate_json_keys_rejected(self):
        path = self.root / INVENTORY
        raw = path.read_text()
        path.write_text(raw.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'))
        self.rejects()

    def test_nonfinite_json_rejected(self):
        path = self.root / INVENTORY
        path.write_text(path.read_text().replace('"schemaVersion": 1', '"schemaVersion": NaN'))
        self.rejects()

    def test_leaf_symlink_rejected(self):
        path = self.root / self.proof_name
        data = path.read_bytes()
        path.unlink()
        target = self.root / 'other.json'
        target.write_bytes(data)
        path.symlink_to(target)
        self.rejects()

    def test_parent_symlink_rejected(self):
        (self.root / 'evidence').rename(self.root / 'stored')
        (self.root / 'evidence').symlink_to(self.root / 'stored', target_is_directory=True)
        self.rejects()

    def test_hardlink_rejected(self):
        os.link(self.root / self.proof_name, self.root / 'linked.json')
        self.rejects()

    def test_oversized_file_rejected(self):
        (self.root / self.proof_name).write_bytes(b' ' * (reviewer.MAX_BYTES + 1))
        self.rejects()

    def test_fifo_refuses_without_blocking_and_hides_paths(self):
        path = self.root / self.proof_name
        path.unlink()
        os.mkfifo(path)
        result = subprocess.run([sys.executable, '-B', str(Path(reviewer.__file__)), '--root', str(self.root)], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 78)
        report = json.loads(result.stdout)
        self.assertFalse(report['integrityAccepted'])
        self.assertEqual(report['failureCode'], 'UNBOUNDED_OR_NONREGULAR_PROOF')
        self.assertNotIn(str(self.root), result.stdout + result.stderr)
        self.assertEqual(result.stderr, '')


if __name__ == '__main__':
    unittest.main()
