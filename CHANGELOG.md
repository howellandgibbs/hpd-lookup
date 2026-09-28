# Changelog

All notable changes to this project are documented here. This project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-09-28

Lookups now return every violation on a building instead of stopping silently
at a fixed count. If you are on 1.1.0, upgrade: any building with more than
1,000 violations has been coming back incomplete, with nothing to say so.

### Fixed

- **Lookups silently stopped at a fixed number of records.** The library
  defaulted to 1,000 and the demo page to 50, and nothing said more existed.
  On 1593 Fulton Street, which has 3,029 violations, the demo showed 50 and
  announced "50 violations for 1593 FULTON STREET" — a false statement about a
  real building, in the direction that flatters the landlord. Lookups now
  paginate and return every record.
- **Offset paging was unstable.** Ordering on `inspectiondate` alone gives no
  stable order within a date, so paging with `$offset` returned some rows twice
  and skipped others. Measured on that same 3,029-violation building: five
  duplicated, five never returned. Ties now break on `violationid`.
- **The widget said "No violations on record" when a filter hid them.** With
  `states` or `classes` set, a building whose violations were all filtered out
  was reported as having none. It now says how many are on record.

### Added

- `total` and `truncated` on `lookupByBBL` and `lookupByAddress` results, and
  on the widget's `hpd-results` event. `total` counts records on file before any
  `states`/`classes` filter; `truncated` is true only when an explicit `limit`
  cut the fetch short.
- `PAGE_SIZE` export (1,000).

### Changed

- `limit` now defaults to fetching everything, up to a 50,000-record safety
  ceiling, instead of 1,000. Pass `limit` to cap a lookup. A large building
  now takes several sequential requests — about 4.5 seconds for 3,029 records.
- If any page fails, the whole lookup throws. Returning a partial list as though
  it were complete is the failure this release exists to fix.
- `DEFAULT_LIMIT` is deprecated and no longer affects behaviour. It is still
  exported so existing imports compile.

## [1.1.1-rc.0] — 2026-08-21

No changes to the published package. This prerelease exists to verify the
trusted-publishing workflow added in #10 against the real registry — the OIDC
handshake, the tag/`package.json` match, the ancestry check, and
`prepublishOnly` — without putting an unproven pipeline in charge of `latest`.

It publishes to the `next` dist-tag, so `npm i @howellandgibbs/hpd-lookup`
continues to resolve to 1.1.0. Nothing should install this deliberately.

## [1.1.0] — 2026-08-21

### Added

- `formatAddress()`, and a `displayLabel` field on `Building`, for putting a
  GeoSearch label on screen. GeoSearch returns the street shouted and the
  borough not — `1742 EAST 172 STREET, Bronx, NY, USA` — and there was no good
  way to display that. `toSentenceCase()` is the wrong tool: it exists for HPD
  prose, where a leading house number correctly leaves the next word alone, so
  running it on an address returns the whole thing lower case. `Building.label`
  still holds the upstream string verbatim.

  The formatter title-cases the shouted portion, keeps `NY` and `USA` upper,
  lowercases joining words mid-name (`1 Avenue of the Americas`) but not after
  the house number (`1 The Bowery`), and leaves house numbers, ranges,
  fractions, and ordinals alone. `McDonald Avenue` is handled; `Mac` names
  deliberately are not, because `MACON`, `MACY`, `MACE`, and `MACDOUGAL` all
  appear in the HPD data and no rule tells them apart.

  Checked against 1,200 distinct real street names from `wvxf-dwi5`: none came
  out still shouting, and none came out with an unintended lower-case word.

### Changed

- `<hpd-lookup>` shows `displayLabel` in the suggestion list and the result
  status. Lookups still run against the raw `label`, which is what GeoSearch
  returned and is therefore guaranteed to resolve.

### Note on the type change

`Building` gained a required field. Nothing that *reads* a `Building` is
affected, which is every normal use of it — but TypeScript code that builds one
by hand, most likely a test fixture, will need the new key. Called out here
rather than filed under Added, because a required field is the kind of thing
that should not be a surprise.

## [1.0.0] — 2026-08-14

First stable release. The public API is unchanged from `0.1.0`; this marks it as
settled and adds the widget.

### Added

- `<hpd-lookup>` web component, exported from `@howellandgibbs/hpd-lookup/widget`.
  A plain custom element with no framework runtime — address input, debounced
  autocomplete, keyboard navigation, and rendered results. Themed entirely
  through CSS custom properties.
- `hpd-results` and `hpd-error` events, plus a `search(address)` method, for
  driving the widget from your own UI.
- Typography theming tokens: `--hpd-font-display`, `--hpd-weight-strong`,
  `--hpd-label-transform`, and `--hpd-label-spacing`. Added after theming the
  widget to two real brand guides, one of which forbids bold body text — a rule
  a host cannot enforce from outside the shadow root without a token for it.
- Demo site at [hpd-lookup.howellandgibbs.com](https://hpd-lookup.howellandgibbs.com), with an
  example building per borough and a raw-versus-parsed comparison.

### Fixed

- `apartment` values that already contain "APT" no longer render as
  "Apt APT1RB".
- Pressing ArrowUp in the suggestion list with nothing highlighted now wraps to
  the last option rather than jumping to the first.

## [0.1.0] — 2026-08-03

Initial release, extracted from
[tenant-triage-nyc](https://github.com/howellandgibbs/tenant-triage-nyc).

### Added

- `lookupByAddress`, `lookupByBBL`, and `searchAddresses` for reading HPD
  violations from NYC Open Data and NYC Planning Labs GeoSearch.
- `parseViolation` and `cleanDescription`, which strip the legal citation from
  a violation description and split out the apartment location.
- `translateStatus`, covering all 23 status codes HPD emits, each mapped to a
  plain-English label and an `open` / `closed` / `dismissed` state.
- `HpdLookupError` with a `code` for every failure mode, so one `catch` handles
  network errors, rate limiting, malformed responses, and unmatched addresses.

### Notes on the extraction

The parser was verified byte-identical to the original `lookup.js` across 600
live records before any changes were made, then corrected in three places that
an audit of 6,996 records showed were wrong:

- Verbs joined to the citation by a colon were being dropped, so
  `HMC:FILE ANNUAL BEDBUG REPORT` lost its leading "File". This affected roughly
  7.5% of records.
- Two-letter HPD shorthand was read as prose, so `ADM CODE AW PROVIDE ADEQUATE
  LIGHTING` began "Aw provide adequate lighting".
- Cuts could land inside a run of citations, leaving later citations in the
  description text.

Status translation was rebuilt against the live dataset. The original map
covered 12 of 23 codes and two of its keys matched nothing. It also reported
`INVALID CERTIFICATION` as dismissed, when it means the landlord claimed a fix
and HPD rejected it — the violation is still open. That affected about 48,700
records. `FALSE CERTIFICATION` means the same thing and was landing on "open"
already, but only because the old heuristic happened to match neither of the
words it looked for. Both are mapped explicitly now, which is the point:
pattern-matching status text gets the right answer by luck until it doesn't.

[1.2.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v1.2.0
[1.1.1-rc.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v1.1.1-rc.0
[1.1.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v1.1.0
[1.0.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v1.0.0
[0.1.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v0.1.0
