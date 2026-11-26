# ts-percent-encoding

Decodes percent-encoded strings according to RFC 3986, handling mixed UTF-8
sequences and malformed escapes.

```js
import { decode, decodeComponent, PercentEncodingError } from 'ts-percent-encoding';

decode('caf%C3%A9');
// => 'café'

decode('a%20b%2Fc');
// => 'a b/c'

decodeComponent('100%25');
// => '100%'

try {
  decode('bad%zz');
} catch (err) {
  if (err instanceof PercentEncodingError) {
    console.error(err.message, err.index);
  }
}
```

## Why this exists

Most environments ship a `decodeURIComponent`, but its error behaviour is
inconsistent across runtimes: some throw `URIError`, some differ on whether
`%` alone is rejected, and the exact byte offset of a failure is not
reported. This library decodes percent escapes into bytes itself and then
applies a single, explicit UTF-8 decoder, so the same input produces the same
result everywhere and malformed input produces a `PercentEncodingError` with
the offending index.

The trade-off is strictness. RFC 3986 does not require a character encoding,
but in practice percent-encoded values are UTF-8. This library always treats
the decoded bytes as UTF-8 and rejects sequences that are not valid UTF-8,
rather than emitting replacement characters. If you need to pass through
arbitrary bytes, this is not the library for that.

## The awkward edge

A `%` that is not followed by two hex digits is an error in strict mode (the
default). Pass `{ strict: false }` to `decode` or `decodeComponent` to keep
such a `%` literally:

```js
import { decode } from 'ts-percent-encoding';

decode('100% sure', { strict: false });
// => '100% sure'
```

In lenient mode a lone `%` is still a byte in the output, so it participates
in UTF-8 decoding like any other ASCII character.

## API

- `decode(input, options?)` — decode a percent-encoded string. `options.strict`
  defaults to `true`. Throws `PercentEncodingError` on malformed escapes or
  invalid UTF-8.
- `decodeComponent(input, options?)` — same decoding rules, named for the case
  where the input is a single URI component.
- `PercentEncodingError` — error class with `message` and `index` properties.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

