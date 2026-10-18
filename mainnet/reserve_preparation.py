"""Second-stage isolated reserve preparation from an externally selected bundle.

Called explicitly by prepare-consensus. Reuses private validator identities;
never starts validators, signs transactions or changes the baseline bundle.
"""
from pathlib import Path
import datetime, hashlib, importlib.util, json, os, re, signal, stat
import reserve_adapter_process as adapter

_spec = importlib.util.spec_from_file_location('reserve_prepare_helpers', Path(__file__).with_name('prepare-consensus.py'))
p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(p)


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def private_bytes(path, maximum):
    path = Path(path)
    before = path.lstat()
    if before.st_mode & 0o077 or before.st_nlink != 1 or not 0 < before.st_size <= maximum:
        raise ValueError('OWNER_ONLY_SELECTED_INPUT_REQUIRED')
    return p.genesis_snapshot(path)


def selection_file(path, digest):
    raw = private_bytes(path, 1024**2)
    if hashlib.sha256(raw).hexdigest() != p.c.digest(digest):
        raise ValueError('RESERVE_SELECTION_BYTES_DIFFER')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result: raise ValueError('DUPLICATE_RESERVE_SELECTION_FIELD')
            result[key] = value
        return result
    def reject(value): raise ValueError('FINITE_RESERVE_SELECTION_REQUIRED')
    selected = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=reject)
    fields = {'schemaVersion', 'scope', 'baselineBundleId', 'baselineManifestSHA256', 'planningInput', 'prepareSelection', 'node', 'bundle'}
    if type(selected) is not dict or set(selected) != fields or type(selected['schemaVersion']) is not int or selected['schemaVersion'] != 1 or selected['scope'] != 'isolated-reserve-preparation-v1':
        raise ValueError('EXACT_RESERVE_SELECTION_REQUIRED')
    if type(selected['baselineBundleId']) is not str or not re.fullmatch('[a-z0-9][a-z0-9-]{7,63}', selected['baselineBundleId']):
        raise ValueError('SELECTED_BASELINE_BUNDLE_REQUIRED')
    p.c.digest(selected['baselineManifestSHA256'])
    selected['prepareSelection'] = adapter.reserve_adapter_result.validate_selection('prepare', selected['prepareSelection'])
    for field in ('node', 'bundle'):
        if type(selected[field]) is not str or not Path(selected[field]).is_absolute():
            raise ValueError('ABSOLUTE_RESERVE_ARTIFACT_REQUIRED')
    if type(selected['planningInput']) is not dict:
        raise ValueError('SELECTED_RESERVE_PLAN_REQUIRED')
    encoded(selected)  # Reject nonfinite numbers, including overflowed exponents.
    return selected


