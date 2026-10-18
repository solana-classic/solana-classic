import test from 'node:test';
import assert from 'node:assert/strict';
import { retainQaInputs } from './qa_state.mjs';
const names = ['candidate-freeze', 'load', 'backup-check', 'restart-check',
  'pilot-agent-one', 'pilot-agent-two', 'monitoring-config', 'frontend-rollback', 'remote-negative-controls'];
const pins = Object.fromEntries(names.map((name, i) => [name, (i + 1).toString(16).repeat(64)]));
test('terminal success retains the exact claimed input checksums without inferring acceptance', () => {
  const prior = { state: 'starting', soakStarted: true, inputChecksums: pins };
  const next = retainQaInputs(prior, { state: 'completed', soakStarted: true, soakAccepted: false });
  assert.deepEqual(next.inputChecksums, pins);
  assert.equal(next.soakAccepted, false);
  assert.equal(next.passed, undefined);
  assert.notEqual(next.inputChecksums, pins);
});
test('interruption and subprocess-error status retain claimed bytes', () => {
  for (const state of ['interrupted', 'blocked']) {
    const next = retainQaInputs({ soakStarted: true, inputChecksums: pins }, { state, soakStarted: true });
    assert.deepEqual(next.inputChecksums, pins);
  }
});
test('claimed input replacement or omission cannot be hidden by a terminal report', () => {
  for (const changed of [{ ...pins, load: '0'.repeat(64) }, { load: pins.load }, {}, [], null]) {
    const prior = { soakStarted: true, inputChecksums: pins };
    if (changed === null) assert.deepEqual(retainQaInputs(prior, { inputChecksums: changed }).inputChecksums, pins);
    else assert.throws(() => retainQaInputs(prior, { inputChecksums: changed }));
  }
  assert.throws(() => retainQaInputs({ soakStarted: true }, { state: 'completed' }));
});
test('activation requires nine valid pins even if pre-activation readiness is partial', () => {
  assert.throws(() => retainQaInputs({ inputChecksums: { load: pins.load } }, { soakStarted: true }));
  assert.throws(() => retainQaInputs({}, { soakStarted: true, inputChecksums: { ...pins, load: true } }));
  const partial = retainQaInputs({}, { state: 'blocked', soakStarted: false, inputChecksums: { load: pins.load } });
  assert.deepEqual(partial.inputChecksums, { load: pins.load });
});
test('caller objects cannot alias the retained output checksum map', () => {
  const incoming = { state: 'starting', soakStarted: true, inputChecksums: { ...pins } };
  const output = retainQaInputs({}, incoming);incoming.inputChecksums.load = '0'.repeat(64);
  assert.equal(output.inputChecksums.load, pins.load);
});
