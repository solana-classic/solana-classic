#!/usr/bin/env python3
"""Build an isolated SDK export-selection proposal; never edit or deploy the freeze."""
from pathlib import Path
import datetime, hashlib, json, os, re, shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
FREEZE_SHA = '55b668e56a946ec94f0195b03530aba23593bd71d7fd52493d5403b21882757f'
REPLACEMENTS = [
    ("const sdk = await import('@solana/web3.js'); wallet.current = sdk.Keypair.generate();", "const { Keypair, Connection } = await import('@solana/web3.js'); wallet.current = Keypair.generate();"),
    ('new sdk.Connection(API_BASE', 'new Connection(API_BASE'),
    ("const sdk = await import('@solana/web3.js');", "const { Keypair } = await import('@solana/web3.js');"),
    ('const signer = sdk.Keypair.generate();', 'const signer = Keypair.generate();'),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(attempt_id):
    if not re.fullmatch('frontend-sdk-[a-z0-9-]{8,80}', attempt_id):
        raise ValueError('EXPLICIT_NEW_FRONTEND_ATTEMPT_REQUIRED')
    freeze_path = ROOT / 'evidence/agave-source-candidate-freeze.json'
    if sha(freeze_path) != FREEZE_SHA: raise ValueError('SELECTED_FREEZE_CHANGED')
    freeze = json.loads(freeze_path.read_text())
    def frozen():
        for name, expected in freeze['coreFiles'].items():
            if sha(ROOT / '.tools/source-runtime-qa' / name) != expected:
                raise ValueError('RETAINED_SOURCE_CHANGED')
            if name.startswith(('apps/web/', 'packages/chain/', 'packages/config/')) or name in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']:
                if sha(ROOT / name) != expected: raise ValueError('BUILD_INPUT_CHANGED')
    frozen()
    attempt = ROOT / '.tools' / attempt_id
    attempt.mkdir(mode=0o700)  # Existing attempts, including failures, are never reused.
    result = {'schemaVersion': 1, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': False, 'scope': 'Isolated frontend dependency selection proposal, not a new admitted candidate', 'freezeSHA256': FREEZE_SHA, 'builderSHA256': sha(Path(__file__)), 'variants': {}, 'deployed': False, 'candidateAccepted': False, 'releaseAccepted': False}
    try:
        modules = ROOT / 'apps/web/node_modules'
        for variant in ['baseline', 'named']:
            overlay = attempt / variant
            overlay.mkdir()
            shutil.copytree(ROOT / 'apps/web/src', overlay / 'src')
            for name in ['package.json', 'index.html']:
                shutil.copyfile(ROOT / 'apps/web' / name, overlay / name)
            (overlay / 'node_modules').symlink_to(modules, target_is_directory=True)
            config = (ROOT / 'apps/web/vite.config.ts').read_text()
            target = 'build: { sourcemap: false }'
            if config.count(target) != 1: raise ValueError('EXPECTED_BUILD_CONFIG_REQUIRED')
            aliases = {name: str(modules / name) for name in ['react', 'react-dom', 'buffer']}
            config = config.replace(target, "resolve: { dedupe: ['react', 'react-dom'], alias: " + json.dumps(aliases) + ' }, ' + target)
            (overlay / 'vite.config.ts').write_text(config)
            playground = overlay / 'src/Playground.tsx'
            if variant == 'named':
                source = playground.read_text()
                for before, after in REPLACEMENTS:
                    if source.count(before) != 1: raise ValueError('EXPECTED_SDK_IMPORT_REQUIRED')
                    source = source.replace(before, after)
                playground.write_text(source)
            env = {k: v for k, v in os.environ.items() if not k.startswith('VITE_')}
            env.update(VITE_API_BASE_URL=freeze['candidate']['apiOrigin'], VITE_EXPECTED_GENESIS_HASH=freeze['genesis'])
            with (attempt / (variant + '-build.log')).open('xb') as log:
                subprocess.run(['python3', '-B', 'scripts/pnpm.py', 'exec', 'vite', 'build', str(overlay), '--config', str(overlay / 'vite.config.ts')], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
            outputs = sorted((overlay / 'dist').rglob('*'))
            files = {str(p.relative_to(overlay / 'dist')): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in outputs if p.is_file()}
            scripts = [p for p in outputs if p.suffix == '.js']
            defaults = [p.name for p in scripts if b'api.mainnet-beta.solana.com' in p.read_bytes()]
            if not scripts or bool(defaults) != (variant == 'baseline'):
                raise ValueError('SDK_DEFAULT_CONTROL_FAILED')
            result['variants'][variant] = {'playgroundSHA256': sha(playground), 'javascriptBytes': sum(p.stat().st_size for p in scripts), 'mainnetDefaultFiles': defaults, 'files': files}
        frozen()
        result['passed'] = True
        result['frozenFilesUnchanged'] = len(freeze['coreFiles'])
    except BaseException as error:
        result['failureType'] = type(error).__name__
        result['failureCode'] = str(error) if type(error) is ValueError and re.fullmatch('[A-Z_]+', str(error)) else 'ISOLATED_FRONTEND_BUILD_FAILED'
        raise
    finally:
        with (attempt / 'build-result.json').open('x') as out: out.write(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    if len(sys.argv) != 2: raise SystemExit('Supply a new frontend-sdk-... attempt identifier')
    proof = build(sys.argv[1])
    print(json.dumps({'passed': proof['passed'], 'variants': {k: {'javascriptBytes': v['javascriptBytes'], 'mainnetDefaultFiles': v['mainnetDefaultFiles']} for k, v in proof['variants'].items()}}))