def run(binary_directory, bundle_id, selection_path, selection_sha256, execute=False):
    if os.environ.get('RAILWAY_SERVICE_ID') == p.CANONICAL_SERVICE:
        raise ValueError('CANONICAL_SERVICE_FORBIDDEN')
    host = p.c.host.assess(p.c.host.probe(binary_directory, p.BASE.parent))
    if not host['canPrepareFreshPrivateRehearsal']:
        return {'state': 'blocked', 'host': host, 'createdKeys': False, 'createdLedger': False, 'validatorsStarted': 0, 'productionReady': False}
    p.check_tools(binary_directory)
    if type(bundle_id) is not str or not re.fullmatch('[a-z0-9][a-z0-9-]{7,63}', bundle_id):
        raise ValueError('NEW_PRIVATE_BUNDLE_ID_REQUIRED')
    selected = selection_file(selection_path, selection_sha256)
    baseline = p.BASE / 'bundles' / selected['baselineBundleId']
    manifest_bytes = private_bytes(baseline / 'manifest.json', 65536)
    if hashlib.sha256(manifest_bytes).hexdigest() != selected['baselineManifestSHA256']:
        raise ValueError('SELECTED_BASELINE_MANIFEST_DIFFERS')
    manifest, _ = p.c.check_bundle(baseline, binary_directory)
    if encoded(manifest) != encoded(json.loads(manifest_bytes)) or manifest['totalNativeUnits'] != str(p.TOTAL):
        raise ValueError('SELECTED_BASELINE_MANIFEST_DIFFERS')
    expected = selected['prepareSelection']
    if expected['baselineGenesis'] != manifest['genesis'] or expected['totalNativeUnits'] != manifest['totalNativeUnits']:
        raise ValueError('SELECTED_BASELINE_IDENTITY_DIFFERS')
    pins = json.loads(Path(__file__).with_name('reserve-runtime-artifacts.json').read_text())
    for name, maximum in [('node', adapter.MAX_NODE_BYTES), ('bundle', adapter.MAX_BUNDLE_BYTES)]:
        pin = pins[name]
        adapter.artifact(Path(selected[name]), pin['sha256'], pin['bytes'], maximum, name == 'node')
    if not execute:
        return {'state': 'preparation-host-admitted', 'host': host, 'selectedBaselineChecked': True, 'createdKeys': False, 'createdLedger': False, 'validatorsStarted': 0, 'productionReady': False}
    p.no_active_validator()
    for directory in [p.BASE, p.BASE/'preparations', p.BASE/'bundles']:
        if directory.is_symlink() or any(v.is_symlink() for v in directory.parents): raise ValueError('PRIVATE_PREPARATION_ROOT_REQUIRED')
        if directory.exists() and (not directory.is_dir() or directory.stat().st_uid != os.getuid() or stat.S_IMODE(directory.stat().st_mode) & 0o077): raise ValueError('OWNER_ONLY_PREPARATION_ROOT_REQUIRED')
    root = p.BASE/'preparations'/bundle_id
    bundle = p.BASE/'bundles'/bundle_id
    if root.exists() or root.is_symlink() or bundle.exists() or bundle.is_symlink(): raise ValueError('RETAINED_PREPARATION_MUST_NOT_BE_REUSED')
    old_umask = os.umask(0o077)
    try:
        for directory in [p.BASE, p.BASE/'preparations', p.BASE/'bundles']: directory.mkdir(mode=0o700, exist_ok=True)
        root.mkdir(mode=0o700)
        bundle.mkdir(mode=0o700)
    except BaseException:
        os.umask(old_umask)
        raise
    proof = {'schemaVersion': 1, 'state': 'preparing', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Selected private reserve genesis compilation and two slot-zero replays; no network activation', 'selectionSHA256': selection_sha256, 'baselineManifestSHA256': selected['baselineManifestSHA256'], 'planSHA256': expected['planSHA256'], 'createdKeys': False, 'createdLedger': False, 'validatorsStarted': 0, 'canonicalNetworkChanged': False, 'hostChecksWeakened': False, 'backingVerified': False, 'custodyVerified': False, 'mainnetActivated': False, 'productionReady': False}
    def save(): (root/'public-result.json').write_text(json.dumps(proof, indent=2)+'\n')
    sequence = 0
    def tool(args, input_bytes=None):
        nonlocal sequence
        if Path(args[0]) not in {binary_directory/name for name in ['solana-genesis', 'classic-genesis-audit-v2', 'classic-genesis-allocation-bytes', 'agave-ledger-tool']}: raise ValueError('OFFLINE_PREPARATION_TOOL_REQUIRED')
        p.check_tools(binary_directory)
        for name, (digest, size) in p.c.host.PINS.items(): p.check_binary(binary_directory/name, digest, size, 'REVIEWED_RUNTIME_ARTIFACT_CHANGED')
        sequence += 1
        with (root/('tool-'+str(sequence)+'-private.log')).open('xb') as log:
            return p.offline_process.run_tool(args, log, input_bytes=input_bytes, timeout=30 if input_bytes is not None else 180, stdout_limit=(8 if input_bytes is not None else 4)*1024**2)
    def decode(ledger, audit, reserve):
        snapshot = p.genesis_snapshot(ledger/'genesis.bin')
        digest = hashlib.sha256(snapshot).hexdigest()
        raw = tool([str(binary_directory/'classic-genesis-allocation-bytes'), '--isolated-genesis-stdin', p.c.address(audit['genesis']), digest], snapshot)
        with (root/(ledger.parent.name+'-'+ledger.name+'-allocation-private.json')).open('xb') as out: out.write(raw)
        if p.genesis_snapshot(ledger/'genesis.bin') != snapshot: raise ValueError('GENESIS_CHANGED_DURING_DECODE')
        decoded = json.loads(raw)
        p.decoded_allocations(decoded, audit, reserve, int(expected['reserveNativeUnits']))
        return raw, decoded, digest
    def call(mode, inputs, expectations):
        raw = encoded(inputs)
        with (root/('adapter-'+mode+'-private.log')).open('xb') as log:
            result = adapter.run_validated(Path(selected['node']), Path(selected['bundle']), node_sha256=pins['node']['sha256'], node_bytes=pins['node']['bytes'], bundle_sha256=pins['bundle']['sha256'], bundle_bytes=pins['bundle']['bytes'], mode=mode, input_bytes=raw, input_sha256=hashlib.sha256(raw).hexdigest(), selection=expectations, log=log)
        with (root/('adapter-'+mode+'-private.json')).open('xb') as out: out.write(encoded(result))
        return result
    previous = signal.getsignal(signal.SIGTERM)
    def interrupted(signum, frame): raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        save()
        audit = json.loads(tool([str(binary_directory/'classic-genesis-audit-v2'), str(baseline/'genesis')]))
        p.c.validate_audit(manifest, audit)
        planning = selected['planningInput']
        if encoded(planning.get('genesisAudit')) != encoded(audit) or planning.get('expectedGenesis') != manifest['genesis'] or expected['baselineAccountCount'] != audit['accountCount']:
            raise ValueError('SELECTED_BASELINE_AUDIT_DIFFERS')
        old_reserve = p.c.address(planning['reserveAddress'])
        before_raw, before, before_sha = decode(baseline/'genesis', audit, old_reserve)
        if before_sha != manifest['genesisBinSHA256']: raise ValueError('SELECTED_BASELINE_BYTES_DIFFER')
        inputs = {'planningInput': planning, 'expectedPlanSHA256': expected['planSHA256'], 'rawBaselineDecoded': before_raw.decode('utf-8'), 'expectedBaselineDecodedSHA256': hashlib.sha256(before_raw).hexdigest()}
        prepared = call('prepare', inputs, expected)
        primordial = root/'primordial-private.json'
        with primordial.open('x') as out: out.write(prepared['primordialReserveJSON'])
        ledger = root/'fresh-reserve-genesis'
        proof['createdLedger'] = True; save()
        tool(p.genesis_command(binary_directory/'solana-genesis', ledger, manifest['validators'], expected['reserveAddress'], primordial, p.calibrated_hashes(audit)))
        proposed = json.loads(tool([str(binary_directory/'classic-genesis-audit-v2'), str(ledger)]))
        p.c.address(proposed['genesis'])
        if proposed['genesis'] in p.c.FORBIDDEN or proposed['genesis'] == manifest['genesis']: raise ValueError('FRESH_ISOLATED_RESERVE_GENESIS_REQUIRED')
        if p.audited_policy(proposed) != p.audited_policy(audit): raise ValueError('RESERVE_GENESIS_POLICY_DIFFERS')
        after_raw, after, after_sha = decode(ledger, proposed, expected['reserveAddress'])
        renamed = [{**row, 'address': expected['reserveAddress']} if row['address'] == old_reserve else row for row in before['accounts']]
        order = lambda rows: sorted(rows, key=lambda row: row['address'])
        if encoded(order(renamed)) != encoded(order(after['accounts'])) or before['nonAccountParametersSHA256'] != after['nonAccountParametersSHA256'] or any(encoded(order(before[field])) != encoded(order(after[field])) for field in ['stakeAccounts', 'voteAccounts']):
            raise ValueError('RESERVE_GENESIS_ALLOCATION_BYTES_DIFFER')
        review = {'planSHA256': expected['planSHA256'], 'baselineGenesis': manifest['genesis'], 'proposedGenesis': proposed['genesis'], 'totalNativeUnits': manifest['totalNativeUnits'], 'accountCount': expected['baselineAccountCount'], 'creationTimeChanged': before['creationTime'] != after['creationTime']}
        call('review', {**inputs, 'rawProposedDecoded': after_raw.decode('utf-8'), 'expectedProposedDecodedSHA256': hashlib.sha256(after_raw).hexdigest(), 'expectedProposedGenesis': proposed['genesis']}, review)
        proof['selectedReserveBytesReviewed'] = True; save()
        genesis = bundle/'genesis'; genesis.mkdir(mode=0o700)
        for name in ['genesis.bin', 'genesis.tar.bz2']:
            with (genesis/name).open('xb') as out: out.write(p.c.regular(ledger/name).read_bytes())
        if p.c.host.sha(genesis/'genesis.bin') != after_sha: raise ValueError('DECODED_GENESIS_CHANGED_BEFORE_REPLAY')
        archive_sha = p.c.host.sha(genesis/'genesis.tar.bz2')
        replays = []
        for i in range(2):
            target = root/('slot-zero-replay-'+str(i))
            p.c.genesis_archive.materialize(genesis/'genesis.tar.bz2', target, archive_sha, after_sha)
            commands = p.replay_commands(binary_directory/'agave-ledger-tool', target)
            bank = p.parse_bank(tool(commands[0]).decode(), proposed['genesis'])
            shred = p.parse_shred(tool(commands[1]).decode())
            if p.c.host.sha(genesis/'genesis.bin') != after_sha or p.c.host.sha(target/'genesis.bin') != after_sha or p.c.host.sha(genesis/'genesis.tar.bz2') != archive_sha: raise ValueError('GENESIS_CHANGED_DURING_REPLAY')
            replays.append({'bankHash': bank, 'shredVersion': shred})
        replay = p.combine_replays(replays, proposed['genesis'])
        keys = bundle/'keys'; keys.mkdir(mode=0o700)
        for i in range(3):
            name = 'node-'+str(i)+'-identity.json'
            with (keys/name).open('xb') as out: out.write(private_bytes(baseline/'keys'/name, 4096))
        final = {**manifest, **replay, 'genesis': proposed['genesis'], 'genesisBinSHA256': after_sha, 'genesisArchiveSHA256': archive_sha, 'inventorySHA256': p.c.inventory_hash(proposed['accounts'])}
        p.c.validate_audit(final, proposed)
        original, _ = p.c.check_bundle(baseline, binary_directory)
        if original != manifest or private_bytes(baseline/'manifest.json', 65536) != manifest_bytes or hashlib.sha256(p.genesis_snapshot(baseline/'genesis/genesis.bin')).hexdigest() != before_sha: raise ValueError('SELECTED_BASELINE_CHANGED')
        with (bundle/'manifest.json').open('xb') as out: out.write(encoded(final)+b'\n')
        checked, summary = p.c.check_bundle(bundle, binary_directory)
        if checked != final: raise ValueError('FINAL_BUNDLE_DIFFERS')
        proof.update(state='prepared', genesis=final['genesis'], completedSlotZeroReplays=2, sameSlotZeroHashesOnFreshCopies=True, manifestSHA256=p.c.host.sha(bundle/'manifest.json'), audit=summary)
    except BaseException as error:
        message = str(error)
        proof.update(state='failed', failureType=type(error).__name__, failureCode=message if type(error) is ValueError and re.fullmatch('[A-Z_]+', message) else 'PRIVATE_RESERVE_PREPARATION_FAILED')
    finally:
        signal.signal(signal.SIGTERM, previous)
        proof['createdLedger'] = (root/'fresh-reserve-genesis').is_dir()
        try: save()
        finally: os.umask(old_umask)
    return proof
