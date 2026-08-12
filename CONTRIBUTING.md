# Contributing

Thanks for looking. This is a small, deliberately narrow package, and the most
valuable contributions are usually not code.

## The most useful thing you can send

**A violation description that parses badly.** The citation stripper works on
about 7,000 real records that were audited by hand, but HPD writes these by
hand too, and there is always another format. If you find a description that
comes out wrong, open an issue with the raw `novdescription` string and the
violation ID. That is a complete bug report — no reproduction steps needed.

The same goes for a status code that gets the wrong plain-English label, or a
building where the address lookup fails.

## Running it

```bash
npm install
npm test          # 87 tests, no network
npm run typecheck
npm run build
npm run demo      # serves the demo at http://localhost:4173/demo/
```

Tests never hit the network. Address and violation responses are mocked, and
the parser fixtures in `test/fixtures/` are real records captured from the live
dataset, one or two per status code.

## Where things live

- `src/parse.ts` — the citation stripper and violation parser. The interesting
  part of this project.
- `src/status.ts` — HPD status codes mapped to plain English.
- `src/text.ts` — sentence casing that preserves agency acronyms and unit
  numbers.
- `src/geosearch.ts`, `src/violations.ts` — the two upstream APIs.
- `src/widget/` — the `<hpd-lookup>` custom element.

See [docs/architecture.md](./docs/architecture.md) for how the parsing actually
works and why it is built the way it is.

## Changing the parser

Parser changes need evidence, not just a passing test. If you change how
descriptions are cut, say how many real records the change affects and in which
direction. The pattern used so far: run old and new over a few thousand live
records, count what changed, and read every case that got *shorter* — those are
where content gets silently lost.

Add a regression test using the real string that motivated the change, and say
in a comment how it used to parse.

## Style

Match the surrounding code. Every public export has JSDoc with an example.
Comments explain why something is the way it is, especially where HPD's data
forced an odd decision — those comments are load-bearing.

## Code of conduct

By participating you agree to the [code of conduct](./CODE_OF_CONDUCT.md).
