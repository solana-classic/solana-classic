"""Apply the full terminal refusal matrix to the separately pinned replacement."""
import hashlib, importlib.util, json, unittest
from pathlib import Path
from unittest.mock import patch

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

shared = load('shared_source_tests', 'source_terminal_review_test.py')
m = load('replacement_terminal', 'replacement_source_terminal_review.py')
base_fixture = shared.fixture

def fixture():
    items = base_fixture()
    items[2]['runnerDeploymentId'] = '93d2d479-4064-4c2e-af8e-bdce70312ce6'
    items[2]['namespace'] = 'source-soak-20261016T0110Z-v1'
    return items

class ReplacementTerminal(shared.SourceTerminal):
    def setUp(self):
        super().setUp()
        self.addCleanup(patch.stopall)
        patch.object(shared, 'm', m).start()
        patch.object(shared, 'fixture', fixture).start()

    def test_selected_public_activation_has_the_exact_reviewed_digest(self):
        raw = m.terminal.public_file(m.ROOT / 'evidence/agave-source-stability-replacement-started.json')
        evidence = json.loads(raw)
        digest = hashlib.sha256(json.dumps(evidence, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.assertEqual(digest, m.ACTIVATION_SHA)
        self.assertEqual(evidence['startedAt'], m.START)
        self.assertFalse(evidence['stabilityAccepted'])

    def test_old_source_start_runner_and_namespace_cannot_be_selected(self):
        for field, value in [('startedAt', '2026-10-15T03:59:33.330Z'),
                             ('runnerDeploymentId', 'f5a309fe-bfe6-4958-a4f5-a2e2129da629'),
                             ('namespace', 'source-soak-20261015T0348Z-v2')]:
            items = fixture()
            items[2][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'EXACT_SOURCE_ACTIVATION'):
                self.evaluate(items)

    def test_duplicate_recorded_prerequisites_cannot_replace_the_full_set(self):
        items = fixture()
        rows = items[0]['soak']['prerequisites']
        rows[1] = dict(rows[0])
        with self.assertRaisesRegex(ValueError, 'PREREQUISITE_NAMES'):
            self.evaluate(items)

    def test_retained_interrupted_shape_cannot_pass_with_new_admission_or_elapsed_time(self):
        items = fixture()
        items[0]['soak'].update(passed=False, completedJourneys=237)
        items[0]['soak']['journeys'] = items[0]['soak']['journeys'][:237]
        items[0]['qa'].update(state='interrupted', soakAccepted=False, exitCode=1)
        with self.assertRaisesRegex(ValueError, 'SOURCE_RUN_NOT_COMPLETED'):
            self.evaluate(items)

if __name__ == '__main__':
    unittest.main()
