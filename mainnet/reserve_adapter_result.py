"""Validate bounded reserve-adapter results against caller-selected expectations.

This checks the result contract, not decoder execution, artifact provenance,
backing, custody or host admission. Select expectations independently of stdout.
No file write, compiler invocation or activation is provided.
"""
import json
import re

MAX_OUTPUT_BYTES = 1024**2
U64 = (1 << 64) - 1
SYSTEM = '11111111111111111111111111111111'
BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
FLAGS = frozenset('actualFreshGenesisCompiled actualAccountBytesDecoded unchangedAccountBytesIndependentlyVerified preparerIntegrated reserveInitialized backingVerified custodyVerified fullValidatorConsensusVerified canPrepare canSign canBroadcast activationEnabled productionReady'.split())
COMMON = frozenset('planSHA256 baselineGenesis totalNativeUnits'.split())
SELECTED = {
    'prepare': COMMON | {'baselineAccountCount', 'reserveAddress', 'reserveNativeUnits'},
    'review': COMMON | {'proposedGenesis', 'accountCount', 'creationTimeChanged'},
}
STATES = {
    'prepare': 'SELECTED_OFFLINE_PREFUNDED_RESERVE_INPUT',
    'review': 'SUPPLIED_PREFUNDED_RESERVE_BYTE_FINGERPRINTS_MATCHED',
}
SCOPES = {
    'prepare': 'Exact isolated reserve compiler input bound to supplied selected decoder reports; no compiler invocation or host admission',
    'review': 'Comparison of externally selected supplied decoder reports; raw report selectors do not independently authenticate decoder execution or account history',
}
TRUE_FIELDS = {
    'prepare': frozenset(('suppliedBaselineFingerprintsSelected', 'requiresFreshCompiledOutputReview')),
    'review': frozenset(('nonAccountParametersMatched', 'suppliedAccountFingerprintsMatched', 'singleReserveAddressChangeMatched', 'requiresFreshActivationInventory')),
}


def require(condition):
    if not condition:
        raise ValueError()


def shape(value, fields):
    require(type(value) is dict and value.keys() == fields)


def address(value):
    require(type(value) is str and 32 <= len(value) <= 44)
    number = 0
    for character in value:
        require(character in BASE58)
        number = number * 58 + BASE58.index(character)
    leading = len(value) - len(value.lstrip('1'))
    require(leading + (number.bit_length() + 7) // 8 == 32)


def units(value):
    require(type(value) is str and re.fullmatch(r'(0|[1-9][0-9]{0,19})', value) is not None)
    result = int(value)
    require(result <= U64)
    return result


def strict_json(raw):
    require(type(raw) is bytes and 0 < len(raw) <= MAX_OUTPUT_BYTES)

    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result)
            result[key] = value
        return result

    def integer(token):
        require(re.fullmatch(r'(0|[1-9][0-9]{0,19})', token) is not None)
        value = int(token)
        require(value <= U64)
        return value

    def refused(_):
        raise ValueError()

    return json.loads(raw.decode('utf-8', errors='strict'), object_pairs_hook=pairs,
                      parse_int=integer, parse_float=refused, parse_constant=refused)


def validate_selection(mode, selection):
    """Validate and copy external expectations before starting a process."""
    try:
        require(type(mode) is str and mode in SELECTED)
        shape(selection, SELECTED[mode])
        selected = dict(selection)
        require(type(selected['planSHA256']) is str and re.fullmatch(r'[0-9a-f]{64}', selected['planSHA256']) is not None)
        address(selected['baselineGenesis'])
        total = units(selected['totalNativeUnits'])
        count_field = 'baselineAccountCount' if mode == 'prepare' else 'accountCount'
        count = selected[count_field]
        require(type(count) is int and 1 <= count <= 4096)
        if mode == 'prepare':
            address(selected['reserveAddress'])
            require(units(selected['reserveNativeUnits']) <= total)
        else:
            address(selected['proposedGenesis'])
            require(selected['proposedGenesis'] != selected['baselineGenesis'])
            require(type(selected['creationTimeChanged']) is bool)

        return selected
    except (ValueError, TypeError, KeyError, OverflowError):
        raise ValueError('SELECTED_RESERVE_RESULT_REFUSED') from None


def validate_result(raw, *, mode, selection):
    """Return a validated result or one fixed, path-free refusal.

    `selection` has exactly the mode's SELECTED fields, obtained from the
    separately selected plan and reports, never copied from this result.
    Raw report hashes are not emitted by the adapter and cannot be authenticated
    by this function; input selection and trusted execution remain necessary.
    """
    try:
        selected = validate_selection(mode, selection)
        count = selected['baselineAccountCount' if mode == 'prepare' else 'accountCount']

        result = strict_json(raw)
        fields = SELECTED[mode] | FLAGS | TRUE_FIELDS[mode] | {'schemaVersion', 'state', 'scope', 'unchangedAccountCount'}
        if mode == 'prepare':
            fields |= {'primordialReserveJSON'}
        shape(result, fields)
        require(type(result['schemaVersion']) is int and result['schemaVersion'] == 1)
        require(result['state'] == STATES[mode] and result['scope'] == SCOPES[mode])
        for key, value in selected.items():
            require(type(result[key]) is type(value) and result[key] == value)
        require(type(result['unchangedAccountCount']) is int and result['unchangedAccountCount'] == count - 1)
        for key in FLAGS:
            require(result[key] is False)
        for key in TRUE_FIELDS[mode]:
            require(result[key] is True)
        if mode == 'prepare':
            primordial = result['primordialReserveJSON']
            require(type(primordial) is str)
            accounts = strict_json(primordial.encode('utf-8', errors='strict'))
            shape(accounts, {selected['reserveAddress']})
            account = accounts[selected['reserveAddress']]
            shape(account, {'balance', 'owner', 'data', 'executable'})
            require(type(account['balance']) is int and account['balance'] == int(selected['reserveNativeUnits']))
            require(account['owner'] == SYSTEM and account['data'] == '~' and account['executable'] is False)
        return result
    except (ValueError, TypeError, KeyError, OverflowError, RecursionError):
        raise ValueError('SELECTED_RESERVE_RESULT_REFUSED') from None
