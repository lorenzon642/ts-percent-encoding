import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decode, decodeComponent, PercentEncodingError } from '../src/index.js';

test('decodes a simple ASCII string', () => {
  assert.equal(decode('hello%20world'), 'hello world');
});

test('decodes uppercase and lowercase hex alike', () => {
  assert.equal(decode('%2F%2f'), '//');
});

test('decodes a UTF-8 multi-byte sequence', () => {
  // "é" is U+00E9, encoded as C3 A9 in UTF-8.
  assert.equal(decode('caf%C3%A9'), 'café');
});

test('decodes a four-byte UTF-8 sequence', () => {
  // U+1F600 GRINNING FACE is F0 9F 98 80.
  assert.equal(decode('%F0%9F%98%80'), '\u{1F600}');
});

test('handles literal characters alongside escapes', () => {
  assert.equal(decode('a%20b'), 'a b');
});

test('handles a literal percent that is not an escape in lenient mode', () => {
  assert.equal(decode('100% sure', { strict: false }), '100% sure');
});

test('rejects a malformed escape in strict mode', () => {
  assert.throws(() => decode('bad%zz'), PercentEncodingError);
});

test('rejects a truncated escape in strict mode', () => {
  assert.throws(() => decode('bad%2'), PercentEncodingError);
});

test('rejects invalid UTF-8 byte sequences', () => {
  // 0xFF is never a valid UTF-8 leading byte.
  assert.throws(() => decode('%FF'), PercentEncodingError);
});

test('rejects a truncated UTF-8 sequence', () => {
  // C3 expects one continuation byte but the input ends.
  assert.throws(() => decode('%C3'), PercentEncodingError);
});

test('rejects an overlong UTF-8 encoding', () => {
  // C0 80 is an overlong encoding of NUL.
  assert.throws(() => decode('%C0%80'), PercentEncodingError);
});

test('reports the index of a malformed escape', () => {
  try {
    decode('ab%zz');
    assert.fail('expected a PercentEncodingError');
  } catch (err) {
    assert.ok(err instanceof PercentEncodingError);
    assert.equal(err.index, 2);
  }
});

test('decodeComponent decodes like decode', () => {
  assert.equal(decodeComponent('a%2Bb'), 'a+b');
});

test('decodeComponent rejects malformed escapes in strict mode', () => {
  assert.throws(() => decodeComponent('%'), PercentEncodingError);
});

test('rejects non-string input', () => {
  assert.throws(() => decode(42), TypeError);
});

test('decodes an empty string to an empty string', () => {
  assert.equal(decode(''), '');
});
