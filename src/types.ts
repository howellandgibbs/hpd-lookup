/**
 * Public types for `@howellandgibbs/hpd-lookup`.
 *
 * The raw shapes mirror the upstream data sources as of 2026-08:
 *  - NYC Planning Labs GeoSearch v2 (address → BBL)
 *  - NYC Open Data / Socrata dataset `wvxf-dwi5` (HPD violations)
 *
 * Upstream fields are all optional and all strings, because Socrata
 * omits empty columns entirely rather than returning nulls.
 */

/**
 * A single HPD violation exactly as Socrata returns it.
 *
 * Field names follow the upstream columns, which are lowercase and
 * occasionally abbreviated (`boro`, not `borough`). The index signature is
 * deliberate: HPD adds columns without notice, and callers should be able to
 * read a new one before this package ships a type for it.
 */
export interface RawViolation {
  violationid?: string;
  buildingid?: string;
  registrationid?: string;
  boroid?: string;
  boro?: string;
  housenumber?: string;
  lowhousenumber?: string;
  highhousenumber?: string;
  streetname?: string;
  streetcode?: string;
  zip?: string;
  apartment?: string;
  story?: string;
  block?: string;
  lot?: string;
  bbl?: string;
  bin?: string;
  /** Violation class: A (non-hazardous), B (hazardous), C (immediately hazardous), I (information). */
  class?: string;
  inspectiondate?: string;
  approveddate?: string;
  originalcertifybydate?: string;
  originalcorrectbydate?: string;
  newcertifybydate?: string;
  newcorrectbydate?: string;
  certifieddate?: string;
  ordernumber?: string;
  novid?: string;
  novdescription?: string;
  novissueddate?: string;
  novtype?: string;
  currentstatus?: string;
  currentstatusid?: string;
  currentstatusdate?: string;
  /** HPD's own open/closed flag: "Open" or "Close". More reliable than `currentstatus`. */
  violationstatus?: string;
  /** "Y" when the violation is rent-impairing under MDL § 302-a. */
  rentimpairing?: string;
  communityboard?: string;
  councildistrict?: string;
  censustract?: string;
  nta?: string;
  latitude?: string;
  longitude?: string;
  [key: string]: unknown;
}

/** Where a violation lives in the state machine HPD actually uses. */
export type ViolationState = 'open' | 'closed' | 'dismissed';

/** A raw HPD status code translated into something a tenant can read. */
export interface TranslatedStatus {
  /** Plain-English status, e.g. "Open — landlord has not fixed yet". */
  label: string;
  /** Coarse bucket, useful for filtering and styling. */
  state: ViolationState;
  /** The upstream string this was translated from. */
  raw: string;
  /**
   * `true` when the raw status matched a known HPD status code.
   * `false` means the label was derived heuristically and may be rough.
   */
  known: boolean;
}

/** Severity language HPD uses for each violation class. */
export type ClassSeverity = 'Non-hazardous' | 'Hazardous' | 'Immediately hazardous' | 'Information';

/** HPD violation classes, with the severity language HPD uses for each. */
export type ViolationClass = 'A' | 'B' | 'C' | 'I';

/** A violation with the citation stripped and the prose made readable. */
export interface ParsedViolation {
  /** HPD's violation ID, or `null` if upstream omitted it. */
  id: string | null;
  /** The violation description in sentence case, citation removed. */
  description: string;
  /** Where in the building the problem is, when the description says. Empty string if not stated. */
  location: string;
  /** Plain-English status. */
  status: TranslatedStatus;
  /** Violation class letter, or `null` if upstream omitted it. */
  class: ViolationClass | null;
  /** Plain-English severity for the class, e.g. "Immediately hazardous". */
  severity: ClassSeverity | null;
  /**
   * `true` when HPD flagged this as rent-impairing under MDL § 302-a, which
   * is the class of condition that can support a rent-withholding claim.
   * `null` when upstream did not say.
   */
  rentImpairing: boolean | null;
  /** Apartment as reported by HPD, or `null`. */
  apartment: string | null;
  /** Inspection date as an ISO-8601 string, or `null`. */
  inspectionDate: string | null;
  /** BBL of the building, or `null`. */
  bbl: string | null;
  /** The original record, so callers never lose data the parser dropped. */
  raw: RawViolation;
}

/** A building matched by the address search. */
export interface Building {
  /** Borough-Block-Lot, the ID everything else keys off. */
  bbl: string;
  /** Building Identification Number, when GeoSearch has one. */
  bin: string | null;
  /** The full label GeoSearch returned, e.g. "100 GOLD STREET, Manhattan, NY, USA". */
  label: string;
  /**
   * {@link Building.label} in title case, ready to put on screen, e.g.
   * "100 Gold Street, Manhattan, NY, USA".
   *
   * GeoSearch upper-cases the street and not the borough, so the raw label is
   * not presentable as-is. `label` still holds it verbatim for anything that
   * needs to match upstream exactly.
   */
  displayLabel: string;
  borough: string | null;
  houseNumber: string | null;
  street: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Options shared by every network-touching function. */
export interface RequestOptions {
  /**
   * Socrata app token. Optional — the APIs work without one, but
   * unauthenticated requests share a much lower rate limit.
   * @see https://dev.socrata.com/docs/app-tokens
   */
  appToken?: string;
  /** Abort signal, forwarded to `fetch`. */
  signal?: AbortSignal;
  /** Custom fetch implementation, for tests or non-standard runtimes. */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds. Default 15000. Set to 0 to disable. */
  timeoutMs?: number;
}

/** Options for violation lookups. */
export interface ViolationLookupOptions extends RequestOptions {
  /** Max records to fetch from Socrata. Default 1000, upstream max 50000. */
  limit?: number;
  /** Only return violations in these states. Default: all. */
  states?: ViolationState[];
  /** Only return violations of these classes. Default: all. */
  classes?: ViolationClass[];
  /** Only return violations inspected on or after this ISO date. */
  since?: string;
}

/** Options for address lookups. */
export interface AddressLookupOptions extends ViolationLookupOptions {
  /** How many address candidates to request from GeoSearch. Default 5. */
  maxSuggestions?: number;
}

/** Result of an address lookup. */
export interface AddressLookupResult {
  /** BBL of the building we resolved the address to. */
  bbl: string;
  /** The full building record GeoSearch matched. */
  building: Building;
  /** Other buildings GeoSearch considered a match, best-first, excluding `building`. */
  alternatives: Building[];
  /** Parsed violations for `bbl`, newest inspection first. */
  violations: ParsedViolation[];
}

/** Result of a BBL lookup. */
export interface BBLLookupResult {
  bbl: string;
  /** Parsed violations for `bbl`, newest inspection first. */
  violations: ParsedViolation[];
}
