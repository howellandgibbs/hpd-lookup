# Changelog

All notable changes to this project are documented here. This project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[1.0.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v1.0.0
[0.1.0]: https://github.com/howellandgibbs/hpd-lookup/releases/tag/v0.1.0
