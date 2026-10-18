const names = ['candidate-freeze', 'load', 'backup-check', 'restart-check',
  'pilot-agent-one', 'pilot-agent-two', 'monitoring-config', 'frontend-rollback', 'remote-negative-controls'];
const complete = value => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => /^[a-f0-9]{64}$/.test(value[name]));
const same = (a, b) => complete(a) && complete(b) && names.every(name => a[name] === b[name]);

// Preserve selected bytes in terminal QA reports; never infer acceptance.
export function retainQaInputs(previous, incoming) {
  const selected = incoming.inputChecksums ?? previous.inputChecksums;
  if (previous.soakStarted === true || incoming.soakStarted === true) {
    if (!complete(selected) || (previous.soakStarted === true && !same(previous.inputChecksums, selected))) {
      throw Error('Claimed QA prerequisite checksums must remain complete and unchanged.');
    }
  }
  return { ...incoming, ...(selected === undefined ? {} : { inputChecksums: { ...selected } }) };
}
