import copy
import json
import unittest
import reserve_adapter_result as m

# Public deterministic synthetic selections; no keys or compiled genesis.
BASELINE = '11111111111111111111111111111112'
PROPOSED = '11111111111111111111111111111113'
RESERVE = '11111111111111111111111111111114'


def selection(mode):
    common = dict(planSHA256='ab'*32, baselineGenesis=BASELINE, totalNativeUnits=str(m.U64))
    if mode == 'prepare':
        return dict(common, baselineAccountCount=2, reserveAddress=RESERVE, reserveNativeUnits=str(m.U64 - 1))
    return dict(common, proposedGenesis=PROPOSED, accountCount=2, creationTimeChanged=False)


def fixture(mode):
    expected = selection(mode)
    result = dict(expected, schemaVersion=1, state=m.STATES[mode], scope=m.SCOPES[mode], unchangedAccountCount=1)
    result.update({key: False for key in m.FLAGS})
    result.update({key: True for key in m.TRUE_FIELDS[mode]})
    if mode == 'prepare':
        result['primordialReserveJSON'] = json.dumps({RESERVE: dict(balance=m.U64-1, owner=m.SYSTEM, data='~', executable=False)})+'\n'
    return result


class ReserveResult(unittest.TestCase):
    def validate(self, result, mode='prepare', expected=None):
        return m.validate_result(json.dumps(result).encode(), mode=mode, selection=selection(mode) if expected is None else expected)

    def refuses(self, raw, mode='prepare', expected=None):
        with self.assertRaisesRegex(ValueError, '^SELECTED_RESERVE_RESULT_REFUSED$'):
            m.validate_result(raw, mode=mode, selection=selection(mode) if expected is None else expected)

    def test_large_integer_compiler_input_and_both_modes(self):
        for mode in ['prepare', 'review']:
            result = fixture(mode)
            self.assertEqual(self.validate(result, mode), result)
        for amount in [0, 2**53+1, m.U64]:
            result = fixture('prepare'); expected = selection('prepare')
            expected['reserveNativeUnits'] = result['reserveNativeUnits'] = str(amount)
            account = json.loads(result['primordialReserveJSON']); account[RESERVE]['balance'] = amount
            result['primordialReserveJSON'] = json.dumps(account)
            self.assertEqual(self.validate(result, expected=expected), result)

    def test_missing_extra_and_duplicate_fields(self):
        for mode in ['prepare', 'review']:
            result = fixture(mode)
            for key in result:
                missing = copy.deepcopy(result); del missing[key]
                with self.subTest(mode=mode, missing=key):self.refuses(json.dumps(missing).encode(), mode)
            extra = dict(result, unexpected='private value'); self.refuses(json.dumps(extra).encode(), mode)
            raw = json.dumps(result).encode()
            self.refuses(b'{"schemaVersion":1,'+raw[1:], mode)
            self.refuses(b'{"schema\\u0056ersion":1,'+raw[1:], mode)

    def test_permissions_require_literal_false_and_assertions_literal_true(self):
        for mode in ['prepare', 'review']:
            for key in m.FLAGS:
                for value in [True, 0, None, 'false', []]:
                    result = fixture(mode); result[key] = value
                    with self.subTest(mode=mode, field=key, value=value):self.refuses(json.dumps(result).encode(), mode)
            for key in m.TRUE_FIELDS[mode]:
                for value in [False, 1, 'true', None]:
                    result = fixture(mode); result[key] = value; self.refuses(json.dumps(result).encode(), mode)

    def test_independent_selection_mismatches(self):
        changes = {'planSHA256':'cd'*32, 'baselineGenesis':PROPOSED, 'totalNativeUnits':str(m.U64-2),
                   'baselineAccountCount':3, 'reserveAddress':PROPOSED, 'reserveNativeUnits':'1',
                   'proposedGenesis':RESERVE, 'accountCount':3, 'creationTimeChanged':True}
        for mode in ['prepare', 'review']:
            for key in m.SELECTED[mode]:
                result = fixture(mode); result[key] = changes[key]
                with self.subTest(mode=mode, mismatch=key):self.refuses(json.dumps(result).encode(), mode)
                expected = selection(mode); expected[key] = changes[key]
                self.refuses(json.dumps(fixture(mode)).encode(), mode, expected)

    def test_bad_selection_is_not_accepted_even_if_output_agrees(self):
        bad = {'planSHA256':['AB'*32, 1, '0'*63], 'baselineGenesis':['1'*31, '1'*33, 'z'*44, '0'*32],
               'totalNativeUnits':['01', '-1', str(m.U64+1), 1, True], 'baselineAccountCount':[True, 0, 4097, 2.0],
               'reserveAddress':['private value', '1'*45], 'reserveNativeUnits':['1e9', '-0', str(m.U64+1)],
               'proposedGenesis':[BASELINE, '0'*32], 'accountCount':[True, 0, 4097], 'creationTimeChanged':[0, 1, 'false']}
        for mode in ['prepare', 'review']:
            for key in m.SELECTED[mode]:
                for value in bad[key]:
                    expected = selection(mode); expected[key] = value
                    result = fixture(mode); result[key] = value
                    with self.subTest(mode=mode, field=key, value=value):self.refuses(json.dumps(result).encode(), mode, expected)
            self.refuses(json.dumps(fixture(mode)).encode(), mode, {})
            self.refuses(json.dumps(fixture(mode)).encode(), mode, dict(selection(mode), extra=1))
        self.refuses(b'{}', mode='other'); self.refuses(b'{}', mode=[])

    def test_primordial_schema_amount_and_account_identity(self):
        valid = json.loads(fixture('prepare')['primordialReserveJSON'])
        bad = [{}, {PROPOSED:valid[RESERVE]}, {**valid, PROPOSED:valid[RESERVE]}, []]
        for key, values in {'balance':[str(m.U64-1), m.U64, 0, True, None, 1.0], 'owner':[PROPOSED, None], 'data':['', 'AA==', None], 'executable':[True, 0, None]}.items():
            for value in values:
                obj = copy.deepcopy(valid); obj[RESERVE][key] = value; bad.append(obj)
        for key in valid[RESERVE]:
            obj = copy.deepcopy(valid); del obj[RESERVE][key]; bad.append(obj)
        obj = copy.deepcopy(valid); obj[RESERVE]['rentEpoch']=0; bad.append(obj)
        for obj in bad:
            result = fixture('prepare'); result['primordialReserveJSON'] = json.dumps(obj)
            self.refuses(json.dumps(result).encode())
        for inner in ['{"'+RESERVE+'":{"balance":1,"balance":'+str(m.U64-1)+',"owner":"'+m.SYSTEM+'","data":"~","executable":false}}',
                      '{"'+RESERVE+'":{},"'+RESERVE+'":'+json.dumps(valid[RESERVE])+'}', '\ud800', '[]', '{} trailing']:
            result = fixture('prepare'); result['primordialReserveJSON'] = inner
            self.refuses(json.dumps(result).encode())

    def test_numeric_tokens_encoding_depth_and_size(self):
        raw = json.dumps(fixture('prepare')).encode()
        for replacement in [b'true', b'1.0', b'1e0', b'-0', b'NaN', b'Infinity', b'1'+b'0'*5000]:
            self.refuses(raw.replace(b'"schemaVersion": 1', b'"schemaVersion": '+replacement))
        for malformed in [b'', b'\xff', b'\xef\xbb\xbf'+raw, raw+b'{}', b'['*1500+b']'*1500, b' '*m.MAX_OUTPUT_BYTES+b'x', bytearray(raw), raw.decode()]:self.refuses(malformed)
        for field in ['state', 'scope']:
            result = fixture('prepare'); result[field] = 'unselected'; self.refuses(json.dumps(result).encode())
        for count in [0, 2, True, 1.0]:
            result = fixture('prepare'); result['unchangedAccountCount'] = count; self.refuses(json.dumps(result).encode())

    def test_primordial_numeric_tokens_and_exact_output_bound(self):
        result = fixture('prepare'); expected = selection('prepare')
        result['reserveNativeUnits'] = expected['reserveNativeUnits'] = '0'
        for token in ['-0', '0.0', '0e0', 'NaN', 'Infinity', str(m.U64+1)]:
            result['primordialReserveJSON'] = '{"'+RESERVE+'":{"balance":'+token+',"owner":"'+m.SYSTEM+'","data":"~","executable":false}}'
            self.refuses(json.dumps(result).encode(), expected=expected)
        raw = json.dumps(fixture('prepare')).encode()
        padded = raw + b' '*(m.MAX_OUTPUT_BYTES-len(raw))
        self.assertEqual(m.validate_result(padded, mode='prepare', selection=selection('prepare')), fixture('prepare'))
        self.refuses(padded+b' ')

    def test_review_creation_time_and_prepare_balance_bounds(self):
        result = fixture('review'); expected = selection('review')
        result['creationTimeChanged'] = expected['creationTimeChanged'] = True
        self.assertEqual(self.validate(result, 'review', expected), result)
        result = fixture('prepare'); expected = selection('prepare')
        result['totalNativeUnits'] = expected['totalNativeUnits'] = '1'
        self.refuses(json.dumps(result).encode(), expected=expected)
        result = fixture('prepare'); expected = selection('prepare')
        result['baselineAccountCount'] = expected['baselineAccountCount'] = 1
        result['unchangedAccountCount'] = 0
        self.assertEqual(self.validate(result, expected=expected), result)
        result['baselineAccountCount'] = expected['baselineAccountCount'] = 4096
        result['unchangedAccountCount'] = 4095
        self.assertEqual(self.validate(result, expected=expected), result)

if __name__ == '__main__':unittest.main()
