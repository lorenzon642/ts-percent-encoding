/**
 * Percent-encoding decoder for RFC 3986 strings.
 *
 * Design decision: this module decodes percent escapes into bytes and then
 * interprets the resulting byte sequence as UTF-8. RFC 3986 itself is
 * byte-oriented and does not mandate a character encoding, but in practice
 * percent-encoded values produced by browsers and servers are UTF-8. We
 * therefore always attempt a UTF-8 decode and surface malformed sequences
 * as errors instead of silently emitting replacement characters.
 *
 * Malformed escapes (a `%` not followed by two hex digits) are rejected by
 * default because silently passing them through hides corruption in the
 * input. Callers who need lenient behaviour can use `decodeComponent` with
 * `{ strict: false }`, which leaves the offending `%` untouched.
 */

/**
 * Error thrown when a percent-encoded input cannot be decoded.
 */
export class PercentEncodingError extends Error {
  /**
   * @param {string} message Human readable description of the failure.
   * @param {number} index Byte index in the input where the failure occurred.
   */
  constructor(message, index) {
    super(message);
    this.name = 'PercentEncodingError';
    this.index = index;
  }
}

const HEX = /^[0-9a-fA-F]$/;

/**
 * Convert a single hex digit character to its numeric value.
 *
 * @param {string} ch
 * @returns {number}
 */
function hexValue(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30; // 0-9
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10; // A-F
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10; // a-f
  return -1;
}

/**
 * Decode a UTF-8 byte sequence into a string, rejecting malformed input.
 *
 * We implement this inline rather than using TextDecoder so that the library
 * has no dependency on the host's decoding tables and behaves identically in
 * every JavaScript runtime. It also lets us report the exact byte offset of
 * a malformed sequence.
 *
 * @param {number[]} bytes
 * @returns {string}
 */
function decodeUtf8(bytes) {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let codePoint;
    let extra;
    if (b0 < 0x80) {
      codePoint = b0;
      extra = 0;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      codePoint = b0 & 0x1f;
      extra = 1;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      codePoint = b0 & 0x0f;
      extra = 2;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      codePoint = b0 & 0x07;
      extra = 3;
    } else {
      throw new PercentEncodingError(
        `Invalid UTF-8 leading byte 0x${b0.toString(16)} at byte ${i}`,
        i
      );
    }

    if (i + extra >= bytes.length) {
      throw new PercentEncodingError(
        `Truncated UTF-8 sequence at byte ${i}`,
        i
      );
    }

    for (let k = 1; k <= extra; k++) {
      const bk = bytes[i + k];
      if (bk < 0x80 || bk > 0xbf) {
        throw new PercentEncodingError(
          `Invalid UTF-8 continuation byte 0x${bk.toString(16)} at byte ${i + k}`,
          i + k
        );
      }
      codePoint = (codePoint << 6) | (bk & 0x3f);
    }

    // Reject overlong encodings and surrogates, which are not valid UTF-8.
    if (extra === 1 && codePoint < 0x80) {
      throw new PercentEncodingError(
        `Overlong UTF-8 sequence at byte ${i}`,
        i
      );
    }
    if (extra === 2 && codePoint < 0x800) {
      throw new PercentEncodingError(
        `Overlong UTF-8 sequence at byte ${i}`,
        i
      );
    }
    if (extra === 3 && codePoint < 0x10000) {
      throw new PercentEncodingError(
        `Overlong UTF-8 sequence at byte ${i}`,
        i
      );
    }
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new PercentEncodingError(
        `UTF-8 sequence encodes a surrogate at byte ${i}`,
        i
      );
    }
    if (codePoint > 0x10ffff) {
      throw new PercentEncodingError(
        `UTF-8 code point out of range at byte ${i}`,
        i
      );
    }

    out += String.fromCodePoint(codePoint);
    i += extra + 1;
  }
  return out;
}

/**
 * Decode a percent-encoded string.
 *
 * @param {string} input The percent-encoded string.
 * @param {{strict?: boolean}} [options]
 *   `strict` (default true) rejects malformed escapes. When false, a `%`
 *   that is not part of a valid escape is emitted literally.
 * @returns {string} The decoded string.
 * @throws {PercentEncodingError} On malformed escapes (strict mode) or
 *   invalid UTF-8 byte sequences.
 */
export function decode(input, options = {}) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }
  const strict = options.strict !== false;

  const bytes = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '%') {
      if (i + 2 >= input.length + 1 && i + 2 > input.length - 1) {
        // fall through to the hex checks below, which handle truncation
      }
      const hi = input[i + 1];
      const lo = input[i + 2];
      if (hi !== undefined && lo !== undefined && HEX.test(hi) && HEX.test(lo)) {
        bytes.push(hexValue(hi) * 16 + hexValue(lo));
        i += 2;
        continue;
      }
      if (strict) {
        throw new PercentEncodingError(
          `Malformed percent escape at index ${i}`,
          i
        );
      }
      // Lenient mode: the `%` is literal. It is ASCII, so push its byte.
      bytes.push(0x25);
      continue;
    }
    // Non-escape characters are copied as UTF-8 bytes. We encode the code
    // point rather than using charCodeAt so that astral characters are
    // handled correctly when they appear unescaped in the input.
    const codePoint = input.codePointAt(i);
    if (codePoint > 0xffff) {
      // Supplementary plane character: consume the low surrogate too.
      i++;
    }
    for (const byte of utf8Encode(codePoint)) {
      bytes.push(byte);
    }
  }

  return decodeUtf8(bytes);
}

/**
 * Encode a single Unicode code point as UTF-8 bytes.
 *
 * @param {number} codePoint
 * @returns {number[]}
 */
function utf8Encode(codePoint) {
  if (codePoint < 0x80) return [codePoint];
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }
  if (codePoint < 0x10000) {
    return [
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

/**
 * Decode a single percent-encoded component.
 *
 * This is a thin wrapper around `decode` that exists so callers can express
 * intent: a component is a value that should not contain structural
 * delimiters. The decoding rules are identical; the wrapper only documents
 * that the caller is decoding one component rather than a whole URI.
 *
 * @param {string} input
 * @param {{strict?: boolean}} [options]
 * @returns {string}
 */
export function decodeComponent(input, options = {}) {
  return decode(input, options);
}
