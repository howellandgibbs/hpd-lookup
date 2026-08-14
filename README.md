# @howellandgibbs/hpd-lookup

[![npm](https://img.shields.io/npm/v/@howellandgibbs/hpd-lookup?color=1c5d99)](https://www.npmjs.com/package/@howellandgibbs/hpd-lookup)
[![CI](https://github.com/howellandgibbs/hpd-lookup/actions/workflows/ci.yml/badge.svg)](https://github.com/howellandgibbs/hpd-lookup/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@howellandgibbs/hpd-lookup?color=1c5d99)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-1c5d99)](./package.json)

Look up NYC housing violations by address, and get them back in plain English.

New York City publishes every HPD housing violation as open data. It is technically public and practically unreadable — all-caps prose with the legal citation glued to the front:

```
§ 27-2005 ADM CODE REPAIR THE BROKEN OR DEFECTIVE PLASTERED SURFACES AND
PAINT IN A UNIFORM COLOR AT EAST AND WEST WALLS IN THE 2ND ROOM FROM NORTH
LOCATED AT APT 4B, 1ST STORY
```

This package turns that into:

> **Open — landlord has not fixed it yet** · Class B: Hazardous
> Repair the broken or defective plastered surfaces and paint in a uniform color at east and west walls in the 2nd room from north
> *Located at Apt 4B, 1st story*

The parser is the point. The lookup is the easy half.

- Zero runtime dependencies
- ESM + CJS, with TypeScript types
- Works in Node 18+, Deno, Bun, and the browser
- Ships an embeddable `<hpd-lookup>` web component, no framework required
- MIT licensed

**[Try it →](https://hpd-lookup.howellandgibbs.com)**

## Install

```bash
npm install @howellandgibbs/hpd-lookup
```

## Quickstart

```ts
import { lookupByAddress } from '@howellandgibbs/hpd-lookup';

const { building, violations } = await lookupByAddress('654 Park Place, Brooklyn', {
  states: ['open'],
});

console.log(building.bbl); // '3012380016'

for (const v of violations) {
  console.log(`${v.status.label} — ${v.description}`);
}
```

## API

### `lookupByAddress(address, options?)`

Resolves a free-text NYC address to a building, then fetches and parses its violations.

Returns `{ bbl, building, alternatives, violations }`. `alternatives` holds the other address matches, so a UI can offer a disambiguation step without a second request. Throws an `HpdLookupError` with code `address_not_found` when no candidate resolves to a BBL.

### `lookupByBBL(bbl, options?)`

Same, for a building you have already identified. Takes a 10-digit Borough-Block-Lot. Returns `{ bbl, violations }`.

### `searchAddresses(address, options?)`

Just the geocoding step. Returns the matching buildings, best match first, dropping candidates with no BBL (intersections, parks, some new construction).

### `parseViolation(raw)`

Turns one raw Socrata record into a `ParsedViolation`. Pure, synchronous, no network and no DOM — safe to run over a dataset you already have.

```ts
{
  id: '12345',
  description: 'Repair the broken plaster',
  location: 'Located at Apt 4B',
  status: { label: 'Open — landlord has not fixed it yet', state: 'open', raw: 'VIOLATION OPEN', known: true },
  class: 'C',
  severity: 'Immediately hazardous',
  rentImpairing: true,
  apartment: '4B',
  inspectionDate: '2026-08-02T00:00:00.000',
  bbl: '3038250043',
  raw: { /* the original record, nothing dropped */ }
}
```

### `translateStatus(rawStatus)`

Translates one HPD status code. Returns `{ label, state, raw, known }`, where `state` is `'open' | 'closed' | 'dismissed'` and `known` is `false` when the label was derived heuristically rather than mapped.

### `cleanDescription(rawDescription)`

The citation stripper on its own. Returns `{ main, location }`.

## The widget

If you want the whole thing — an address box, autocomplete, and rendered results — import the widget entry point. It registers `<hpd-lookup>` as a custom element.

```html
<script type="module">
  import '@howellandgibbs/hpd-lookup/widget';
</script>

<hpd-lookup label="NYC address" states="open"></hpd-lookup>
```

It is a plain custom element with no framework runtime, because it is meant to be embedded in someone else's page. The core package stays DOM-free, so importing `@howellandgibbs/hpd-lookup` in Node never pulls any of this in.

### Attributes

| Attribute | Description |
| --- | --- |
| `address` | Prefill the input |
| `auto` | Look up the prefilled address on connect, without waiting for a submit |
| `states` | Comma-separated `open`, `closed`, `dismissed` |
| `classes` | Comma-separated HPD classes `A`, `B`, `C`, `I` |
| `limit` | Max records to request |
| `app-token` | Socrata app token, which raises the rate limit |
| `label` | Override the input label text |

### Events

Both bubble, and carry the same objects the functions return.

```js
document.querySelector('hpd-lookup').addEventListener('hpd-results', (event) => {
  const { building, violations } = event.detail;
});

document.querySelector('hpd-lookup').addEventListener('hpd-error', (event) => {
  const { error } = event.detail; // an HpdLookupError
});
```

There is also a `search(address)` method, if you would rather drive it from your own UI.

### Theming

Every color, font, and radius is a CSS custom property set on the host, so you never have to override a selector inside the shadow root:

```css
hpd-lookup {
  --hpd-font: "Your Face", sans-serif;
  --hpd-accent: #7c3aed;
  --hpd-radius: 2px;
  --hpd-open: #b91c1c;
}
```

Light and dark palettes are both defined; dark follows `prefers-color-scheme` unless you override the tokens yourself.

### Accessibility

The input is a labelled combobox: arrow keys move through suggestions with `aria-activedescendant` tracking the highlight, Enter selects, Escape closes. Result counts and errors are announced through a persistent `role="status"` live region. Focus is always visible, and `prefers-reduced-motion` is respected. It has been checked at 375px wide in both color schemes.

Errors are written as sentences someone can act on — "No NYC building matched that address. Try adding the borough." — rather than surfaced as codes.

### Options

| Option | Type | Default | Applies to |
| --- | --- | --- | --- |
| `appToken` | `string` | none | all requests |
| `signal` | `AbortSignal` | none | all requests |
| `fetch` | `typeof fetch` | global | all requests |
| `timeoutMs` | `number` | `15000` | all requests |
| `limit` | `number` | `1000` | violation lookups |
| `states` | `ViolationState[]` | all | violation lookups |
| `classes` | `ViolationClass[]` | all | violation lookups |
| `since` | `string` (ISO date) | none | violation lookups |
| `maxSuggestions` | `number` | `5` | address lookups |

### Errors

Every failure is an `HpdLookupError` with a `code`, so one `catch` handles all of them:

```ts
import { isHpdLookupError, lookupByAddress } from '@howellandgibbs/hpd-lookup';

try {
  await lookupByAddress('100 Gold St');
} catch (err) {
  if (isHpdLookupError(err)) {
    switch (err.code) {
      case 'address_not_found': /* ask for a more specific address */ break;
      case 'upstream_error':    /* err.status has the HTTP status */ break;
      case 'network_error':
      case 'aborted':
      case 'malformed_response':
      case 'invalid_input':     break;
    }
  }
}
```

## How the parsing works

**Citation stripping.** HPD descriptions open with a legal citation in no consistent format. Rather than trying to match every citation variant the city has ever emitted, the parser walks the description word by word and cuts at the first HPD action verb (`repair`, `abate`, `exterminate`, and about sixty others). If no verb appears, it cuts at the first substantive word after citation material. If neither fires, it returns the description whole — it never truncates on a guess.

**Status translation.** HPD emits 23 distinct status codes. Each one maps to a hand-written plain-English label, and to an `open` / `closed` / `dismissed` state taken from HPD's own `violationstatus` flag rather than from the wording. That distinction matters: `INVALID CERTIFICATION` and `FALSE CERTIFICATION` both sound like the violation went away, but they mean the landlord said the work was done and HPD disagreed — the violation is still open.

**Sentence casing.** Lowercasing all-caps prose mangles the agency acronyms and unit numbers that make a violation citable, so the caser restores `HPD`, `HMC`, `MDL` and about forty others, and puts `APT 4b` back as `Apt 4B`.

## Live data caveats

This package reads two public APIs at request time. Neither is under our control.

- **[NYC Planning Labs GeoSearch](https://geosearch.planninglabs.nyc/docs/)** — address to BBL. No key required.
- **[NYC Open Data / Socrata `wvxf-dwi5`](https://data.cityofnewyork.us/Housing-Development/Housing-Maintenance-Code-Violations/wvxf-dwi5)** — HPD Housing Maintenance Code Violations. The dataset ID is pinned in source, because Socrata IDs are stable while dataset names are not.

**Rate limits.** Socrata throttles unauthenticated requests by IP and does not publish the exact threshold. A [free app token](https://dev.socrata.com/docs/app-tokens) raises it considerably; pass it as `appToken`. A throttled request comes back as an `HpdLookupError` with `code: 'upstream_error'` and `status: 429`.

**Freshness.** HPD violation data updates daily, and a violation's status can lag the physical reality of the building by weeks.

**Not legal advice.** Plain-English labels are a translation, not a legal opinion. For a repair case, check the violation ID against HPD's own records.

## Origin

Extracted from [tenant-triage-nyc](https://github.com/howellandgibbs/tenant-triage-nyc), a free guide for NYC tenants dealing with bad landlords. The lookup there needed a parser; the parser turned out to be the reusable part.

## More

- [Architecture and design decisions](./docs/architecture.md) — how the citation stripping and status translation actually work, and what the package deliberately does not do
- [Contributing](./CONTRIBUTING.md) — the most useful contribution is a violation description that parses badly
- [Changelog](./CHANGELOG.md)

## License

MIT © Howell & Gibbs
