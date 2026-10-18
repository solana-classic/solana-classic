"""Disposable selected-preparer fixture with actual Node adapter subprocesses.

Only a test harness: host, compiler, decoder and bundle-inspection responses are
supplied by reserve_preparation_test. Production runtime pins are never edited.
"""
import hashlib, json, subprocess, sys
from pathlib import Path
from unittest.mock import patch
import reserve_preparation_test as fixture


def run(node, bundle):
    m = fixture.m
    actual_run = m.adapter.run_validated
    actual_artifact = m.adapter.artifact
    pins = {name: {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size} for name,path in [('node',node),('bundle',bundle)]}
    source = Path(__file__).resolve().parent
    # Generate externally selected expectations through the source planner,
    # separately from the bundled adapter's later prepare/review stdout.
    planner = """
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const directory=process.argv[1];
const {planPrefundedReserve}=await import(pathToFileURL(directory+'/reserve-prefund-plan.mjs'));
const {genesisInventoryMetadataDigest}=await import(pathToFileURL(directory+'/genesis-custody.mjs'));
const {PublicKey}=await import('@solana/web3.js');
const key=n=>{const b=Buffer.alloc(32);b.writeUInt32BE(n,28);return new PublicKey(b).toBase58();};
const audit=JSON.parse(readFileSync(0,'utf8'));
const planningInput={schemaVersion:1,environment:'isolated-rehearsal',genesisAudit:audit,expectedGenesis:audit.genesis,expectedInventorySHA256:genesisInventoryMetadataDigest(audit),reserveAddress:key(500),bridgeProgram:key(50),bridgeId:key(60),originMint:key(70),originDecimals:6,nativeDecimals:9,originSupplyUnits:'1000000000',prelockedOriginUnits:'1004',protectedReserveNativeUnits:'1002240'};
const plan=planPrefundedReserve(planningInput);
console.log(JSON.stringify({planningInput,prepareSelection:{planSHA256:plan.planSHA256,baselineGenesis:plan.baselineGenesis,totalNativeUnits:plan.totalNativeUnits,baselineAccountCount:plan.accountCount,reserveAddress:plan.reserveAddress,reserveNativeUnits:plan.proposedReserve.lamports}}));
"""
    selections=[];calls=[]
    def select(audit):
        result=subprocess.run([str(node),'--input-type=module','-e',planner,str(source)],input=m.encoded(audit),capture_output=True,cwd=source.parent,env={},timeout=20,check=True)
        assert result.stderr==b''
        selected=json.loads(result.stdout);selections.append(selected['prepareSelection'])
        return selected
    def invoke(mode, kwargs):
        # Restore real artifact checking inside the surrounding orchestration
        # fixture's mock. Use the actual test Node/bundle selection explicitly;
        # this does not admit them through production host/runtime policy.
        with patch.object(m.adapter,'artifact',actual_artifact):
            try:
                result=actual_run(node,bundle,mode=mode,input_bytes=kwargs['input_bytes'],input_sha256=kwargs['input_sha256'],selection=kwargs['selection'],log=kwargs['log'],node_sha256=pins['node']['sha256'],node_bytes=pins['node']['bytes'],bundle_sha256=pins['bundle']['sha256'],bundle_bytes=pins['bundle']['bytes'])
            except ValueError as error:
                calls.append({'mode':mode,'state':'refused','code':str(error)})
                raise
        calls.append({'mode':mode,'state':'accepted','resultSHA256':hashlib.sha256(m.encoded(result)).hexdigest()})
        return result
    rows=[]
    for failure in [None,'prepare-refusal','review-refusal']:
        before=len(calls)
        result=fixture.ReservePreparation().exercise(failure,integration={'select':select,'run':invoke})
        rows.append({'case':failure or 'complete','result':result,'calls':calls[before:]})
    assert [row['result']['state'] for row in rows]==['prepared','failed','failed']
    assert [row['result']['compilerCalls'] for row in rows]==[1,0,1]
    assert [row['result']['replayCalls'] for row in rows]==[4,0,0]
    assert len(calls)==5 and all(row['result']['baselineUnchanged'] for row in rows)
    assert all(row['result']['failureCode']=='SELECTED_RESERVE_PROCESS_REFUSED' for row in rows[1:])
    return {'passed':True,'cases':rows,'realAdapterInvocations':len(calls),'plannerInvocations':len(selections),'artifacts':pins,'scope':'Actual bounded Node adapter with supplied host, compiler, decoder and replay responses; disposable synthetic baseline only','actualGenesisCompiled':False,'actualAccountBytesDecoded':False,'actualSlotZeroReplayExecuted':False,'hostAdmitted':False,'validatorsStarted':0,'productionReady':False}

if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Two selected test artifacts required')
    print(json.dumps(run(Path(sys.argv[1]).resolve(strict=True),Path(sys.argv[2]).resolve(strict=True))))
