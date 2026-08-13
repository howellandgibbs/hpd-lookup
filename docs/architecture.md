# How this works, and why it exists

## Why it exists

New York City publishes every HPD housing violation as open data. Anyone can
download the whole dataset, and several good tools will show you the violations
on a building — JustFix's Who Owns What, Openigloo, HPD's own search.

The gap is not lookup. It is that the records themselves are close to unreadable:

```
§ 27-2005 ADM CODE REPAIR THE BROKEN OR DEFECTIVE PLASTERED SURFACES AND PAINT
IN A UNIFORM COLOR AT EAST AND WEST WALLS IN THE 2ND ROOM FROM NORTH LOCATED AT
APT 4B, 1ST STORY
```

All caps, with the legal citation fused to the front of the sentence, and a
status code beside it reading `NOV CERTIFIED LATE`. A tenant trying to work out
whether their landlord is on the hook for the mold in their bathroom has to
first work out what any of that means.

Every tool that displays this data has written some version of a parser to
clean it up, and none of them have published that parser on its own. This
package is that piece, extracted and made reusable. The lookup is the easy
half.

## The shape of the data

Two upstream sources, both free and both public:

- **[NYC Planning Labs GeoSearch](https://geosearch.planninglabs.nyc/docs/)** —
  turns a street address into a BBL (Borough-Block-Lot), the identifier
  everything else keys on.
- **[NYC Open Data dataset `wvxf-dwi5`](https://data.cityofnewyork.us/Housing-Development/Housing-Maintenance-Code-Violations/wvxf-dwi5)** —
  HPD Housing Maintenance Code Violations, served through Socrata.

The dataset ID is pinned in source rather than the name, because Socrata IDs are
stable and dataset titles are not.

## Citation stripping

Every violation description opens with a legal citation, and there is no
consistent format for it. Real examples from the live data:

```
§ 27-2005 ADM CODE …
HMC ADM CODE: § 27-2017.4 …
D26-10.01, 10.05 ADM CODE …
§ 27-2045(B)(1)(A) HMC, § 12-01, § 12-03 RCNY …
28 RCNY § 25-171; & 67 (7)(B) MDL; NYC FIRE CODE § 703.1.3; …
(A) § HMC:FILE …
```

Trying to match every citation format is a losing game. Instead the parser
walks the description word by word and cuts at the first HPD action verb —
`repair`, `abate`, `exterminate`, `provide`, and about sixty others. Violations
are instructions to a landlord, so they almost always contain one.

When no verb appears, it falls back to cutting at the first substantive word
after citation material has been seen. That covers descriptions like `OWNER
FAILED TO FILE A VALID REGISTRATION STATEMENT`, which is prose from the start.

If neither rule fires, the description is returned whole. The parser never
truncates on a guess — showing a citation is a much smaller failure than
silently dropping half of what the inspector wrote.

Two guards keep the fallback from firing inside a citation:

- Tokens of two letters or fewer are treated as shorthand rather than prose,
  because HPD sprinkles things like `AW` between the citation and the text.
- A section symbol or code-shaped number within the next three tokens means the
  citation is still running. Bare numbers do not count, since `40 WATTS` and
  `2 COATS` are ordinary description text.

Finally, an apartment or room clause is split off the end into its own field,
so a UI can show the instruction and the location separately.

## Status translation

HPD emits 23 distinct `currentstatus` values. Each maps to a hand-written
plain-English label.

The important part is not the wording, it is the state. Whether a violation is
open matters more than anything else on the record, and the status text is an
unreliable guide to it:

- `INVALID CERTIFICATION` and `FALSE CERTIFICATION` both sound resolved. They
  mean the landlord claimed the work was done and HPD disagreed, so the
  violation is still open. Together they cover about 59,000 records. A parser
  that keys on the word "invalid" gets the first of them exactly backwards —
  about 48,700 records — while landing on the right answer for the second
  purely because the word it matches on happens not to appear there. That is
  the argument for mapping codes explicitly rather than pattern-matching the
  text: the failure is silent, and so is the accidental success.
- `VIOLATION WILL BE REINSPECTED` is genuinely ambiguous — across the dataset it
  splits about 57/43 between closed and open. No amount of reading the string
  will tell you which.

So the open/closed determination comes from HPD's own `violationstatus` flag
rather than from the status text, and `parseViolation` applies it. A dismissal
is never overridden, because "dismissed" is a distinction that flag's two values
cannot express.

`translateStatus` on its own only sees a string, so it uses the dominant mapping
for each code and marks unrecognized codes with `known: false` — that flag is
there so a caller can hedge the wording rather than present a guess as fact.

HPD's spacing is also inconsistent in a way that matters:
`FIRST NO ACCESS TO RE- INSPECT VIOLATION` has a space after the hyphen while
`SECOND NO ACCESS TO RE-INSPECT VIOLATION` does not. Status keys are normalized
before lookup, because the original code matched only the unspaced form and
silently missed 325,000 records.

## Sentence casing

Lowercasing all-caps prose destroys the parts that make a violation citable, so
the caser restores about forty agency acronyms and legal codes (`HPD`, `HMC`,
`MDL`, `DOB`) and puts unit designators back (`APT 4b` becomes `Apt 4B`).

## What it deliberately does not do

- **No hosted API.** It calls the city's endpoints directly from wherever it
  runs. Nothing sits in between, and there is no service to keep up.
- **No caching layer.** A `RequestOptions.fetch` hook is provided so you can
  wrap requests with your own.
- **No legal interpretation.** Plain-English labels are a translation. For a
  repair case, check the violation ID against HPD's own records.

## Testing

87 tests, none of which touch the network. Upstream responses are mocked, and
the parser fixtures are real records captured from the live dataset covering
every status code.

Parser changes are evaluated against live data rather than intuition: run the
old and new implementations over several thousand real records, count what
changed, and read every case where the output got shorter, since that is where
content goes missing. The three bugs fixed during extraction were all found
this way.

## Origin

This came out of
[tenant-triage-nyc](https://github.com/howellandgibbs/tenant-triage-nyc), a free
guide for NYC tenants dealing with bad landlords. The lookup there needed a
parser, and the parser turned out to be the part worth sharing.
