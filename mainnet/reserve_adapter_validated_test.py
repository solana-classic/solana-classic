import hashlib
import io
import json
import os
import unittest
from unittest.mock import patch
import reserve_adapter_process as m
from reserve_adapter_result_test import fixture, selection


class ValidatedReserveInvocation(unittest.TestCase):
    def setUp(self):
        self.input = b'{"private":"selected synthetic input"}'
        self.options = dict(node_sha256='ab'*32, node_bytes=100,
                            bundle_sha256='cd'*32, bundle_bytes=200,
                            mode='prepare', input_bytes=self.input,
                            input_sha256=hashlib.sha256(self.input).hexdigest(),
                            selection=selection('prepare'), log=io.BytesIO())

    def invoke(self, **changes):
        return m.run_validated('selected-runtime', 'selected-bundle', **{**self.options, **changes})

    def test_fixed_selection_and_validated_result_in_both_modes(self):
        for mode in ['prepare', 'review']:
            output=fixture(mode)
            with patch.object(m, 'run_selected', return_value=json.dumps(output).encode()) as run:
                self.assertEqual(self.invoke(mode=mode, selection=selection(mode)), output)
            args, kw = run.call_args
            self.assertEqual(args, ('selected-runtime', 'selected-bundle'))
            self.assertEqual(kw, {k:v for k,v in {**self.options, 'mode':mode}.items() if k not in ('input_sha256','selection')})

    def test_invalid_input_or_selection_refuses_before_artifact_reads(self):
        changes=[{'input_sha256':'0'*64}, {'input_sha256':'AB'*32}, {'input_sha256':None},
                 {'input_bytes':self.input+b' '}, {'input_bytes':bytearray(self.input)},
                 {'input_bytes':b''}, {'input_bytes':b'x'*(m.INPUT_BYTES+1)},
                 {'selection':{}}, {'selection':dict(selection('prepare'), reserveNativeUnits=True)},
                 {'mode':'--eval'}, {'mode':[]}]
        for change in changes:
            with self.subTest(fields=list(change)), patch.object(m, 'artifact') as artifact, patch.object(m.offline_process, 'run_tool') as run:
                with self.assertRaises(ValueError):self.invoke(**change)
                artifact.assert_not_called();run.assert_not_called()

    def test_canonical_service_and_public_genesis_refuse_before_reads(self):
        with patch.dict(os.environ, {'RAILWAY_SERVICE_ID':m.CANONICAL_SERVICE}), patch.object(m, 'artifact') as artifact:
            with self.assertRaisesRegex(ValueError, '^CANONICAL_SERVICE_FORBIDDEN$'):self.invoke()
            artifact.assert_not_called()
        for genesis in m.FORBIDDEN_GENESIS:
            for mode, field in [('prepare','baselineGenesis'), ('review','baselineGenesis'), ('review','proposedGenesis')]:
                chosen=selection(mode);chosen[field]=genesis
                with self.subTest(mode=mode, field=field), patch.object(m, 'artifact') as artifact:
                    with self.assertRaisesRegex(ValueError, '^ISOLATED_RESERVE_GENESIS_REQUIRED$'):self.invoke(mode=mode,selection=chosen)
                    artifact.assert_not_called()

    def test_result_failure_never_returns_unvalidated_output(self):
        cases=[b'{', b'{}', b'private diagnostic']
        for key,value in [('canPrepare',True), ('planSHA256','0'*64), ('reserveNativeUnits','1')]:
            row=fixture('prepare');row[key]=value;cases.append(json.dumps(row).encode())
        for raw in cases:
            with self.subTest(rawBytes=len(raw)),patch.object(m,'run_selected',return_value=raw):
                with self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_RESULT_REFUSED$'):self.invoke()

    def test_caller_mutation_during_process_cannot_change_expectations(self):
        original=fixture('prepare')
        def mutate(*args,**kwargs):
            self.options['selection']['planSHA256']='0'*64
            return json.dumps(original).encode()
        with patch.object(m,'run_selected',side_effect=mutate):self.assertEqual(self.invoke(),original)
        self.options['selection']=selection('prepare')
        def substitute(*args,**kwargs):
            self.options['selection']['planSHA256']='0'*64
            wrong=fixture('prepare');wrong['planSHA256']='0'*64
            return json.dumps(wrong).encode()
        with patch.object(m,'run_selected',side_effect=substitute):
            with self.assertRaisesRegex(ValueError,'^SELECTED_RESERVE_RESULT_REFUSED$'):self.invoke()

    def test_process_failure_or_cancellation_is_not_converted_to_success(self):
        for error in [ValueError('SELECTED_RESERVE_ARTIFACT_CHANGED'),ValueError('SELECTED_RESERVE_PROCESS_REFUSED'),KeyboardInterrupt()]:
            with patch.object(m,'run_selected',side_effect=error):
                with self.assertRaises(type(error)):self.invoke()

if __name__=='__main__':unittest.main()
